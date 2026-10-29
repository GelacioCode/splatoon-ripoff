import { networkInterfaces } from 'node:os';
import { Room, type Client, type Rewind, type StepContext } from '@colyseus/core';
import { StateView } from '@colyseus/schema';
import {
  ARENA,
  arenaFor,
  arenaSizeFor,
  buildSurfaces,
  cleanName,
  CONFIG,
  createFlag,
  createHill,
  createRng,
  DamageLog,
  decodePaintEvents,
  defaultMatchMinutes,
  DEFAULT_WEAPON,
  encodePaintEvents,
  encodePaintSnapshot,
  encodeShotEvents,
  generateLobbyCode,
  HILL_FREE,
  inputsToRun,
  isCaptureGoal,
  canSwitchTeam,
  isGameMode,
  isTeamPalette,
  isTeamPick,
  isMatchLength,
  matchResult,
  MatchState,
  MSG_CAPTURE_GOAL,
  MSG_CHOOSE_WEAPON,
  MSG_FLAG,
  MSG_GAME_MODE,
  MSG_HIT,
  MSG_KICK,
  MSG_KICKED,
  MSG_LAN_ADDRESSES,
  MSG_MATCH_LENGTH,
  MSG_PAINT,
  MSG_PAINT_SNAPSHOT,
  MSG_PICK_TEAM,
  MSG_PING,
  MSG_PLAY_AGAIN,
  MSG_PONG,
  MSG_REQUEST_LAN,
  MSG_REQUEST_PAINT,
  MSG_SET_BOTS,
  MSG_SET_LOOK,
  MSG_SHOTS,
  MSG_SPLAT,
  MSG_START,
  MSG_SWITCH_TEAM,
  MSG_TEAM_COLORS,
  MSG_TEAM_NEWS,
  MultiKillTracker,
  NetInput,
  NetPlayer,
  nextPhase,
  PaintGrid,
  parseGameMode,
  parseLook,
  parsePhase,
  parseStageMode,
  parseWeaponChoice,
  phaseSeconds,
  pickStageMode,
  randomLook,
  randomMiddleSpot,
  seedFromString,
  shotEventOf,
  shuffleTeams,
  smallerTeam,
  stepFlag,
  stepHill,
  teamsWithPicks,
  WEAPON_KINDS,
  type Flag,
  type FlagEvent,
  type FlagPlayer,
  type Hill,
  type HillEvent,
  type HillPlayer,
  type StageMode,
  type TeamNews,
  newLayoutSeed,
  type MapDef,
  type MatchJoinOptions,
  type MatchResult,
  type MatchPhase,
  type PaintEvent,
  type SplatEvent,
  type TeamBalancer,
  type Vec3,
} from '@paint-rush/shared';
import {
  applyShotDamage,
  createPlayerState,
  respawnSeconds,
  frozenInput,
  isVulnerable,
  PhysicsWorld,
  playerHitSphere,
  segmentHitsSphere,
  setWeapon,
  stepLife,
  stepPlayer,
  stepProjectiles,
  stepWeapon,
  type Collider,
  type PlayerInput,
  type Projectile,
} from '@paint-rush/shared/sim';
import { createBotMind, think, type BotMind } from '../bots/botBrain';
import { botViewOf } from '../bots/botView';
import { TickStats } from '../perf/tickStats';

/** Falling below this height puts a player back on their team's spawn pad. */
const RESPAWN_BELOW_Y = -10;
/** Bots only look for enemies this close (m); they shoot at 18 m. */
const BOT_SIGHT = 22;
/** Bots look from (and at) this height above the feet (m). */
const BOT_EYE = 0.9;

/** A server-played bot's brain: its habits, and its own dice. */
interface Bot {
  mind: BotMind;
  random: () => number;
}
/** How often the `[perf]` line is printed (s). */
const PERF_LOG_SECONDS = 5;

/** Codes of the lobbies open on this server, so a new lobby never reuses a live code. */
const codesInUse = new Set<string>();

/**
 * One lobby and its match. Players gather in the lobby; when the host starts, teams are
 * balanced, revealed, counted down, and then everyone plays. The room runs every player with
 * the shared game rules at a fixed 30 Hz; clients predict their own player with the same rules
 * and smooth everyone else. The room id is the lobby code, so players join by code.
 */
export class MatchRoom extends Room<{ state: MatchState; input: NetInput }> {
  maxClients = CONFIG.lobby.maxPlayers;
  state = new MatchState();

  inputs = this.defineInput(NetInput, {
    bufferMaxSize: 64,
    sanitize: { moveX: [-1, 1], moveY: [-1, 1], aimPitch: [-1.6, 1.6] },
    // Through short network gaps, keep using the player's last input so they don't stutter.
    idle: ({ latest }) => latest ?? true,
  });

