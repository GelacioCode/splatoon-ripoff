import { Vector3 } from 'three';
import { Client, Predict, type InputHandle } from '@colyseus/sdk';
import {
  ARENA,
  ArenaState,
  CONFIG,
  decodePaintEvents,
  decodePaintSnapshot,
  decodeShotEvents,
  MSG_CHOOSE_WEAPON,
  MSG_PAINT,
  MSG_PAINT_SNAPSHOT,
  MSG_PING,
  MSG_PONG,
  MSG_REQUEST_PAINT,
  MSG_SHOTS,
  ROOM_ARENA,
  seedFromString,
  wrapAngle,
  NetInput,
  type ArenaJoinOptions,
  type NetPlayer,
} from '@paint-rush/shared';
import {
  createPlayerState,
  createProjectile,
  initPhysics,
  stepPlayer,
  stepProjectiles,
  stepWeapon,
  type Collider,
  type PlayerInput,
  type PlayerState,
  type Projectile,
} from '@paint-rush/shared/sim';
import { clearReconnectToken, loadReconnectToken, saveReconnectToken } from '../net/reconnectToken';
import { meterRoomTraffic, TrafficMeter } from '../net/trafficMeter';
import type { BlobCharacter, CharacterPose } from '../render/BlobCharacter';
import type { DevOverlay } from '../ui/devOverlay';
import { FixedStep } from './fixedStep';
import { NewShotFilter } from './newShotFilter';
import { snapshotOf, World, type PlayerSnapshot } from './World';

/** Wait this long before retrying a failed join, or reloading after losing the room (ms). */
const RETRY_MS = 2000;
/** How often the dev overlay's connection line refreshes (s). */
const STATUS_INTERVAL = 0.5;
/** Fields smoothed for drawing other players (yaw is smoothed separately, as an angle). */
const SMOOTHED_FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'swimBlend'] as const;
/** Other players' shots sound this much quieter than your own. */
const REMOTE_SHOT_VOLUME = 0.5;

/** Byte messages arrive as Uint8Array; anything else means a server/client version mismatch. */
function asBytes(payload: unknown): Uint8Array | null {
  if (payload instanceof Uint8Array) return payload;
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  return null;
}

function joinArena(serverUrl: string, options: ArenaJoinOptions = {}) {
  return new Client(serverUrl).joinOrCreate(ROOM_ARENA, options, ArenaState);
}
type ArenaRoom = Awaited<ReturnType<typeof joinArena>>;

/** Takes back the player this tab had before a refresh (the server keeps it for a while). */
function rejoinArena(serverUrl: string, token: string): Promise<ArenaRoom> {
  return new Client(serverUrl).reconnect<ArenaState>(token, ArenaState);
}

/** Network data use is metered in development, and in any build with `?debug`. */
const METER_TRAFFIC =
  import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
/** Weight of each new ping sample in the smoothed ping. */
const PING_SMOOTHING = 0.3;

/** Predicts our own player with the shared rules, replaying inputs the server hasn't seen yet. */
function createReconciler(
  predict: Predict<ArenaState>,
  player: NetPlayer,
  input: InputHandle<NetInput>,
  simulate: (state: PlayerState, command: PlayerInput, dt: number) => void,
) {
  return predict.reconciler(player, {
    input,
    step: (ctx, state, command) => simulate(state, command, ctx.dt),
    smoothMs: 65,
  });
}
type OwnReconciler = ReturnType<typeof createReconciler>;

/** Loads physics, then shows the arena right away and joins the server in the background. */
export async function startOnline(
  container: HTMLElement,
  overlay: DevOverlay,
  serverUrl: string,
): Promise<void> {
  const rapierVersion = await initPhysics();
  overlay.update({ physics: `Rapier ${rapierVersion}`, serverUrl });
  // `?debug` adds Colyseus' netcode panel: prediction drift and a latency simulator.
  if (new URLSearchParams(window.location.search).has('debug')) {
    import('@colyseus/sdk/debug').catch((error: unknown) => console.warn(error));
  }
  const game = new OnlineGame(container, overlay);
  game.start();
  game.connect(serverUrl);
}

/** Shown before the server has placed us: the team 0 spawn, standing still. */
const WAITING_STATE = createPlayerState(ARENA.spawns[0][0], Math.PI, 0);

/** The multiplayer game: everyone in one arena room, with the server in charge. */
class OnlineGame {
  private readonly world: World;
  private readonly overlay: DevOverlay;
  private session: NetSession | null = null;
  private readonly waitingFeet = new Vector3(WAITING_STATE.x, WAITING_STATE.y, WAITING_STATE.z);

