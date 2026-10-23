import { Vector3 } from 'three';
import { Client, Predict, type InputHandle } from '@colyseus/sdk';
import {
  ARENA,
  arenaFor,
  CONFIG,
  decodePaintEvents,
  decodePaintSnapshot,
  decodeShotEvents,
  MatchState,
  MSG_CAPTURE_GOAL,
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
  MSG_PLAY_AGAIN,
  MSG_PONG,
  MSG_REQUEST_LAN,
  MSG_REQUEST_PAINT,
  MSG_SET_BOTS,
  MSG_SET_LOOK,
  MSG_SHOTS,
  MSG_SPLAT,
  MSG_START,
  NetInput,
  parseFlagState,
  parseLook,
  parsePhase,
  ROOM_MATCH,
  seedFromString,
  wrapAngle,
  type MatchJoinOptions,
  type MatchPhase,
  type NetPlayer,
  type SplatEvent,
  type Vec3,
} from '@paint-rush/shared';
import {
  createPlayerState,
  createProjectile,
  frozenInput,
  initPhysics,
  playerHitSphere,
  segmentHitsSphere,
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
import { FlagView } from '../render/FlagView';
import { LookPreview } from '../render/LookPreview';
import { ObjectiveArrow } from '../render/ObjectiveArrow';
import { TEAM_COLORS } from '../render/palette';
import { saveSettings } from '../settings';
import { Announcer } from '../ui/announcer';
import type { DevOverlay } from '../ui/devOverlay';
import { Minimap, type MinimapFrame, type MinimapPoint } from '../ui/minimap';
import { qrCodeSvg } from '../ui/qrCode';
import { Scoreboard } from '../ui/scoreboard';
import { MatchBanner, Screens, type LobbyPlayer } from '../ui/screens';
import { StatsOverlay } from '../ui/statsOverlay';
import type { StatsRow } from '../ui/statsTable';
import { FixedStep } from './fixedStep';
import { NewShotFilter } from './newShotFilter';
import { flagObjective, type Objective } from './objective';
import { snapshotOf, World, type PlayerSnapshot } from './World';

/** How often the dev overlay's connection line refreshes (s). */
const STATUS_INTERVAL = 0.5;
/** Fields smoothed for drawing other players (yaw is smoothed separately, as an angle). */
const SMOOTHED_FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'swimBlend'] as const;
/** Other players' shots sound this much quieter than your own. */
const REMOTE_SHOT_VOLUME = 0.5;
/** Name used by the `?quick` dev shortcut when none was ever entered. */
const QUICK_NAME = 'Tester';
/** A respawned player stays hidden this long, while their drawn position catches up (ms). */
const RESPAWN_HIDE_MS = 300;
/** Losing at least this much HP at once (a shot, not enemy paint) flashes the screen. */
const HURT_FLASH_HP = 5;
const UP = { x: 0, y: 1, z: 0 };
/** How often the minimap re-reads the paint (s). */
const MINIMAP_PAINT_INTERVAL = 0.25;
/** How long "Pink team wins!" shows before the results screen (ms). */
const RESULTS_DELAY_MS = 2500;

/** Byte messages arrive as Uint8Array; anything else means a server/client version mismatch. */
function asBytes(payload: unknown): Uint8Array | null {
  if (payload instanceof Uint8Array) return payload;
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  return null;
}

