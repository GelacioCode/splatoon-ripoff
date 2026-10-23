import { networkInterfaces } from 'node:os';
import { Room, type Client, type Rewind, type StepContext } from '@colyseus/core';
import { StateView } from '@colyseus/schema';
import {
  ARENA,
  buildSurfaces,
  cleanName,
  CONFIG,
  createFlag,
  decodePaintEvents,
  defaultMatchMinutes,
  DEFAULT_WEAPON,
  encodePaintEvents,
  encodePaintSnapshot,
  encodeShotEvents,
  generateLobbyCode,
  inputsToRun,
  isMatchLength,
  matchResult,
  MatchState,
  MSG_CHOOSE_WEAPON,
  MSG_FLAG,
  MSG_HIT,
  MSG_KICK,
  MSG_KICKED,
  MSG_LAN_ADDRESSES,
  MSG_MATCH_LENGTH,
  MSG_PAINT,
  MSG_PAINT_SNAPSHOT,
  MSG_PING,
  MSG_PONG,
  MSG_REQUEST_LAN,
  MSG_REQUEST_PAINT,
  MSG_SET_LOOK,
  MSG_SHOTS,
  MSG_SPLAT,
  MSG_START,
  NetInput,
  NetPlayer,
  nextPhase,
  PaintGrid,
  parseLook,
  parsePhase,
  parseWeaponChoice,
  phaseSeconds,
  seedFromString,
  shotEventOf,
  shuffleTeams,
  smallerTeam,
  stepFlag,
  type Flag,
  type FlagEvent,
  type FlagPlayer,
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

/** Falling below this height puts a player back on their team's spawn pad. */
const RESPAWN_BELOW_Y = -10;

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

  private readonly physics = new PhysicsWorld(ARENA.blocks);
  private readonly paint = new PaintGrid(buildSurfaces(ARENA.blocks));
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
  /**
   * Lag compensation: recent player positions, so a shot is checked against where the
   * shooter saw everyone (other players are drawn ~100 ms in the past, plus the ping).
   */
  private rewind!: Rewind;
  /** The one neutral flag (mirrored into the synced state every tick). */
  private flag: Flag = createFlag(ARENA.flagSpawn);
  /** Seconds of match time left while playing. */
  private matchTimer = 0;

  onCreate() {
    this.roomId = generateLobbyCode(Math.random, (code) => codesInUse.has(code));
    codesInUse.add(this.roomId);
    this.state.phase = 'lobby';
    this.state.hostId = '';
    this.state.matchMinutes = defaultMatchMinutes();
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
    [MSG_KICK]: (client: Client, payload: unknown) => {
      if (!this.isHost(client) || typeof payload !== 'string' || payload === client.sessionId) {
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
    [MSG_MATCH_LENGTH]: (client: Client, payload: unknown) => {
      if (this.isHost(client) && this.phase === 'lobby' && isMatchLength(payload)) {
        this.state.matchMinutes = payload;
      }
    },
  };

  onJoin(client: Client, options?: MatchJoinOptions) {
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
    if (!this.state.hostId) this.state.hostId = client.sessionId;
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
    const body = this.bodies.get(id);
    if (body) this.physics.removeCharacter(body);
    this.bodies.delete(id);
    this.state.players.delete(id);
    const index = this.joinOrder.indexOf(id);
    if (index >= 0) this.joinOrder.splice(index, 1);
    if (this.state.hostId === id) this.state.hostId = this.joinOrder[0] ?? '';
    console.log(`[match] ${this.roomId}: ${id} left (${this.state.players.size} players)`);
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
    const teams = this.balanceTeams([...this.state.players.keys()], Math.random);
    for (const [id, player] of this.state.players) {
      player.team = teams.get(id) ?? 0;
      this.placeOnSpawn(player);
      if (!this.bodies.has(id)) this.bodies.set(id, this.physics.createCharacter(player));
    }
    // A fresh match: no captures, the flag in the middle.
    this.state.score0 = 0;
    this.state.score1 = 0;
    this.state.winner = -1;
    this.state.winReason = '';
    this.flag = createFlag(ARENA.flagSpawn);
    this.syncFlag();
    this.setPhase('reveal');
    console.log(`[match] ${this.roomId}: started with ${this.state.players.size} players`);
  }

  private setPhase(phase: MatchPhase): void {
    this.state.phase = phase;
    this.phaseTimer = phaseSeconds(phase) ?? 0;
    this.state.countdown = Math.ceil(this.phaseTimer);
    if (phase === 'playing') {
      this.matchTimer = this.state.matchMinutes * 60;
      this.state.timeLeft = Math.ceil(this.matchTimer);
    }
  }

  /**
   * Capture the Flag, once per tick while playing: the clock, the flag, the carrier, and
   * whether someone has won.
   */
  private stepMatch(dt: number): void {
    this.matchTimer = Math.max(0, this.matchTimer - dt);
    const left = Math.ceil(this.matchTimer);
    if (left !== this.state.timeLeft) this.state.timeLeft = left;

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
    const event = stepFlag(this.flag, inArena, dt, ARENA.flagSpawn, ARENA.bases);
    if (event) this.onFlagEvent(event);
    this.syncFlag();

    const turf = this.turfPercent();
    const result = matchResult([this.state.score0, this.state.score1], this.matchTimer, turf);
    if (result) this.endMatch(result, turf);
  }

  private onFlagEvent(event: FlagEvent): void {
    if (event.kind === 'captured') {
      if (event.team === 0) this.state.score0++;
      else this.state.score1++;
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

  /** How much of the paintable map each team has painted (%). */
  private turfPercent(): [number, number] {
    const total = Math.max(1, this.paint.totalCells);
    return [
      Math.round((this.paint.paintedCells(0) / total) * 100),
      Math.round((this.paint.paintedCells(1) / total) * 100),
    ];
  }

  private endMatch(result: MatchResult, turf: [number, number]): void {
    this.state.winner = result.winner;
    this.state.winReason = result.reason;
    this.state.turf0 = turf[0];
    this.state.turf1 = turf[1];
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
    if (this.phaseTimer <= 0) this.setPhase(nextPhase(this.phase));
  }

  /**
   * One authoritative tick: inputs for every player in the arena, then the shared rules for
   * movement, weapons and shots. New shots go to everyone else; the paint that landed goes to
   * everyone. Before GO, players can only look around.
   */
  private step(ctx: StepContext): void {
    this.advancePhase(ctx.dt);
    const canMove = this.phase === 'playing';
    for (const [sessionId, player] of this.state.players) {
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
      (hit) =>
        this.landed.push({
          point: hit.point,
          radius: hit.radius,
          team: hit.team,
          drip: hit.drip,
          direction: hit.direction,
        }),
      (shot, from, direction, distance) => this.hitPlayer(shot, from, direction, distance),
    );
    this.physics.step();
    if (this.landed.length > 0) {
      this.applyPaint(this.landed);
      this.landed.length = 0;
    }
    if (this.phase === 'playing') this.stepMatch(ctx.dt);
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
      const result = applyShotDamage(target, shot.team, shot.damage);
      if (result === 'ignored') continue;
      this.clients.getById(shooterId)?.send(MSG_HIT, result === 'splatted');
      if (result === 'splatted') this.onSplatted(id, target, shooterId, shot.team);
      return true;
    }
    return false;
  }

  /** A burst of the attacker's paint where the player was, and the news for everyone. */
  private onSplatted(victimId: string, victim: NetPlayer, byId: string, team: number): void {
    this.landed.push({
      point: { x: victim.x, y: victim.y + 0.3, z: victim.z },
      radius: CONFIG.player.splatPaintRadius,
      team,
      drip: false,
      direction: { x: 0, y: -1, z: 0 },
    });
    const event: SplatEvent = { victim: victimId, by: byId, team };
    this.broadcast(MSG_SPLAT, event);
    const by = this.state.players.get(byId)?.name ?? 'someone';
    console.log(`[match] ${this.roomId}: ${by} splatted ${victim.name}`);
  }

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
        this.flag = createFlag(ARENA.flagSpawn);
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
    for (const event of decodePaintEvents(bytes)) {
      this.paint.splat(event.point, event.radius, event.team);
    }
    this.broadcastBytes(MSG_PAINT, bytes, {});
  }

  /** Teams of the players already in the arena. */
  private teamsInArena(): number[] {
    const teams: number[] = [];
    for (const [id, player] of this.state.players) if (this.bodies.has(id)) teams.push(player.team);
    return teams;
  }

  private spawnFor(team: number) {
    const spawns = ARENA.spawns[team];
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
