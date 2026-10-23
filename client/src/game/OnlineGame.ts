import { Vector3 } from 'three';
import { Client, Predict, type InputHandle } from '@colyseus/sdk';
import {
  ARENA,
  CONFIG,
  decodePaintEvents,
  decodePaintSnapshot,
  decodeShotEvents,
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
  parseLook,
  parsePhase,
  ROOM_MATCH,
  seedFromString,
  wrapAngle,
  type MatchJoinOptions,
  type MatchPhase,
  type NetPlayer,
} from '@paint-rush/shared';
import {
  createPlayerState,
  createProjectile,
  frozenInput,
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
import { isLocalPage, joinPath, joinUrl, type Route } from '../net/route';
import { meterRoomTraffic, TrafficMeter } from '../net/trafficMeter';
import type { BlobCharacter, CharacterPose } from '../render/BlobCharacter';
import { LookPreview } from '../render/LookPreview';
import { TEAM_COLORS } from '../render/palette';
import { saveSettings } from '../settings';
import type { DevOverlay } from '../ui/devOverlay';
import { qrCodeSvg } from '../ui/qrCode';
import { MatchBanner, Screens, type LobbyPlayer } from '../ui/screens';
import { FixedStep } from './fixedStep';
import { NewShotFilter } from './newShotFilter';
import { snapshotOf, World, type PlayerSnapshot } from './World';

/** How often the dev overlay's connection line refreshes (s). */
const STATUS_INTERVAL = 0.5;
/** Fields smoothed for drawing other players (yaw is smoothed separately, as an angle). */
const SMOOTHED_FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'swimBlend'] as const;
/** Other players' shots sound this much quieter than your own. */
const REMOTE_SHOT_VOLUME = 0.5;
/** Name used by the `?quick` dev shortcut when none was ever entered. */
const QUICK_NAME = 'Tester';

/** Byte messages arrive as Uint8Array; anything else means a server/client version mismatch. */
function asBytes(payload: unknown): Uint8Array | null {
  if (payload instanceof Uint8Array) return payload;
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  return null;
}

/** Makes a new lobby; the room id the server gives it is the lobby code. */
function createLobby(serverUrl: string, options: MatchJoinOptions) {
  return new Client(serverUrl).create(ROOM_MATCH, options, MatchState);
}
type MatchRoom = Awaited<ReturnType<typeof createLobby>>;

function joinLobby(serverUrl: string, code: string, options: MatchJoinOptions): Promise<MatchRoom> {
  return new Client(serverUrl).joinById<MatchState>(code, options, MatchState);
}

/** Takes back the player this tab had before a refresh (the server keeps it for a while). */
function rejoinLobby(serverUrl: string, token: string): Promise<MatchRoom> {
  return new Client(serverUrl).reconnect<MatchState>(token, MatchState);
}

/** Network data use is metered in development, and in any build with `?debug`. */
const METER_TRAFFIC =
  import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
/** Weight of each new ping sample in the smoothed ping. */
const PING_SMOOTHING = 0.3;