  constructor(container: HTMLElement, overlay: DevOverlay) {
    this.overlay = overlay;
    const onlyOffline = () => console.info('Only available in the offline sandbox (?offline).');
    this.world = new World(
      container,
      overlay,
      {
        respawn: onlyOffline,
        clearPaint: onlyOffline,
        switchTeam: onlyOffline,
        refillInk: onlyOffline,
      },
      // The server switches the role; our blaster and ink follow once it confirms.
      (weapon) => this.session?.chooseWeapon(weapon),
    );
    this.world.view.yaw = Math.PI;
  }

  start(): void {
    this.world.start(this.frame);
  }

  connect(serverUrl: string): void {
    this.overlay.update({ server: 'connecting' });
    const join = () => joinArena(serverUrl, { weapon: this.world.settings.weapon });
    // After a refresh, first try to take our player back; if that fails, join as a new one.
    const token = loadReconnectToken(CONFIG.net.reconnectSeconds);
    clearReconnectToken();
    const joining = token
      ? rejoinArena(serverUrl, token).catch((error: unknown) => {
          console.info('[net] could not rejoin as the same player; joining fresh', error);
          return join();
        })
      : join();
    joining.then(
      (room) => {
        this.session = new NetSession(this.world, this.overlay, room);
      },
      (error: unknown) => {
        console.warn('[net] could not join the arena, retrying…', error);
        this.overlay.update({ server: 'offline' });
        setTimeout(() => this.connect(serverUrl), RETRY_MS);
      },
    );
  }

  private readonly frame = (timeMs: number): void => {
    if (this.session) {
      this.session.frame(timeMs);
      return;
    }
    const dt = this.world.beginFrame(timeMs, false);
    this.world.drawFrame(dt, this.waitingFeet, WAITING_STATE, [], 0);
  };
}

interface RemotePlayer {
  player: NetPlayer;
  character: BlobCharacter;
}

/**
 * One joined arena room: our predicted player plus smoothed remote players. Shots on screen
 * are for show (our own appear instantly, others' as the server reports them); the paint
 * they leave comes from the server, so every screen has the same paint.
 */
class NetSession {
  private readonly world: World;
  private readonly overlay: DevOverlay;
  private readonly room: ArenaRoom;
  private readonly predict: Predict<ArenaState>;
  private readonly netInput: InputHandle<NetInput>;
  private readonly remotes = new Map<string, RemotePlayer>();
  private readonly feet = new Vector3();
  private me: OwnReconciler | null = null;
  private body: Collider | null = null;
  private character: BlobCharacter | null = null;
  private lastSnapshot: PlayerSnapshot | null = null;
  private statusTimer = 0;
  /** Shots drawn on screen: ours (predicted) and everyone else's (from the server). */
  private readonly shots: Projectile[] = [];
  private readonly shotLoop = new FixedStep(1 / CONFIG.net.tickRate);
  /** Scratch list for the shots one predicted tick fires. */
  private readonly fired: Projectile[] = [];
  /** Same seed as the server uses for us, so predicted spread matches the real shots. */
  private readonly seed: number;
  private wasReloading = false;
  private firing = false;
  private pingMs: number | null = null;
  private readonly traffic = METER_TRAFFIC ? new TrafficMeter() : null;

  constructor(world: World, overlay: DevOverlay, room: ArenaRoom) {
    this.world = world;
    this.overlay = overlay;
    this.room = room;
    this.seed = seedFromString(room.sessionId);
    // Others are drawn slightly in the past, between two snapshots, so they move smoothly.
    this.predict = Predict.get(room, { mode: 'lerp', delay: CONFIG.net.interpolationDelayMs });
    this.netInput = room.input({ type: NetInput });
    this.predict.attachAll('players', { mode: 'lerp', fields: SMOOTHED_FIELDS });
    this.predict.attachAll('players', { mode: 'lerp', fields: ['yaw'], angle: true });

    room.onMessage(MSG_PAINT, (payload: unknown) => this.receivePaint(payload));
    room.onMessage(MSG_SHOTS, (payload: unknown) => this.receiveShots(payload));
    room.onMessage(MSG_PAINT_SNAPSHOT, (payload: unknown) => this.receiveSnapshot(payload));
    room.onMessage(MSG_PONG, (sentAt: unknown) => this.receivePong(sentAt));
    // Handlers are in place, so the snapshot can't arrive before we listen for it.
    room.send(MSG_REQUEST_PAINT);
    this.meterTraffic();

    // Leaving the page (refresh, or switching away on a phone): remember how to rejoin.
    window.addEventListener('pagehide', () => saveReconnectToken(room.reconnectionToken));

    room.onDrop(() => this.overlay.update({ server: 'reconnecting…' }));
    room.onReconnect(() => {
      this.overlay.update({ server: 'connected' });
      // Paint may have changed while we were away.
      room.send(MSG_REQUEST_PAINT);
      this.meterTraffic();
    });
    room.onLeave((code) => {
      clearReconnectToken();
      console.info(`[net] left the arena (code ${code}); reloading`);
      this.overlay.update({ server: 'offline' });
      setTimeout(() => window.location.reload(), RETRY_MS);
    });
    this.overlay.update({ server: 'connected' });
  }

