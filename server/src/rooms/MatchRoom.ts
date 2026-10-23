import { networkInterfaces } from 'node:os';
import { Room, type Client, type StepContext } from '@colyseus/core';
import { StateView } from '@colyseus/schema';
import {
  ARENA,
  buildSurfaces,
  cleanName,
  CONFIG,
  decodePaintEvents,
  defaultMatchMinutes,
  DEFAULT_WEAPON,
  encodePaintEvents,
  encodePaintSnapshot,
  encodeShotEvents,
  generateLobbyCode,
  inputsToRun,
  isMatchLength,
  MatchState,
  MSG_CHOOSE_WEAPON,
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
  type MatchJoinOptions,
  type MatchPhase,
  type PaintEvent,
  type TeamBalancer,
} from '@paint-rush/shared';
import {
  createPlayerState,
  frozenInput,
  PhysicsWorld,
  setWeapon,
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

  onCreate() {
    this.roomId = generateLobbyCode(Math.random, (code) => codesInUse.has(code));
    codesInUse.add(this.roomId);
    this.state.phase = 'lobby';
    this.state.hostId = '';
    this.state.matchMinutes = defaultMatchMinutes();
    this.state.countdown = 0;
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
    this.setPhase('reveal');
    console.log(`[match] ${this.roomId}: started with ${this.state.players.size} players`);
  }

  private setPhase(phase: MatchPhase): void {
    this.state.phase = phase;
    this.phaseTimer = phaseSeconds(phase) ?? 0;
    this.state.countdown = Math.ceil(this.phaseTimer);
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
      // Usually one input; more when a backlog built up, so it doesn't add delay for good.
      const runs = inputsToRun(inputs.size);
      for (let i = 0; i < runs; i++) {
        const input = inputs.next();
        if (!input) break;
        this.stepPlayerTick(sessionId, player, body, canMove ? input : frozenInput(input), ctx.dt);
      }
    }

    const landed: PaintEvent[] = [];
    stepProjectiles(this.physics, this.projectiles, ctx.dt, (hit) =>
      landed.push({
        point: hit.point,
        radius: hit.radius,
        team: hit.team,
        drip: hit.drip,
        direction: hit.direction,
      }),
    );
    this.physics.step();
    if (landed.length > 0) this.applyPaint(landed);
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
    if (fired > 0) this.sendShots(sessionId, this.projectiles.slice(firstNew));

    if (player.y < RESPAWN_BELOW_Y) this.placeOnSpawn(player);
  }

  /** Back on a spawn pad of their team with fresh state, keeping who they are. */
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