/** Makes a new lobby; the room id the server gives it is the lobby code. */
function createLobby(serverUrl: string, options: MatchJoinOptions) {
  // Dev testing: `?arena=1` / `?arena=2` asks for a bigger arena (the server ignores it in
  // production).
  const arena = Number(new URLSearchParams(window.location.search).get('arena'));
  const devArenaSize = Number.isInteger(arena) && arena > 0 ? arena : undefined;
  return new Client(serverUrl).create(ROOM_MATCH, { ...options, devArenaSize }, MatchState);
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
      {
        create: () => this.showJoin(null),
        playWithBots: () => this.showJoin(null, true),
        joinCode: (code) => this.showJoin(code),
      },
      note,
    );
  }

  /**
   * Name and role, then join the lobby `code`, or create a new one when `code` is null (with
   * the default number of bots in it, for "Play with bots").
   */
  private showJoin(code: string | null, withBots = false): void {
    const settings = this.world.settings;
    let preview: LookPreview | null = null;
    const form = this.screens.showJoin({
      code,
      withBots,
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
          : createLobby(this.serverUrl, {
              ...options,
              bots: withBots ? CONFIG.lobby.defaultBots : undefined,
            });
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
  /** Kept hidden until this time (ms), just after a respawn. */
  hiddenUntil: number;
  /** The team they're drawn in (teams change between matches). */
  team: number;
}

/** Someone drawn on screen, where shots can stop. */
interface ShotTarget {
  x: number;
  y: number;
  z: number;
  swimBlend: number;
  team: number;
}

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** Spawn protection shows as blinking. */
function blinking(protectTimer: number, timeMs: number): boolean {
  return protectTimer > 0 && Math.floor(timeMs / 100) % 2 === 0;
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
  /** Everyone drawn this frame who could stop a shot on screen. */
  private readonly targets: ShotTarget[] = [];
  private splattedBy = 'someone';
  private wasSplatted = false;
  private lastHp: number = CONFIG.player.maxHp;
  /** The team our own blob is drawn in. */
  private myTeam = -1;
  // Capture the Flag on screen.
  private readonly flagView: FlagView;
  /** The yellow arrow over our own head, pointing at what to do. */
  private readonly arrow: ObjectiveArrow;
  private readonly scoreboard = new Scoreboard();
  private readonly announcer = new Announcer();
  private readonly minimap: Minimap;
  private readonly statsOverlay: StatsOverlay;
  /** Where the flag is on the minimap this frame. */
  private flagOnMap: MinimapFrame['flag'] = null;
  private paintRefreshTimer = 0;
  /** When the match ended (ms), and whether the results screen is up yet. */
  private endedAt = 0;
  private resultsShown = false;
  /** The team that scored last, for the "Pink scores!" banner between rounds. */
  private lastScoringTeam = 0;
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
    this.flagView = new FlagView(world.toonRamp);
    world.scene.add(this.flagView.root);
    this.arrow = new ObjectiveArrow(world.toonRamp);
    world.scene.add(this.arrow.root);
    this.minimap = new Minimap(world.map, world.surfaces, world.paint);
    this.statsOverlay = new StatsOverlay(world.touchDevice);
    // Others are drawn slightly in the past, between two snapshots, so they move smoothly.
    this.predict = Predict.get(room, { mode: 'lerp', delay: CONFIG.net.interpolationDelayMs });
    this.netInput = room.input({ type: NetInput });
    this.predict.attachAll('players', { mode: 'lerp', fields: SMOOTHED_FIELDS });
    this.predict.attachAll('players', { mode: 'lerp', fields: ['yaw'], angle: true });

    room.onMessage(MSG_PAINT, (payload: unknown) => this.receivePaint(payload));
    room.onMessage(MSG_SHOTS, (payload: unknown) => this.receiveShots(payload));
    room.onMessage(MSG_PAINT_SNAPSHOT, (payload: unknown) => this.receiveSnapshot(payload));
    room.onMessage(MSG_PONG, (sentAt: unknown) => this.receivePong(sentAt));
    room.onMessage(MSG_HIT, (splat: unknown) => this.world.showHit(splat === true));
    room.onMessage(MSG_SPLAT, (payload: unknown) => this.receiveSplat(payload));
    room.onMessage(MSG_FLAG, (payload: unknown) => this.receiveFlag(payload));
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
    this.world.killFeed.clear();
    this.world.setSplatted(null);
    this.world.scene.remove(this.flagView.root);
    this.world.scene.remove(this.arrow.root);
    this.arrow.dispose();
    this.scoreboard.dispose();
    this.announcer.dispose();
    this.minimap.dispose();
    this.statsOverlay.dispose();
  }

  frame(timeMs: number): void {
    const world = this.world;
    this.ensureMap();
    const phase = parsePhase(this.room.state.phase);
    this.updateScreens(phase);
    const me = this.me;
    const dt = world.beginFrame(timeMs, me?.state.aiming ?? false);
    // Back in the lobby after a match, the arena stays empty until the next start.
    const inArena = phase !== 'lobby';
    if (inArena) this.syncPlayers();

    // One input per fixed server tick that's due, sent before reading anything to draw.
    const steps = this.predict.tick();
    if (me && inArena) for (let i = 0; i < steps; i++) this.sendInput();

    if (this.character && !inArena) this.character.root.visible = false;
    if (me && this.character && inArena) {
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
      // Teams are shuffled again for every match.
      if (s.team !== this.myTeam) {
        this.myTeam = s.team;
        this.character.setColor(TEAM_COLORS[s.team] ?? TEAM_COLORS[0]);
      }
      world.weaponSounds(this.wasReloading, s, this.firing, dt);
      this.wasReloading = s.reloadTimer > 0;
      this.character.root.visible = s.respawnTimer <= 0 && !blinking(s.protectTimer, timeMs);
      this.updateLife(s);
    } else {
      this.feet.set(WAITING_STATE.x, WAITING_STATE.y, WAITING_STATE.z);
    }

    // Who on screen can stop a shot: everyone visible (shots only stop at enemies).
    this.targets.length = 0;
    if (me && inArena && me.state.respawnTimer <= 0) {
      const s = me.state;
      this.targets.push({
        x: this.feet.x,
        y: this.feet.y,
        z: this.feet.z,
        swimBlend: s.swimBlend,
        team: s.team,
      });
    }
    for (const remote of this.remotes.values()) {
      if (!inArena) {
        remote.character.root.visible = false;
        continue;
      }
      const pose = this.remotePose(remote.player);
      remote.character.update(dt, pose);
      remote.character.setWeapon(remote.player.weapon);
      if (remote.player.team !== remote.team) {
        // A new match with new teams: recolor them and their name tag.
        remote.team = remote.player.team;
        const color = TEAM_COLORS[remote.team] ?? TEAM_COLORS[0];
        remote.character.setColor(color);
        remote.character.setName(remote.player.name, color);
      }
      // Hidden while splatted, and a moment longer so the jump back to spawn isn't seen.
      const splatted = remote.player.respawnTimer > 0;
      if (splatted) remote.hiddenUntil = timeMs + RESPAWN_HIDE_MS;
      const visible = !splatted && timeMs >= remote.hiddenUntil;
      remote.character.root.visible = visible && !blinking(remote.player.protectTimer, timeMs);
      if (visible) this.targets.push({ ...pose, team: remote.player.team });
    }

    // Shots fly at the game's tick rate (like on the server) and are drawn in between.
    // They stop at players here too, but only the server decides real hits and damage.
    const shotSteps = this.shotLoop.advance(dt);
    for (let i = 0; i < shotSteps; i++) {
      stepProjectiles(
        world.physics,
        this.shots,
        this.shotLoop.stepSeconds,
        (hit) => world.splash(hit, this.feet),
        (shot, from, direction, distance) => this.shotHitsTarget(shot, from, direction, distance),
      );
    }
    this.updateFlag(dt, phase);
    this.updateMinimap(dt, timeMs, phase);
    this.statsOverlay.setEnabled(phase === 'countdown' || phase === 'playing');
    this.statsOverlay.update(this.statsRows());
    if (phase === 'ended') this.maybeShowResults();
    world.drawFrame(dt, this.feet, me?.state ?? WAITING_STATE, this.shots, this.shotLoop.alpha);
    this.updateStatus(dt);
  }

  /** For drawn shots: stops one at the first enemy it touches, with a little splash. */
  private shotHitsTarget(shot: Projectile, from: Vec3, direction: Vec3, distance: number): boolean {
    for (const target of this.targets) {
      if (target.team === shot.team) continue;
      const { center, radius } = playerHitSphere(target.x, target.y, target.z, target.swimBlend);
      if (!segmentHitsSphere(from, direction, distance, center, radius)) continue;
      const back = { x: -direction.x, y: -direction.y, z: -direction.z };
      this.world.particles.burst(center, back, TEAM_COLORS[shot.team] ?? TEAM_COLORS[0], 6);
      return true;
    }
    return false;
  }

  /** Our own splat and respawn: the "Splatted by" message, the hurt flash, the camera. */
  private updateLife(s: PlayerState): void {
    const splatted = s.respawnTimer > 0;
    this.world.setSplatted(
      splatted ? `Splatted by ${this.splattedBy} · back in ${Math.ceil(s.respawnTimer)}…` : null,
    );
    // Back on the spawn pad: look the way the spawn faces (toward the middle).
    if (this.wasSplatted && !splatted) this.world.view.yaw = s.yaw;
    this.wasSplatted = splatted;
    if (this.lastHp - s.hp >= HURT_FLASH_HP) this.world.flashHurt();
    this.lastHp = s.hp;
  }

  /** Someone was splatted: the burst, the sound, and a line in the kill feed. */
  private receiveSplat(payload: unknown): void {
    if (!payload || typeof payload !== 'object') return;
    const { victim, by, team } = payload as Partial<SplatEvent>;
    if (typeof victim !== 'string' || typeof team !== 'number') return;
    const players = this.room.state.players;
    const victimPlayer = players.get(victim);
    const attacker = (typeof by === 'string' && players.get(by)?.name) || 'someone';
    const victimName = victimPlayer?.name ?? 'someone';
    this.world.killFeed.add(attacker, team, victimName, victimPlayer?.team ?? 1 - team);
    if (victim === this.room.sessionId) this.splattedBy = attacker;

    const at =
      victim === this.room.sessionId || !victimPlayer
        ? { x: this.feet.x, y: this.feet.y, z: this.feet.z }
        : {
            x: this.predict.value(victimPlayer, 'x'),
            y: this.predict.value(victimPlayer, 'y'),
            z: this.predict.value(victimPlayer, 'z'),
          };
    const color = TEAM_COLORS[team] ?? TEAM_COLORS[0];
    this.world.particles.burst({ x: at.x, y: at.y + 0.6, z: at.z }, UP, color, 28, 6);
    this.world.sfx.splatBurst(this.world.loudnessAt(at, this.feet));
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
        // Back from a match (Play Again): the results make way for the lobby.
        this.world.setMenuVisible(false);
        this.banner.hide();
        this.scoreboard.setVisible(false);
        this.world.killFeed.clear();
        this.world.setSplatted(null);
        this.lobbyKey = '';
        this.resultsShown = false;
      }
      this.updateLobby();
      return;
    }
    if (phase === 'ended' && previous !== 'ended') {
      this.endedAt = performance.now();
      this.resultsShown = false;
    }
    if (previous === 'lobby' || previous === null) {
      // The match is on: menus away, and the pause menu's Play button to capture the mouse.
      this.screens.hide();
      this.lobbyKey = '';
      this.editingLook = false;
      this.world.setMenuVisible(true);
    }
    const state = this.room.state;
    const secondsLeft = state.countdown;
    this.scoreboard.setVisible(phase !== 'reveal');
    if (phase === 'reveal') this.banner.showReveal(this.teamNames(), secondsLeft);
    else if (phase === 'countdown') this.banner.showCountdown(secondsLeft);
    else if (phase === 'ended') {
      if (this.resultsShown) return;
      this.banner.showEnd(
        state.winner,
        state.winReason,
        [state.score0, state.score1],
        [state.turf0, state.turf1],
        state.capturesToWin,
      );
    } else if (phase === 'scored') {
      this.banner.showScored(
        this.lastScoringTeam,
        [state.score0, state.score1],
        state.capturesToWin,
      );
    } else if (previous === 'countdown') this.banner.showGo();
    else if (previous !== 'playing') this.banner.hide();
  }

  /**
   * The flag (at its spot, or on its carrier's back), our order under the scoreboard, and the
   * arrow over our head pointing where the order says to go.
   */
  private updateFlag(dt: number, phase: MatchPhase): void {
    const state = this.room.state;
    const flagState = state.flagState;
    const carrierId = state.flagCarrier;
    const myId = this.room.sessionId;
    const myTeam = state.players.get(myId)?.team ?? 0;
    let at: Vec3 | null = null;
    let yaw = 0;
    let color: number | null = null;
    const carried = flagState === 'carried';
    if (carried) {
      const carrier = state.players.get(carrierId);
      if (carrier) {
        color = TEAM_COLORS[carrier.team] ?? null;
        if (carrierId === myId) {
          at = { x: this.feet.x, y: this.feet.y, z: this.feet.z };
          yaw = this.world.view.yaw;
        } else {
          at = {
            x: this.predict.value(carrier, 'x'),
            y: this.predict.value(carrier, 'y'),
            z: this.predict.value(carrier, 'z'),
          };
          yaw = this.predict.value(carrier, 'yaw');
        }
      }
    } else if (flagState === 'home' || flagState === 'dropped') {
      at = { x: state.flagX, y: state.flagY, z: state.flagZ };
    }
    const active = phase !== 'lobby' && at !== null;
    this.flagOnMap =
      active && at ? { x: at.x, z: at.z, color: cssColor(color ?? 0xffffff), carried } : null;
    this.flagView.update(dt, active, at?.x ?? 0, at?.y ?? 0, at?.z ?? 0, carried, yaw, color);

    // Our order, and the arrow over our head pointing where it says to go.
    const onField = phase === 'countdown' || phase === 'playing';
    const objective = onField
      ? flagObjective({
          flagState: parseFlagState(flagState),
          carrierTeam: carried ? (state.players.get(carrierId)?.team ?? null) : null,
          carrierIsMe: carried && carrierId === myId,
          myTeam,
          flagTimer: state.flagTimer,
        })
      : null;
    this.scoreboard.setOrder(objective);
    const me = this.me?.state;
    const alive = me !== undefined && me.respawnTimer <= 0;
    const target = objective && alive ? this.objectiveSpot(objective, at, myTeam) : null;
    this.arrow.update(dt, this.feet, target, objective?.icon ?? 'flag', me?.aiming ?? false);
    this.scoreboard.update(state.score0, state.score1, state.timeLeft, state.capturesToWin);
  }

  /** Where an objective's arrow points: the flag, a base (its floor), or the middle. */
  private objectiveSpot(objective: Objective, flagAt: Vec3 | null, myTeam: number): Vec3 | null {
    const map = this.world.map;
    if (objective.target === 'flag') return flagAt;
    if (objective.target === 'middle') return map.flagSpawn;
    const team = objective.target === 'ownBase' ? myTeam : 1 - myTeam;
    const base = map.bases[team === 1 ? 1 : 0];
    return { x: base.center.x, y: base.center.y - base.size.y / 2, z: base.center.z };
  }

  /** The minimap while the match is on: paint refreshed a few times a second, moving bits every frame. */
  private updateMinimap(dt: number, timeMs: number, phase: MatchPhase): void {
    const visible = phase === 'countdown' || phase === 'playing';
    this.minimap.setVisible(visible);
    if (!visible) return;
    const players = this.room.state.players;
    const myId = this.room.sessionId;
    const myTeam = players.get(myId)?.team ?? 0;
    this.minimap.setTeam(myTeam);
    this.paintRefreshTimer -= dt;
    if (this.paintRefreshTimer <= 0) {
      this.paintRefreshTimer = MINIMAP_PAINT_INTERVAL;
      this.minimap.refreshPaint();
    }
    const mates: MinimapPoint[] = [];
    for (const [id, remote] of this.remotes) {
      const p = remote.player;
      if (id === myId || p.team !== myTeam || p.respawnTimer > 0) continue;
      mates.push({ x: this.predict.value(p, 'x'), z: this.predict.value(p, 'z') });
    }
    const alive = this.me && this.me.state.respawnTimer <= 0;
    this.minimap.draw(
      {
        me: alive ? { x: this.feet.x, z: this.feet.z, yaw: this.world.view.yaw } : null,
        mates,
        flag: this.flagOnMap,
      },
      timeMs,
    );
  }

  /** Everyone's numbers, for the live scoreboard and the results. */
  private statsRows(): StatsRow[] {
    const rows: StatsRow[] = [];
    for (const [id, p] of this.room.state.players) {
      rows.push({
        id,
        name: p.name,
        team: p.team,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        captures: p.captures,
        paint: p.paint,
        me: id === this.room.sessionId,
      });
    }
    return rows;
  }

  /**
   * After the "Pink team wins!" banner has had its moment, the results screen: everyone's
   * stats, and Play Again for the host.
   */
  private maybeShowResults(): void {
    if (this.resultsShown || performance.now() - this.endedAt < RESULTS_DELAY_MS) return;
    this.resultsShown = true;
    const state = this.room.state;
    this.banner.hide();
    // Free the mouse so the buttons can be clicked.
    this.world.setMenuVisible(false);
    this.screens.showResults({
      winner: state.winner,
      reason: state.winReason,
      scores: [state.score0, state.score1],
      turf: [state.turf0, state.turf1],
      rows: this.statsRows(),
      isHost: state.hostId === this.room.sessionId,
      playAgain: () => this.room.send(MSG_PLAY_AGAIN),
      leave: () => {
        this.leaving = true;
        this.room.leave().catch((error: unknown) => console.warn(error));
      },
    });
  }

  /** Flag news from the server, announced to everyone. */
  private receiveFlag(payload: unknown): void {
    if (!payload || typeof payload !== 'object') return;
    const event = payload as Partial<{ kind: string; by: string; team: number }>;
    const name =
      (typeof event.by === 'string' && this.room.state.players.get(event.by)?.name) || 'Someone';
    const team = typeof event.team === 'number' ? event.team : -1;
    const color = cssColor(TEAM_COLORS[team] ?? 0xffffff);
    const teamName = team === 0 ? 'Pink' : 'Cyan';
    if (event.kind === 'taken') {
      this.announcer.show(`${name} took the flag!`, color);
      this.world.sfx.fanfare(0.5);
    } else if (event.kind === 'captured') {
      if (team === 0 || team === 1) this.lastScoringTeam = team;
      this.announcer.show(`${name} scored for ${teamName}!`, color);
      this.world.sfx.fanfare(1);
    } else if (event.kind === 'dropped') {
      this.announcer.show(`${name} dropped the flag!`, color);
    } else if (event.kind === 'returned') {
      this.announcer.show('The flag went back to the middle');
    } else if (event.kind === 'reset') {
      this.announcer.show('The flag is back in the middle');
    }
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
    let bots = 0;
    for (const [id, player] of state.players) {
      if (player.bot) bots++;
      players.push({
        id,
        name: player.name,
        host: id === state.hostId,
        me: id === this.room.sessionId,
        bot: player.bot,
      });
    }
    const link = joinUrl(window.location, this.room.roomId, this.lanAddresses);
    if (isHost && this.qr?.url !== link) this.qr = { url: link, svg: qrCodeSvg(link) };

    const key = JSON.stringify([players, isHost, state.matchMinutes, state.capturesToWin, link]);
    if (key === this.lobbyKey) return;
    this.lobbyKey = key;
    this.screens.showLobby(
      {
        code: this.room.roomId,
        players,
        isHost,
        bots,
        // People keep their spots: bots fill only what's left.
        maxBots: CONFIG.lobby.maxPlayers - (players.length - bots),
        matchMinutes: state.matchMinutes,
        capturesToWin: state.capturesToWin,
        qrSvg: isHost ? (this.qr?.svg ?? null) : null,
        joinLink: link,
      },
      {
        start: () => this.room.send(MSG_START),
        kick: (id) => this.room.send(MSG_KICK, id),
        setMinutes: (minutes) => this.room.send(MSG_MATCH_LENGTH, minutes),
        setCaptureGoal: (captures) => this.room.send(MSG_CAPTURE_GOAL, captures),
        setBots: (count) => this.room.send(MSG_SET_BOTS, count),
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
    newShots: NewShotFilter,
  ): void {
    const world = this.world;
    // The body is remade whenever the arena changes, so always use the current one.
    const body = this.body;
    if (!body) return;
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
    this.ensureMap();
    for (const paint of decodePaintEvents(bytes)) this.world.paintAt(paint);
  }

  /**
   * Builds the arena the server is on, if it isn't the one shown (a new random layout after
   * every capture, or Drip Yard for a new match). The paint starts fresh, our own body is
   * remade in the new physics world, and shots still flying in the old arena are dropped.
   */
  private ensureMap(): void {
    const { mapSeed, arenaSize } = this.room.state;
    const key = `${mapSeed}:${arenaSize}`;
    if (key === this.world.mapKey) return;
    const world = this.world;
    world.loadMap(arenaFor(mapSeed, arenaSize), key);
    this.shots.length = 0;
    if (this.body && this.me) this.body = world.physics.createCharacter(this.me.state);
    this.minimap.setMap(world.map, world.surfaces, world.paint);
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
    // The snapshot is for the server's current arena: build that one first.
    this.ensureMap();
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
      this.remotes.set(sessionId, { player, character, hiddenUntil: 0, team: player.team });
      return;
    }
    // Our own player: predicted locally with the same rules the server runs.
    this.character = world.createCharacter(player.team, player.weapon, parseLook(player));
    this.myTeam = player.team;
    // The role may have been changed in the menu while we were still joining.
    if (player.weapon !== world.settings.weapon) this.chooseWeapon(world.settings.weapon);
    const body = world.physics.createCharacter(player);
    this.body = body;
    world.view.yaw = player.yaw;
    this.feet.set(player.x, player.y, player.z);
    const newShots = new NewShotFilter(player.shotCount);
    this.wasReloading = player.reloadTimer > 0;
    this.me = createReconciler(this.predict, player, this.netInput, (state, command, dt) =>
      this.predictTick(state, command, dt, newShots),
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