/** Predicts our own player with the shared rules, replaying inputs the server hasn't seen yet. */
function createReconciler(
  predict: Predict<MatchState>,
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

/** Loads physics, shows the arena behind the menus, and opens the screen the link asks for. */
export async function startOnline(
  container: HTMLElement,
  overlay: DevOverlay,
  serverUrl: string,
  route: Route,
): Promise<void> {
  const rapierVersion = await initPhysics();
  overlay.update({ physics: `Rapier ${rapierVersion}`, serverUrl, server: 'not connected' });
  // `?debug` adds Colyseus' netcode panel: prediction drift and a latency simulator.
  if (new URLSearchParams(window.location.search).has('debug')) {
    import('@colyseus/sdk/debug').catch((error: unknown) => console.warn(error));
  }
  const game = new OnlineGame(container, overlay, serverUrl);
  game.start();
  game.open(route);
}

/** Shown before the server has placed us: the team 0 spawn, standing still. */
const WAITING_STATE = createPlayerState(ARENA.spawns[0][0], Math.PI, 0);

/** Why a session ended. */
type LeaveReason = 'left' | 'kicked' | 'lost';

/** The page's query string without the `?quick` shortcut (so a refresh doesn't make a new lobby). */
function searchWithoutQuick(): string {
  const params = new URLSearchParams(window.location.search);
  params.delete('quick');
  const search = params.toString();
  return search ? `?${search}` : '';
}

/**
 * The multiplayer game: the start and lobby screens, then a match room with the server in
 * charge. The 3D arena is always drawn, behind the menus too.
 */
class OnlineGame {
  private readonly world: World;
  private readonly overlay: DevOverlay;
  private readonly serverUrl: string;
  private readonly screens = new Screens();
  private readonly banner = new MatchBanner();
  private session: NetSession | null = null;
  private readonly waitingFeet = new Vector3(WAITING_STATE.x, WAITING_STATE.y, WAITING_STATE.z);

  constructor(container: HTMLElement, overlay: DevOverlay, serverUrl: string) {
    this.overlay = overlay;
    this.serverUrl = serverUrl;
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
      // The lobby screens come first; the pause menu appears when the match does.
      false,
    );
    this.world.view.yaw = Math.PI;
  }

  start(): void {
    this.world.start(this.frame);
  }

  /** A refreshed tab first tries to take its player back; otherwise the link decides. */
  open(route: Route): void {
    const token = loadReconnectToken(CONFIG.net.reconnectSeconds);
    clearReconnectToken();
    if (!token) {
      this.openRoute(route);
      return;
    }
    this.overlay.update({ server: 'rejoining…' });
    rejoinLobby(this.serverUrl, token).then(
      (room) => this.enter(room),
      (error: unknown) => {
        console.info('[net] could not rejoin as the same player', error);
        this.overlay.update({ server: 'not connected' });
        this.openRoute(route);
      },
    );
  }

  private openRoute(route: Route): void {
    if (route.kind === 'join') this.showJoin(route.code);
    else if (route.kind === 'quick') this.quickStart();
    else this.showHome(route.badCode ? `"${route.badCode}" isn't a lobby code.` : '');
  }

  private showHome(note = ''): void {
    window.history.replaceState(null, '', `/${searchWithoutQuick()}`);
    this.screens.showHome(
      { create: () => this.showJoin(null), joinCode: (code) => this.showJoin(code) },
      note,
    );
  }

  /** Name and role, then join the lobby `code`, or create a new one when `code` is null. */
  private showJoin(code: string | null): void {
    const settings = this.world.settings;
    let preview: LookPreview | null = null;
    const form = this.screens.showJoin({
      code,
      name: settings.name,
      weapon: settings.weapon,
      look: settings.look,
      pickWeapon: (weapon) => {
        settings.weapon = weapon;
        saveSettings(settings);
        preview?.setWeapon(weapon);
      },
      changeLook: (look) => {
        settings.look = look;
        saveSettings(settings);
        preview?.setLook(look);
      },
      back: () => this.showHome(),
      submit: (name) => {
        settings.name = name.trim();
        saveSettings(settings);
        form.busy(code ? 'Joining…' : 'Creating lobby…');
        const options = { name: settings.name, weapon: settings.weapon, look: settings.look };
        const joining = code
          ? joinLobby(this.serverUrl, code, options)
          : createLobby(this.serverUrl, options);
        joining.then(
          (room) => this.enter(room),
          (error: unknown) => {
            console.warn('[net] could not join', error);
            form.failed(
              code
                ? `Couldn't join ${code}. The lobby may have closed or be full.`
                : "Couldn't reach the game server. Is it running?",
            );
          },
        );
      },
    });
    const shown = new LookPreview(form.preview, settings.look, settings.weapon);
    preview = shown;
    this.screens.onClose(() => shown.dispose());
  }

  /** Dev shortcut (`?quick`): make a lobby with the saved name and start it straight away. */
  private quickStart(): void {
    const settings = this.world.settings;
    createLobby(this.serverUrl, {
      name: settings.name || QUICK_NAME,
      weapon: settings.weapon,
      look: settings.look,
    }).then(
      (room) => {
        this.enter(room);
        room.send(MSG_START);
      },
      (error: unknown) => {
        console.warn('[net] quick start failed', error);
        this.screens.showMessage('No server', "Couldn't reach the game server. Is it running?", {
          label: 'Try again',
          run: () => window.location.reload(),
        });
      },
    );
  }

  private enter(room: MatchRoom): void {
    // The address bar shows the lobby's link, ready to share.
    window.history.replaceState(null, '', `${joinPath(room.roomId)}${searchWithoutQuick()}`);
    this.screens.hide();
    this.session = new NetSession(
      this.world,
      this.overlay,
      room,
      this.screens,
      this.banner,
      (why) => this.afterLeave(why),
    );
  }

  private afterLeave(why: LeaveReason): void {
    this.session?.dispose();
    this.session = null;
    this.banner.hide();
    this.world.setMenuVisible(false);
    this.overlay.update({ server: 'not connected', players: undefined });
    const home = { label: 'Back to start', run: () => this.showHome() };
    if (why === 'kicked') {
      this.screens.showMessage('Removed', 'The host removed you from the lobby.', home);
    } else if (why === 'lost') {
      this.screens.showMessage('Disconnected', 'Lost the connection to the lobby.', home);
    } else {
      this.showHome();
    }
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
 * One joined match room. In the lobby it keeps the lobby screen up to date; from the team
 * reveal on it runs the game: our predicted player plus smoothed remote players. Shots on
 * screen are for show (our own appear instantly, others' as the server reports them); the
 * paint they leave comes from the server, so every screen has the same paint.
 */
class NetSession {
  private readonly world: World;
  private readonly overlay: DevOverlay;
  private readonly room: MatchRoom;
  private readonly screens: Screens;
  private readonly banner: MatchBanner;
  private readonly predict: Predict<MatchState>;
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
  /** The phase the screens were last set up for (null: not yet). */
  private shownPhase: MatchPhase | null = null;
  /** What the lobby screen last showed, so it's only rebuilt when something changes. */
  private lobbyKey = '';
  private lanAddresses: string[] = [];
  private askedForLan = false;
  private qr: { url: string; svg: string } | null = null;
  private kicked = false;
  private leaving = false;
  /** The look editor is open over the lobby. */
  private editingLook = false;
  private readonly saveToken = () => saveReconnectToken(this.room.reconnectionToken);

  constructor(
    world: World,
    overlay: DevOverlay,
    room: MatchRoom,
    screens: Screens,
    banner: MatchBanner,
    ended: (why: LeaveReason) => void,
  ) {
    this.world = world;
    this.overlay = overlay;
    this.room = room;
    this.screens = screens;
    this.banner = banner;
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
    room.onMessage(MSG_KICKED, () => {
      this.kicked = true;
    });
    room.onMessage(MSG_LAN_ADDRESSES, (addresses: unknown) => {
      if (Array.isArray(addresses)) {
        this.lanAddresses = addresses.filter((a): a is string => typeof a === 'string');
      }
    });
    // Handlers are in place, so the snapshot can't arrive before we listen for it.
    room.send(MSG_REQUEST_PAINT);
    this.meterTraffic();

    // Leaving the page (refresh, or switching away on a phone): remember how to rejoin.
    window.addEventListener('pagehide', this.saveToken);

    room.onDrop(() => this.overlay.update({ server: 'reconnecting…' }));
    room.onReconnect(() => {
      this.overlay.update({ server: 'connected' });
      // Paint may have changed while we were away.
      room.send(MSG_REQUEST_PAINT);
      this.meterTraffic();
    });
    room.onLeave((code) => {
      clearReconnectToken();
      console.info(`[net] left lobby ${room.roomId} (code ${code})`);
      ended(this.kicked ? 'kicked' : this.leaving ? 'left' : 'lost');
    });
    this.overlay.update({ server: `lobby ${room.roomId}` });
  }

  /** Cleans up after leaving: characters, physics body, shots and paint. */
  dispose(): void {
    window.removeEventListener('pagehide', this.saveToken);
    for (const remote of this.remotes.values()) this.world.removeCharacter(remote.character);
    this.remotes.clear();
    if (this.character) this.world.removeCharacter(this.character);
    if (this.body) this.world.physics.removeCharacter(this.body);
    this.shots.length = 0;
    this.world.paint.clear();
    this.world.atlas.clear();
  }

  frame(timeMs: number): void {
    const world = this.world;
    const phase = parsePhase(this.room.state.phase);
    this.updateScreens(phase);
    const me = this.me;
    const dt = world.beginFrame(timeMs, me?.state.aiming ?? false);
    if (phase !== 'lobby') this.syncPlayers();

    // One input per fixed server tick that's due, sent before reading anything to draw.
    const steps = this.predict.tick();
    if (me) for (let i = 0; i < steps; i++) this.sendInput();

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
    } else {
      this.feet.set(WAITING_STATE.x, WAITING_STATE.y, WAITING_STATE.z);
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

  /** Asks the server for another role (it checks the choice and refills the tank). */
  chooseWeapon(weapon: number): void {
    this.room.send(MSG_CHOOSE_WEAPON, weapon);
  }

  /** The lobby screen, then the team reveal, the countdown and GO as the phase moves on. */
  private updateScreens(phase: MatchPhase): void {
    const previous = this.shownPhase;
    this.shownPhase = phase;
    if (phase === 'lobby') {
      if (previous !== 'lobby') {
        this.world.setMenuVisible(false);
        this.banner.hide();
      }
      this.updateLobby();
      return;
    }
    if (previous === 'lobby' || previous === null) {
      // The match is on: menus away, and the pause menu's Play button to capture the mouse.
      this.screens.hide();
      this.lobbyKey = '';
      this.editingLook = false;
      this.world.setMenuVisible(true);
    }
    const secondsLeft = this.room.state.countdown;
    if (phase === 'reveal') this.banner.showReveal(this.teamNames(), secondsLeft);
    else if (phase === 'countdown') this.banner.showCountdown(secondsLeft);
    else if (previous === 'countdown') this.banner.showGo();
    else if (previous !== 'playing') this.banner.hide();
  }

  private updateLobby(): void {
    // The look editor stays up until Done, even if the player list changes meanwhile.
    if (this.editingLook) return;
    const state = this.room.state;
    const isHost = state.hostId === this.room.sessionId;
    if (isHost && !this.askedForLan && isLocalPage(window.location.hostname)) {
      // The QR code needs this computer's network address; the server knows it.
      this.askedForLan = true;
      this.room.send(MSG_REQUEST_LAN);
    }
    const players: LobbyPlayer[] = [];
    for (const [id, player] of state.players) {
      players.push({
        id,
        name: player.name,
        host: id === state.hostId,
        me: id === this.room.sessionId,
      });
    }
    const link = joinUrl(window.location, this.room.roomId, this.lanAddresses);
    if (isHost && this.qr?.url !== link) this.qr = { url: link, svg: qrCodeSvg(link) };

    const key = JSON.stringify([players, isHost, state.matchMinutes, link]);
    if (key === this.lobbyKey) return;
    this.lobbyKey = key;
    this.screens.showLobby(
      {
        code: this.room.roomId,
        players,
        isHost,
        matchMinutes: state.matchMinutes,
        qrSvg: isHost ? (this.qr?.svg ?? null) : null,
        joinLink: link,
      },
      {
        start: () => this.room.send(MSG_START),
        kick: (id) => this.room.send(MSG_KICK, id),
        setMinutes: (minutes) => this.room.send(MSG_MATCH_LENGTH, minutes),
        editLook: () => this.openLookEditor(),
        leave: () => {
          this.leaving = true;
          this.room.leave().catch((error: unknown) => console.warn(error));
        },
      },
    );
  }

  /** The look editor, over the lobby: every change goes to the server (and everyone) at once. */
  private openLookEditor(): void {
    const settings = this.world.settings;
    this.editingLook = true;
    let preview: LookPreview | null = null;
    const host = this.screens.showLookEditor(
      settings.look,
      (look) => {
        settings.look = look;
        saveSettings(settings);
        preview?.setLook(look);
        this.room.send(MSG_SET_LOOK, look);
      },
      () => {
        this.editingLook = false;
        // Rebuild the lobby screen on the next frame.
        this.lobbyKey = '';
      },
    );
    const shown = new LookPreview(host, settings.look, settings.weapon);
    preview = shown;
    this.screens.onClose(() => shown.dispose());
  }

  /** Names on each team, for the reveal. */
  private teamNames(): [string[], string[]] {
    const teams: [string[], string[]] = [[], []];
    for (const player of this.room.state.players.values()) {
      teams[player.team === 1 ? 1 : 0].push(player.name);
    }
    return teams;
  }

  /**
   * One predicted tick of our own player: movement, then the weapon. Shots it fires appear
   * on screen right away, unless it's a replay of a tick whose shots are already flying.
   * Before GO only looking around works, exactly as on the server.
   */
  private predictTick(
    state: PlayerState,
    input: PlayerInput,
    dt: number,
    body: Collider,
    newShots: NewShotFilter,
  ): void {
    const world = this.world;
    const command = parsePhase(this.room.state.phase) === 'playing' ? input : frozenInput(input);
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

  /** Creates characters for players who just entered the arena and removes those who left. */
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
      const character = world.createCharacter(player.team, player.weapon, parseLook(player));
      // Other players get their name overhead, in their team's color.
      character.setName(player.name, TEAM_COLORS[player.team] ?? TEAM_COLORS[0]);
      this.remotes.set(sessionId, { player, character });
      return;
    }
    // Our own player: predicted locally with the same rules the server runs.
    this.character = world.createCharacter(player.team, player.weapon, parseLook(player));
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