  /** This round's arena (a new random one after every capture), with its physics and paint. */
  private map: MapDef = ARENA;
  private physics = new PhysicsWorld(ARENA.blocks);
  private paint = new PaintGrid(buildSurfaces(ARENA.blocks));
  /** Each team's paint points this match (paint is wiped every round; this isn't). */
  private teamPaint: [number, number] = [0, 0];
  /** Development only: an arena size the lobby's creator asked for (see devArenaSize). */
  private forcedArenaSize: number | null = null;
  /** Tick timings for the load test's `[perf]` log line. */
  private readonly tickStats = new TickStats();
  private perfTimer = 0;
  /** Physics bodies of players in the arena (none while everyone waits in the lobby). */
  private readonly bodies = new Map<string, Collider>();
  /** Every shot in flight. These are the real ones: they decide where paint lands. */
  private readonly projectiles: Projectile[] = [];
  /** Session ids in join order: if the host leaves, the longest-waiting player takes over. */
  private readonly joinOrder: string[] = [];
  /** Seconds left in the current timed phase. */
  private phaseTimer = 0;
  private readonly balanceTeams: TeamBalancer = shuffleTeams;
  /** Who fired each shot in flight (for hit checks from their point of view, and credit). */
  private readonly shooters = new WeakMap<Projectile, string>();
  /** Paint landing this tick, sent to everyone at the end of it. */
  private readonly landed: PaintEvent[] = [];
  /** Who gets the paint points for each `landed` event ('' for nobody). */
  private readonly landedBy: string[] = [];
  /** Recent hits, for assists. */
  private readonly damageLog = new DamageLog();
  /** Splats in quick succession, for the multi-kill callouts. */
  private readonly multiKills = new MultiKillTracker();
  /** When each player last changed their lobby team pick (a counter), oldest first at Start. */
  private readonly pickedAt = new Map<string, number>();
  private pickCount = 0;
  /** Seconds since the room started (timestamps for the damage log). */
  private elapsed = 0;
  /**
   * Lag compensation: recent player positions, so a shot is checked against where the
   * shooter saw everyone (other players are drawn ~100 ms in the past, plus the ping).
   */
  private rewind!: Rewind;
  /** The one neutral flag (mirrored into the synced state every tick). */
  private flag: Flag = createFlag(ARENA.flagSpawn);
  /** Where this round's flag appears, and returns to when dropped (see setupStage). */
  private flagSpot: Vec3 = ARENA.flagSpawn;
  /** King of the Hill stages: the circle and its bar (mirrored into the synced state). */
  private hill: Hill = createHill(ARENA.flagSpawn);
  /** The last team announced as holding the hill, so it's only said again when it changes. */
  private hillAnnounced = HILL_FREE;
  /** Seconds of match time left while playing. */
  private matchTimer = 0;
  /** Bots the room plays itself, by player id ("bot-1", …); they're in `state.players` too. */
  private readonly bots = new Map<string, Bot>();
  private nextBotNumber = 1;

  onCreate() {
    this.roomId = generateLobbyCode(Math.random, (code) => codesInUse.has(code));
    codesInUse.add(this.roomId);
    this.state.phase = 'lobby';
    this.state.hostId = '';
    this.state.matchMinutes = defaultMatchMinutes();
    this.state.capturesToWin = CONFIG.match.capturesToWin;
    this.state.mapSeed = 0;
    this.state.countdown = 0;
    // Created before the fixed timestep, so it records after every tick.
    this.rewind = this.allowRewindState({ maxRewindMs: 500 });
    this.rewind.attachAll(this.state.players, { fields: ['x', 'y', 'z', 'swimBlend'] });
    this.syncFlag();
    this.setFixedTimestep((ctx) => this.step(ctx), CONFIG.net.tickRate);
    console.log(`[match] lobby ${this.roomId} created`);
  }