  frame(timeMs: number): void {
    const world = this.world;
    const me = this.me;
    const dt = world.beginFrame(timeMs, me?.state.aiming ?? false);
    this.syncPlayers();

    // One input per fixed server tick that's due, sent before reading anything to draw.
    const steps = this.predict.tick();
    for (let i = 0; i < steps; i++) this.sendInput();

    if (me && this.character) {
      const s = me.state;
      // The smoothed value can be missing (NaN) before prediction has stepped; then use the
      // exact predicted state, so the camera never ends up pointing at nothing.
      const x = me.value('x');
      const y = me.value('y');
      const z = me.value('z');
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        this.feet.set(x, y, z);
      } else {
        this.warnOnce('smoothed position not ready', { x, y, z, state: [s.x, s.y, s.z], steps });
        this.feet.set(s.x, s.y, s.z);
      }
      if (this.lastSnapshot) world.playerEffects(this.lastSnapshot, s, dt);
      this.lastSnapshot = snapshotOf(s);
      this.character.update(dt, {
        x: this.feet.x,
        y: this.feet.y,
        z: this.feet.z,
        yaw: world.view.yaw,
        vx: s.vx,
        vy: s.vy,
        vz: s.vz,
        grounded: s.grounded,
        swimBlend: s.swimBlend,
        submerged: s.submerged,
        climbing: s.climbing,
      });
      this.character.setWeapon(s.weapon);
      world.weaponSounds(this.wasReloading, s, this.firing, dt);
      this.wasReloading = s.reloadTimer > 0;
    }
    for (const remote of this.remotes.values()) {
      remote.character.update(dt, this.remotePose(remote.player));
      remote.character.setWeapon(remote.player.weapon);
    }