  messages = {
    // Switching role: checked here, so a client can't ask for a weapon that doesn't exist.
    // Re-picking the same role is ignored, so it can't be used as an instant reload.
    [MSG_CHOOSE_WEAPON]: (client: Client, payload: unknown) => {
      const weapon = parseWeaponChoice(payload);
      const player = this.state.players.get(client.sessionId);
      if (weapon === null || !player || player.weapon === weapon) return;
      setWeapon(player, weapon);
    },
    // A player who just joined or reconnected needs all the paint so far.
    [MSG_REQUEST_PAINT]: (client: Client) => {
      client.sendBytes(MSG_PAINT_SNAPSHOT, encodePaintSnapshot(this.paint.exportCells()));
    },
    // Answered right away (not on a tick), so it measures just the network.
    [MSG_PING]: (client: Client, payload: unknown) => {
      if (typeof payload === 'number') client.send(MSG_PONG, payload);
    },
    // Development only: a host page on localhost needs this computer's network address for
    // its QR code. Not answered in production, where the page's own address is right.
    [MSG_REQUEST_LAN]: (client: Client) => {
      if (process.env.NODE_ENV !== 'production') client.send(MSG_LAN_ADDRESSES, lanAddresses());
    },
    [MSG_START]: (client: Client) => {
      if (this.isHost(client) && this.phase === 'lobby') this.startMatch();
    },
    [MSG_PLAY_AGAIN]: (client: Client) => {
      if (this.isHost(client) && this.phase === 'ended') this.backToLobby();
    },
    [MSG_KICK]: (client: Client, payload: unknown) => {
      if (!this.isHost(client) || typeof payload !== 'string' || payload === client.sessionId) {
        return;
      }
      if (this.bots.has(payload)) {
        this.removeBot(payload);
        return;
      }
      const target = this.clients.getById(payload);
      if (!target) return;
      // Tell them why first; a normal (consented) close means their game won't try to rejoin.
      target.send(MSG_KICKED);
      target.leave();
    },
    // Looks can change while waiting in the lobby; everyone sees it straight away.
    [MSG_SET_LOOK]: (client: Client, payload: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (player && this.phase === 'lobby') Object.assign(player, parseLook(payload));
    },
    [MSG_CAPTURE_GOAL]: (client: Client, payload: unknown) => {
      if (this.isHost(client) && this.phase === 'lobby' && isCaptureGoal(payload)) {
        this.state.capturesToWin = payload;
      }
    },
    [MSG_MATCH_LENGTH]: (client: Client, payload: unknown) => {
      if (this.isHost(client) && this.phase === 'lobby' && isMatchLength(payload)) {
        this.state.matchMinutes = payload;
      }
    },
    // Team wishes in the lobby (Start keeps them as far as the teams stay even).
    [MSG_PICK_TEAM]: (client: Client, payload: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.phase !== 'lobby' || !isTeamPick(payload)) return;
      if (player.teamPick === payload) return;
      player.teamPick = payload;
      this.pickedAt.set(client.sessionId, ++this.pickCount);
    },
    [MSG_SWITCH_TEAM]: (client: Client) => this.switchTeam(client.sessionId),
    [MSG_TEAM_COLORS]: (client: Client, payload: unknown) => {
      if (this.isHost(client) && this.phase === 'lobby' && isTeamPalette(payload)) {
        this.state.teamColors = payload;
      }
    },
    [MSG_GAME_MODE]: (client: Client, payload: unknown) => {
      if (this.isHost(client) && this.phase === 'lobby' && isGameMode(payload)) {
        this.state.gameMode = payload;
      }
    },
    [MSG_SET_BOTS]: (client: Client, payload: unknown) => {
      if (this.isHost(client) && this.phase === 'lobby') this.setBotCount(payload);
    },
  };

  onJoin(client: Client, options?: MatchJoinOptions) {
    // A full lobby with bots: a bot makes room for the person.
    if (this.state.players.size >= CONFIG.lobby.maxPlayers) {
      const bot = [...this.bots.keys()].pop();
      if (bot) this.removeBot(bot);
    }
    const weapon = parseWeaponChoice(options?.weapon) ?? DEFAULT_WEAPON;
    // Joining a match that's already on: straight in, on the smaller team.
    const inArena = this.phase !== 'lobby';
    const team = inArena ? smallerTeam(this.teamsInArena()) : 0;
    const player = new NetPlayer(
      createPlayerState(this.spawnFor(team), spawnYaw(team), team, weapon),
    );
    player.name = cleanName(options?.name);
    Object.assign(player, parseLook(options?.look));
    this.state.players.set(client.sessionId, player);
    this.joinOrder.push(client.sessionId);
    if (!this.state.hostId) {
      this.state.hostId = client.sessionId;
      const size = options?.devArenaSize;
      const valid =
        typeof size === 'number' &&
        Number.isInteger(size) &&
        size >= 0 &&
        size < CONFIG.lobby.arenaSizes.length;
      if (valid && process.env.NODE_ENV !== 'production') this.forcedArenaSize = size;
      // "Play with bots": the lobby opens with bots already in it.
      if (options?.bots !== undefined) this.setBotCount(options.bots);
    }
    if (inArena) this.bodies.set(client.sessionId, this.physics.createCharacter(player));
    // Owner-only fields (timers, ink) go to this client for its own player.
    client.view = new StateView();
    client.view.add(player);
    console.log(
      `[match] ${this.roomId}: ${player.name} joined (${this.state.players.size} players)`,
    );
  }

  onDrop(client: Client) {
    // Lost connection or a page refresh: if they come back within the window they keep their
    // player; otherwise onLeave runs.
    void this.allowReconnection(client, CONFIG.net.reconnectSeconds);
  }

  onLeave(client: Client) {
    const id = client.sessionId;
    this.removePlayer(id);
    const index = this.joinOrder.indexOf(id);
    if (index >= 0) this.joinOrder.splice(index, 1);
    // Bots never host: the longest-waiting person takes over.
    if (this.state.hostId === id) this.state.hostId = this.joinOrder[0] ?? '';
    console.log(`[match] ${this.roomId}: ${id} left (${this.state.players.size} players)`);
  }

  /** Takes a player (person or bot) out of the room: body, synced state, assist history. */
  private removePlayer(id: string): void {
    const body = this.bodies.get(id);
    if (body) this.physics.removeCharacter(body);
    this.bodies.delete(id);
    this.state.players.delete(id);
    this.damageLog.forget(id);
    this.multiKills.end(id);
    this.pickedAt.delete(id);
  }

  /**
   * Mid-match: a player changes sides, unless the other team is already bigger (see
   * canSwitchTeam). A carried flag drops where they are; they're out for a moment, then
   * appear on their new team's spawn.
   */
  private switchTeam(id: string): void {
    const player = this.state.players.get(id);
    if (!player || !this.bodies.has(id) || this.phase === 'lobby' || this.phase === 'ended') return;
    if (!canSwitchTeam(player.team, this.teamsInArena())) return;
    if (this.flag.state === 'carried' && this.flag.carrier === id) {
      this.flag.state = 'dropped';
      this.flag.carrier = '';
      this.flag.timer = CONFIG.match.flagReturnSeconds;
      this.onFlagEvent({ kind: 'dropped', by: id, team: player.team });
      this.syncFlag();
    }
    player.team = player.team === 0 ? 1 : 0;
    this.placeOnSpawn(player);
    player.respawnTimer = CONFIG.lobby.switchTeamSeconds;
    this.multiKills.end(id);
    const news: TeamNews = { kind: 'switched', by: id, team: player.team };
    this.broadcast(MSG_TEAM_NEWS, news);
    console.log(`[match] ${this.roomId}: ${player.name} switched to team ${player.team}`);
  }

  /** People in the room (everyone who isn't a bot). */
  private get humans(): number {
    return this.state.players.size - this.bots.size;
  }

  /**
   * The host's bot count: adds or removes bots to match it, keeping people + bots within the
   * lobby's limit. Anything that isn't a whole number is ignored.
   */
  private setBotCount(payload: unknown): void {
    if (typeof payload !== 'number' || !Number.isInteger(payload)) return;
    const wanted = Math.max(0, Math.min(payload, CONFIG.lobby.maxPlayers - this.humans));
    while (this.bots.size < wanted) this.addBot();
    while (this.bots.size > wanted) {
      const last = [...this.bots.keys()].pop();
      if (!last) break;
      this.removeBot(last);
    }
  }

  /** A new bot: a random role and look, played by the room itself (see stepBot). */
  private addBot(): void {
    const number = this.nextBotNumber++;
    const id = `bot-${number}`;
    const random = createRng((Math.random() * 0xffffffff) >>> 0);
    const inArena = this.phase !== 'lobby';
    const team = inArena ? smallerTeam(this.teamsInArena()) : 0;
    const weapon = Math.floor(random() * WEAPON_KINDS.length);
    const player = new NetPlayer(
      createPlayerState(this.spawnFor(team), spawnYaw(team), team, weapon),
    );
    player.name = `Bot ${number}`;
    player.bot = true;
    Object.assign(player, randomLook(random));
    this.state.players.set(id, player);
    this.bots.set(id, { mind: createBotMind(random), random });
    if (inArena) this.bodies.set(id, this.physics.createCharacter(player));
  }

  private removeBot(id: string): void {
    if (!this.bots.delete(id)) return;
    this.removePlayer(id);
  }

  onDispose() {
    codesInUse.delete(this.roomId);
    this.physics.dispose();
    console.log(`[match] lobby ${this.roomId} closed`);
  }

  private get phase(): MatchPhase {
    return parsePhase(this.state.phase);
  }

  private isHost(client: Client): boolean {
    return client.sessionId === this.state.hostId;
  }

  /** Balances everyone into two teams, puts them on their spawn pads, and starts the reveal. */
  private startMatch(): void {
    // The arena's size fits the head count now (and stays for the whole match); the first
    // round is Drip Yard at normal size.
    this.loadMap(0, this.forcedArenaSize ?? arenaSizeFor(this.state.players.size));
    // Lobby picks are kept as far as the sides stay even; whoever picked last gives way.
    const choices = [...this.state.players].map(([id, p]) => ({ id, pick: p.teamPick }));
    const pickedAt = (id: string) => this.pickedAt.get(id) ?? Infinity;
    choices.sort((a, b) => pickedAt(a.id) - pickedAt(b.id));
    const { teams, moved } = teamsWithPicks(choices, Math.random, this.balanceTeams);
    for (const id of moved) {
      const news: TeamNews = { kind: 'moved', by: id, team: teams.get(id) ?? 0 };
      this.clients.getById(id)?.send(MSG_TEAM_NEWS, news);
    }
    for (const [id, player] of this.state.players) {
      player.team = teams.get(id) ?? 0;
      this.placeOnSpawn(player);
      if (!this.bodies.has(id)) this.bodies.set(id, this.physics.createCharacter(player));
      // Fresh stats (this also resets the respawn wait, which grows with deaths).
      player.kills = 0;
      player.deaths = 0;
      player.assists = 0;
      player.captures = 0;
      player.paint = 0;
    }
    // A fresh match: no captures, the flag in the middle.
    this.state.score0 = 0;
    this.state.score1 = 0;
    this.state.winner = -1;
    this.state.winReason = '';
    this.teamPaint = [0, 0];
    this.damageLog.clear();
    this.multiKills.clear();
    this.setupStage();
    // The match clock runs for the whole match (it pauses between rounds).
    this.matchTimer = this.state.matchMinutes * 60;
    this.state.timeLeft = Math.ceil(this.matchTimer);
    this.setPhase('reveal');
    console.log(`[match] ${this.roomId}: started with ${this.state.players.size} players`);
  }

  /**
   * Switches to the layout for `seed` in size step `size` (see arenaFor): new physics and an
   * empty paint grid. Everyone in the arena gets a body in the new world. Every screen
   * rebuilds the same layout when it sees the new `mapSeed` / `arenaSize`.
   */
  private loadMap(seed: number, size: number): void {
    // Drip Yard at normal size is the one layout that's already built when nothing changed.
    const same = seed === this.state.mapSeed && size === this.state.arenaSize;
    if (same && this.map === arenaFor(seed, size)) return;
    this.map = arenaFor(seed, size);
    this.physics.dispose();
    this.physics = new PhysicsWorld(this.map.blocks);
    this.paint = new PaintGrid(buildSurfaces(this.map.blocks));
    for (const id of this.bodies.keys()) {
      const player = this.state.players.get(id);
      if (player) this.bodies.set(id, this.physics.createCharacter(player));
    }
    this.projectiles.length = 0;
    this.landed.length = 0;
    this.landedBy.length = 0;
    this.state.mapSeed = seed;
    this.state.arenaSize = size;
  }

  /**
   * This stage: Capture the Flag or King of the Hill (by the host's game mode; random flips a
   * coin), with its objective at a fresh random spot on the middle line. The flag stays
   * hidden and still during a hill stage.
   */
  private setupStage(): void {
    this.state.stageMode = pickStageMode(parseGameMode(this.state.gameMode), Math.random);
    this.flagSpot = randomMiddleSpot(this.map, Math.random);
    this.flag = createFlag(this.flagSpot);
    this.syncFlag();
    // The whole circle lies level: on the platform, or on the floor beside it.
    const radius = CONFIG.koth.hillRadius;
    this.hill = createHill(randomMiddleSpot(this.map, Math.random, radius - 1), radius);
    this.hillAnnounced = HILL_FREE;
    this.syncHill();
  }

  private get stageMode(): StageMode {
    return parseStageMode(this.state.stageMode);
  }

  /**
   * After a stage is won: the next one on a brand-new random layout, everyone back on their
   * spawn with fresh state, a new objective on the middle line, no paint. Then a fresh 3-2-1.
   */
  private startRound(): void {
    this.loadMap(newLayoutSeed(Math.random), this.state.arenaSize);
    // Their new bodies follow the state on the next step.
    for (const [id, player] of this.state.players) {
      if (this.bodies.has(id)) this.placeOnSpawn(player);
    }
    this.setupStage();
    console.log(`[match] ${this.roomId}: new ${this.stageMode} stage on ${this.map.name}`);
  }

  /**
   * Play Again: everyone back in the lobby with their names and looks, the arena emptied and
   * its paint wiped on every screen. The next Start shuffles teams again.
   */
  private backToLobby(): void {
    for (const body of this.bodies.values()) this.physics.removeCharacter(body);
    this.bodies.clear();
    this.projectiles.length = 0;
    this.landed.length = 0;
    this.landedBy.length = 0;
    for (const player of this.state.players.values()) {
      player.respawnTimer = 0;
      player.protectTimer = 0;
      player.carrying = false;
    }
    this.flag = createFlag(this.map.flagSpawn);
    this.syncFlag();
    this.paint.clear();
    this.broadcastBytes(MSG_PAINT_SNAPSHOT, encodePaintSnapshot(this.paint.exportCells()), {});
    this.setPhase('lobby');
    console.log(`[match] ${this.roomId}: back to the lobby`);
  }

  private setPhase(phase: MatchPhase): void {
    this.state.phase = phase;
    this.phaseTimer = phaseSeconds(phase) ?? 0;
    this.state.countdown = Math.ceil(this.phaseTimer);
  }

  /**
   * The match, once per tick while playing: the clock, this stage's objective (the flag or
   * the hill), and whether someone has won the stage or the match.
   */
  private stepMatch(dt: number): void {
    this.matchTimer = Math.max(0, this.matchTimer - dt);
    const left = Math.ceil(this.matchTimer);
    if (left !== this.state.timeLeft) this.state.timeLeft = left;

    const stageWon = this.stageMode === 'koth' ? this.stepKoth(dt) : this.stepCtf(dt);
    const s = this.state;
    const result = matchResult(
      [s.score0, s.score1],
      this.matchTimer,
      this.teamPaint,
      s.capturesToWin,
    );
    if (result) this.endMatch(result);
    // A stage won without winning the match: a moment to celebrate, then a new stage.
    else if (stageWon) this.setPhase('scored');
  }

  /** King of the Hill: who's in the circle, the bar, the news. True when a team won the stage. */
  private stepKoth(dt: number): boolean {
    const inArena: HillPlayer[] = [];
    for (const [id, p] of this.state.players) {
      if (!this.bodies.has(id)) continue;
      inArena.push({ team: p.team, x: p.x, y: p.y, z: p.z, alive: p.respawnTimer <= 0 });
    }
    const won = stepHill(this.hill, inArena, dt);
    this.syncHill();
    // "Pink has the hill!" when a team takes it over (not again for the same team).
    const holder = this.hill.holder;
    if ((holder === 0 || holder === 1) && holder !== this.hillAnnounced) {
      this.hillAnnounced = holder;
      this.broadcast(MSG_FLAG, { kind: 'hillHeld', team: holder } satisfies HillEvent);
    }
    if (won < 0) return false;
    if (won === 0) this.state.score0++;
    else this.state.score1++;
    this.broadcast(MSG_FLAG, { kind: 'hillWon', team: won } satisfies HillEvent);
    return true;
  }

  /** Mirrors the hill into the synced state. */
  private syncHill(): void {
    const s = this.state;
    const h = this.hill;
    s.hillX = h.x;
    s.hillY = h.y;
    s.hillZ = h.z;
    if (s.hillBalance !== h.balance) s.hillBalance = h.balance;
    if (s.hillHolder !== h.holder) s.hillHolder = h.holder;
  }

  /** Capture the Flag: the flag and its carrier. True when a capture won the stage. */
  private stepCtf(dt: number): boolean {
    const inArena: FlagPlayer[] = [];
    for (const [id, p] of this.state.players) {
      if (!this.bodies.has(id)) continue;
      inArena.push({
        id,
        team: p.team,
        x: p.x,
        y: p.y,
        z: p.z,
        alive: p.respawnTimer <= 0,
        standing: p.swimBlend < 0.5,
      });
    }
    const event = stepFlag(this.flag, inArena, dt, this.flagSpot, this.map.bases);
    if (event) this.onFlagEvent(event);
    this.syncFlag();
    return event?.kind === 'captured';
  }

  private onFlagEvent(event: FlagEvent): void {
    if (event.kind === 'captured') {
      if (event.team === 0) this.state.score0++;
      else this.state.score1++;
      const carrier = this.state.players.get(event.by);
      if (carrier) carrier.captures++;
    }
    if (event.kind === 'dropped') {
      // Settle a flag dropped in mid-air (a carrier splatted while jumping) onto the ground.
      const below = this.physics.raycast(
        { x: this.flag.x, y: this.flag.y + 0.5, z: this.flag.z },
        { x: 0, y: -1, z: 0 },
        40,
      );
      if (below) this.flag.y = below.point.y;
    }
    this.broadcast(MSG_FLAG, event);
  }

  /** Mirrors the flag into the synced state, and marks who's carrying it. */
  private syncFlag(): void {
    const s = this.state;
    const f = this.flag;
    s.flagState = f.state;
    s.flagX = f.x;
    s.flagY = f.y;
    s.flagZ = f.z;
    s.flagCarrier = f.carrier;
    s.flagTimer = f.state === 'dropped' ? Math.ceil(f.timer) : 0;
    for (const [id, player] of s.players) {
      const carrying = f.state === 'carried' && f.carrier === id;
      if (player.carrying !== carrying) player.carrying = carrying;
    }
  }

  private endMatch(result: MatchResult): void {
    this.state.winner = result.winner;
    this.state.winReason = result.reason;
    this.state.turf0 = this.teamPaint[0];
    this.state.turf1 = this.teamPaint[1];
    // Nobody carries anything once it's over.
    this.flag.state = this.flag.state === 'carried' ? 'dropped' : this.flag.state;
    this.flag.carrier = '';
    this.syncFlag();
    this.setPhase('ended');
    const s = this.state;
    console.log(
      `[match] ${this.roomId}: ended (${result.reason}), winner ${result.winner}, ${s.score0}–${s.score1}`,
    );
  }

  /** Counts down the reveal and the countdown, moving on when each runs out. */
  private advancePhase(dt: number): void {
    if (phaseSeconds(this.phase) === null) return;
    this.phaseTimer -= dt;
    const left = Math.max(0, Math.ceil(this.phaseTimer));
    if (left !== this.state.countdown) this.state.countdown = left;
    if (this.phaseTimer > 0) return;
    if (this.phase === 'scored') this.startRound();
    this.setPhase(nextPhase(this.phase));
  }

  /**
   * One authoritative tick: inputs for every player in the arena, then the shared rules for
   * movement, weapons and shots. New shots go to everyone else; the paint that landed goes to
   * everyone. Before GO, players can only look around.
   */
  private step(ctx: StepContext): void {
    const startedAt = performance.now();
    this.elapsed += ctx.dt;
    this.advancePhase(ctx.dt);
    const canMove = this.phase === 'playing';
    for (const [sessionId, player] of this.state.players) {
      const bot = this.bots.get(sessionId);
      if (bot) {
        this.stepBot(sessionId, bot, player, canMove, ctx.dt);
        continue;
      }
      const inputs = this.inputs.get(sessionId);
      const body = this.bodies.get(sessionId);
      if (!body) {
        // Still in the lobby: nothing to simulate, so don't let inputs pile up.
        inputs.clear();
        continue;
      }
      // Back from a splat (with a moment of spawn protection)?
      if (stepLife(player, ctx.dt)) this.placeOnSpawn(player);
      // Usually one input; more when a backlog built up, so it doesn't add delay for good.
      const runs = inputsToRun(inputs.size);
      for (let i = 0; i < runs; i++) {
        const input = inputs.next();
        if (!input) break;
        this.stepPlayerTick(sessionId, player, body, canMove ? input : frozenInput(input), ctx.dt);
      }
    }

    stepProjectiles(
      this.physics,
      this.projectiles,
      ctx.dt,
      (hit, shot) => {
        this.landed.push({
          point: hit.point,
          radius: hit.radius,
          team: hit.team,
          drip: hit.drip,
          direction: hit.direction,
          trail: hit.trail,
        });
        this.landedBy.push(this.shooters.get(shot) ?? '');
      },
      (shot, from, direction, distance) => this.hitPlayer(shot, from, direction, distance),
    );
    this.physics.step();
    if (this.landed.length > 0) {
      this.applyPaint(this.landed);
      this.landed.length = 0;
      this.landedBy.length = 0;
    }
    if (this.phase === 'playing') this.stepMatch(ctx.dt);
    this.recordTick(performance.now() - startedAt, ctx.dt);
  }

  /**
   * Load testing: how long ticks take. Every few seconds while players are in, one line:
   * average, 95th percentile and worst tick against the budget (one tick at 30 Hz = 33 ms).
   */
  private recordTick(ms: number, dt: number): void {
    this.tickStats.record(ms);
    this.perfTimer += dt;
    if (this.perfTimer < PERF_LOG_SECONDS) return;
    this.perfTimer = 0;
    const summary = this.tickStats.take();
    if (!summary || this.state.players.size === 0) return;
    const budget = 1000 / CONFIG.net.tickRate;
    const f = (value: number) => value.toFixed(1);
    console.log(
      `[perf] ${this.roomId}: ${this.state.players.size} players (${this.bots.size} bots) · tick ${f(summary.avg)} ms avg / ` +
        `${f(summary.p95)} p95 / ${f(summary.max)} max (budget ${f(budget)} ms) · ` +
        `${this.projectiles.length} shots in flight · ${this.phase}`,
    );
  }

  /**
   * Does this piece of a shot's flight hit an enemy? Checked against where the shooter saw
   * everyone (lag compensation), so what you hit on your screen is what counts.
   */
  private hitPlayer(shot: Projectile, from: Vec3, direction: Vec3, distance: number): boolean {
    const shooterId = this.shooters.get(shot) ?? '';
    const seen = shooterId ? this.rewind.lastSeenBy(shooterId) : null;
    for (const [id, target] of this.state.players) {
      // Shots pass through teammates (no friendly fire) and anyone who can't be hurt.
      if (target.team === shot.team || !this.bodies.has(id) || !isVulnerable(target)) continue;
      const sphere = playerHitSphere(
        seen ? seen.value(target, 'x') : target.x,
        seen ? seen.value(target, 'y') : target.y,
        seen ? seen.value(target, 'z') : target.z,
        seen ? seen.value(target, 'swimBlend') : target.swimBlend,
      );
      if (!segmentHitsSphere(from, direction, distance, sphere.center, sphere.radius)) continue;
      // The respawn wait grows with how often they've been splatted this match.
      const wait = respawnSeconds(target.deaths + 1);
      const result = applyShotDamage(target, shot.team, shot.damage, wait);
      if (result === 'ignored') continue;
      if (shooterId) this.damageLog.record(id, shooterId, this.elapsed);
      this.clients.getById(shooterId)?.send(MSG_HIT, result === 'splatted');
      if (result === 'splatted') this.onSplatted(id, target, shooterId, shot.team);
      return true;
    }
    return false;
  }

  /**
   * A burst of the attacker's paint where the player was, the stats (a splat for the attacker,
   * assists for whoever else hurt them recently), and the news for everyone.
   */
  private onSplatted(victimId: string, victim: NetPlayer, byId: string, team: number): void {
    this.landed.push({
      point: { x: victim.x, y: victim.y + 0.3, z: victim.z },
      radius: CONFIG.player.splatPaintRadius,
      team,
      drip: false,
      direction: { x: 0, y: -1, z: 0 },
      trail: 0,
    });
    this.landedBy.push(byId);
    victim.deaths++;
    const attacker = this.state.players.get(byId);
    if (attacker) attacker.kills++;
    // Splats in quick succession make a multi-kill; being splatted ends your own streak.
    this.multiKills.end(victimId);
    const streak = attacker ? this.multiKills.splat(byId, this.elapsed) : 1;
    for (const helper of this.damageLog.takeAssists(victimId, byId, this.elapsed)) {
      const player = this.state.players.get(helper);
      if (player && player.team !== victim.team) player.assists++;
    }
    const event: SplatEvent = { victim: victimId, by: byId, team, streak };
    this.broadcast(MSG_SPLAT, event);
    const by = this.state.players.get(byId)?.name ?? 'someone';
    console.log(`[match] ${this.roomId}: ${by} splatted ${victim.name}`);
  }

  /**
   * One tick of a bot: it looks at the match (only enemies it has a clear line to), decides
   * an input like a player would, and runs it through the same rules as everyone else.
   */
  private stepBot(id: string, bot: Bot, player: NetPlayer, canMove: boolean, dt: number): void {
    const body = this.bodies.get(id);
    if (!body) return;
    if (stepLife(player, dt)) this.placeOnSpawn(player);
    const view = botViewOf(this.state, id, this.map, this.canSee);
    if (!view) return;
    const input = think(view, bot.mind, dt, bot.random);
    this.stepPlayerTick(id, player, body, canMove ? input : frozenInput(input), dt);
  }

  /** Whether a bot at `me` can see `enemy`: close enough, with no wall in between. */
  private readonly canSee = (me: NetPlayer, enemy: NetPlayer): boolean => {
    const from = { x: me.x, y: me.y + BOT_EYE, z: me.z };
    const dx = enemy.x - from.x;
    const dy = enemy.y + BOT_EYE - from.y;
    const dz = enemy.z - from.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > BOT_SIGHT) return false;
    if (distance < 0.01) return true;
    const direction = { x: dx / distance, y: dy / distance, z: dz / distance };
    return this.physics.raycast(from, direction, distance) === null;
  };

  /** One input's worth of the shared rules for one player: movement, then their weapon. */
  private stepPlayerTick(
    sessionId: string,
    player: NetPlayer,
    body: Collider,
    input: PlayerInput,
    dt: number,
  ): void {
    stepPlayer(this.physics, body, player, input, dt, this.paint);

    const firstNew = this.projectiles.length;
    // Seeded by session id: the shooter's screen predicts exactly the same spread.
    const fired = stepWeapon(player, input, dt, seedFromString(sessionId), this.projectiles);
    if (fired > 0) {
      const shots = this.projectiles.slice(firstNew);
      for (const shot of shots) this.shooters.set(shot, sessionId);
      this.sendShots(sessionId, shots);
    }

    if (player.y < RESPAWN_BELOW_Y) {
      // A carrier falling off the map doesn't get a free ride home: the flag goes back.
      if (this.flag.state === 'carried' && this.flag.carrier === sessionId) {
        this.flag = createFlag(this.flagSpot);
        this.syncFlag();
        this.broadcast(MSG_FLAG, { kind: 'returned' } satisfies FlagEvent);
      }
      this.placeOnSpawn(player);
    }
  }

  /**
   * Back on a spawn pad of their team with fresh state, keeping who they are, and briefly
   * protected from shots so nobody can be spawn-camped.
   */
  private placeOnSpawn(player: NetPlayer): void {
    // Shot numbers keep counting, so the player's screen never mistakes new shots for old.
    const { shotCount } = player;
    Object.assign(
      player,
      createPlayerState(
        this.spawnFor(player.team),
        spawnYaw(player.team),
        player.team,
        player.weapon,
      ),
    );
    player.shotCount = shotCount;
    player.protectTimer = CONFIG.player.spawnProtectSeconds;
  }

  /** Tells everyone but the shooter about new shots, so their screens can fly them too. */
  private sendShots(shooterId: string, shots: Projectile[]): void {
    const bytes = encodeShotEvents(shots.map(shotEventOf));
    const shooter = this.clients.getById(shooterId);
    this.broadcastBytes(MSG_SHOTS, bytes, shooter ? { except: shooter } : {});
  }

  /**
   * Paints the server's grid and sends the same paint to everyone. The grid is painted from
   * the packed values, so every screen's grid ends up exactly like the server's.
   */
  private applyPaint(landed: PaintEvent[]): void {
    const bytes = encodePaintEvents(landed);
    decodePaintEvents(bytes).forEach((event, i) => {
      // A splat, or a straight piece of a shot's trail.
      const cells = this.paint.applyEvent(event).changed;
      // Paint over the whole match decides a tie (each round's paint is wiped).
      if (event.team === 0 || event.team === 1) this.teamPaint[event.team] += cells;
      // Paint points for whoever's shot (or splat burst) it was.
      const painter = this.state.players.get(this.landedBy[i] ?? '');
      if (painter && cells > 0) painter.paint += cells;
    });
    this.broadcastBytes(MSG_PAINT, bytes, {});
  }

  /** Teams of the players already in the arena. */
  private teamsInArena(): number[] {
    const teams: number[] = [];
    for (const [id, player] of this.state.players) if (this.bodies.has(id)) teams.push(player.team);
    return teams;
  }

  private spawnFor(team: number) {
    const spawns = this.map.spawns[team];
    const spot = spawns[Math.floor(Math.random() * spawns.length)];
    return { x: spot.x, y: spot.y + 0.05, z: spot.z };
  }
}

/** Each team starts facing the middle of the map. */
function spawnYaw(team: number): number {
  return team === 0 ? Math.PI : 0;
}

/** This computer's IPv4 addresses on the local network (Wi-Fi, Ethernet). */
function lanAddresses(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
}