    // Shots fly at the game's tick rate (like on the server) and are drawn in between.
    const shotSteps = this.shotLoop.advance(dt);
    for (let i = 0; i < shotSteps; i++) {
      stepProjectiles(world.physics, this.shots, this.shotLoop.stepSeconds, (hit) =>
        world.splash(hit, this.feet),
      );
    }
    world.drawFrame(dt, this.feet, me?.state ?? WAITING_STATE, this.shots, this.shotLoop.alpha);
    this.updateStatus(dt);
  }

  /**
   * One predicted tick of our own player: movement, then the weapon. Shots it fires appear
   * on screen right away, unless it's a replay of a tick whose shots are already flying.
   */
  private predictTick(
    state: PlayerState,
    command: PlayerInput,
    dt: number,
    body: Collider,
    newShots: NewShotFilter,
  ): void {
    const world = this.world;
    stepPlayer(world.physics, body, state, command, dt, world.paint);
    this.fired.length = 0;
    const fired = stepWeapon(state, command, dt, this.seed, this.fired);
    const fresh = newShots.take(state.shotCount, fired);
    for (let i = fired - fresh; i < fired; i++) this.shots.push(this.fired[i]);
    if (fresh > 0) world.sfx.shoot();
  }

  /** Paint the server put down this tick. */
  private receivePaint(payload: unknown): void {
    const bytes = asBytes(payload);
    if (!bytes) {
      this.warnOnce('paint message is not bytes', payload);
      return;
    }
    for (const paint of decodePaintEvents(bytes)) this.world.paintAt(paint);
  }

  /** Other players' new shots: fly them here too, with a quieter shot sound. */
  private receiveShots(payload: unknown): void {
    const bytes = asBytes(payload);
    if (!bytes) {
      this.warnOnce('shots message is not bytes', payload);
      return;
    }
    for (const shot of decodeShotEvents(bytes)) {
      this.shots.push(
        createProjectile(shot.origin, shot.yaw, shot.pitch, shot.team, shot.aimed, shot.weapon),
      );
      const loudness = this.world.loudnessAt(shot.origin, this.feet);
      this.world.sfx.shoot(loudness * REMOTE_SHOT_VOLUME);
    }
  }

  /** All the paint on the map, sent when we join or reconnect. */
  private receiveSnapshot(payload: unknown): void {
    const bytes = asBytes(payload);
    const cells = bytes ? decodePaintSnapshot(bytes) : null;
    if (!cells || !this.world.loadPaintSnapshot(cells)) {
      this.warnOnce('paint snapshot does not fit this map', { bytes: bytes?.byteLength });
    }
  }

  /** Asks the server for another role (it checks the choice and refills the tank). */
  chooseWeapon(weapon: number): void {
    this.room.send(MSG_CHOOSE_WEAPON, weapon);
  }

  private sendInput(): void {
    const world = this.world;
    // Yaw goes over the wire wrapped to −π…π, so prediction must use the same value.
    const sample = world.input.sampleTick(wrapAngle(world.view.yaw), world.aimPitch(this.feet));
    const data = this.netInput.data;
    data.moveX = sample.moveX;
    data.moveY = sample.moveY;
    data.aimYaw = sample.aimYaw;
    data.aimPitch = sample.aimPitch;
    data.fire = sample.fire;
    data.swim = sample.swim;
    data.jump = sample.jump;
    data.reload = sample.reload;
    data.aim = sample.aim;
    this.netInput.send();
    this.firing = sample.fire;
  }

  private readonly warned = new Set<string>();

  /** Logs a diagnostic to the browser console once per kind of problem. */
  private warnOnce(problem: string, details: unknown): void {
    if (this.warned.has(problem)) return;
    this.warned.add(problem);
    console.warn(`[net] ${problem}`, details);
  }

  /** Creates characters for players who just joined and removes those who left. */
  private syncPlayers(): void {
    const players = this.room.state.players;
    for (const [sessionId, player] of players) {
      const known =
        sessionId === this.room.sessionId ? this.me !== null : this.remotes.has(sessionId);
      if (!known) this.addPlayer(player, sessionId);
    }
    for (const sessionId of this.remotes.keys()) {
      if (!players.has(sessionId)) this.removePlayer(sessionId);
    }
  }

  private addPlayer(player: NetPlayer, sessionId: string): void {
    const world = this.world;
    if (sessionId !== this.room.sessionId) {
      const character = world.createCharacter(player.team, player.weapon);
      this.remotes.set(sessionId, { player, character });
      return;
    }
    // Our own player: predicted locally with the same rules the server runs.
    this.character = world.createCharacter(player.team, player.weapon);
    // The role may have been changed in the menu while we were still joining.
    if (player.weapon !== world.settings.weapon) this.chooseWeapon(world.settings.weapon);
    const body = world.physics.createCharacter(player);
    this.body = body;
    world.view.yaw = player.yaw;
    this.feet.set(player.x, player.y, player.z);
    const newShots = new NewShotFilter(player.shotCount);
    this.wasReloading = player.reloadTimer > 0;
    this.me = createReconciler(this.predict, player, this.netInput, (state, command, dt) =>
      this.predictTick(state, command, dt, body, newShots),
    );
  }

  private removePlayer(sessionId: string): void {
    const remote = this.remotes.get(sessionId);
    if (!remote) return;
    this.world.removeCharacter(remote.character);
    this.remotes.delete(sessionId);
  }

  /** Where to draw another player: smoothed values from about 100 ms in the past. */
  private remotePose(player: NetPlayer): CharacterPose {
    const p = this.predict;
    return {
      x: p.value(player, 'x'),
      y: p.value(player, 'y'),
      z: p.value(player, 'z'),
      yaw: p.value(player, 'yaw'),
      vx: p.value(player, 'vx'),
      vy: p.value(player, 'vy'),
      vz: p.value(player, 'vz'),
      grounded: player.grounded,
      swimBlend: p.value(player, 'swimBlend'),
      submerged: player.submerged,
      climbing: player.climbing,
    };
  }

  private updateStatus(dt: number): void {
    this.statusTimer += dt;
    if (this.statusTimer < STATUS_INTERVAL) return;
    const traffic = this.traffic?.sample(this.statusTimer);
    this.statusTimer = 0;
    this.room.send(MSG_PING, performance.now());
    this.overlay.update({
      players: this.room.state.players.size,
      pingMs: this.pingMs === null ? undefined : Math.round(this.pingMs),
      inputDelayMs: Math.round(this.room.clock.rtt()),
      downKBps: traffic?.downKBps,
      upKBps: traffic?.upKBps,
    });
  }

  private receivePong(sentAt: unknown): void {
    if (typeof sentAt !== 'number') return;
    const sample = performance.now() - sentAt;
    this.pingMs =
      this.pingMs === null ? sample : this.pingMs + (sample - this.pingMs) * PING_SMOOTHING;
  }

  /** Dev only: count this room's network bytes (again after a reconnect: new socket). */
  private meterTraffic(): void {
    if (this.traffic && !meterRoomTraffic(this.room, this.traffic)) {
      this.warnOnce('traffic meter could not attach (Colyseus internals changed?)', null);
    }
  }
}
