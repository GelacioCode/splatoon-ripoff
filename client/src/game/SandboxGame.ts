import {
  CircleGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  REVISION,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { ARENA, buildSurfaces, clamp, CONFIG, PaintGrid, type Vec3 } from '@paint-rush/shared';
import {
  aimDirection,
  createPlayerState,
  initPhysics,
  muzzlePosition,
  PhysicsWorld,
  stepPlayer,
  stepProjectiles,
  stepWeapon,
  type Collider,
  type PlayerState,
  type Projectile,
  type ProjectileHit,
} from '@paint-rush/shared/sim';
import { Sfx } from '../audio/Sfx';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { InputManager } from '../input/InputManager';
import { BlobCharacter } from '../render/BlobCharacter';
import { createMapMesh } from '../render/mapMesh';
import { packAtlas } from '../render/paint/atlasPacker';
import { PaintAtlas } from '../render/paint/PaintAtlas';
import { HEMISPHERE_GROUND_COLOR, SKY_COLOR, SUN_DIRECTION, TEAM_COLORS } from '../render/palette';
import { Particles } from '../render/Particles';
import { ProjectileView } from '../render/ProjectileView';
import { createToonRamp } from '../render/toon';
import type { DevOverlay } from '../ui/devOverlay';
import { createHud } from '../ui/hud';
import { createStartScreen } from '../ui/startScreen';
import { toggleTuningPanel } from '../ui/tuningPanel';
import { FixedStep } from './fixedStep';

/** Team 0 (pink) starts at −Z and faces +Z, toward the middle of the map. */
const START_TEAM = 0;
const SPAWN_YAW = Math.PI;
/** Falling below this height puts you back on your spawn. */
const RESPAWN_BELOW_Y = -10;
/** Identifies this player's shots (Phase 2 uses a per-player seed). */
const PLAYER_SEED = 1;
/** Paint texture size and the most detail per meter it may use. */
const PAINT_TEXTURE_SIZE = 2048;
const PAINT_PIXELS_PER_METER = 16;
/** How far ahead the crosshair looks for something to aim at (m). */
const AIM_DISTANCE = 80;
/** Enemy-colored patches painted at the start, to see and test the other team's paint. */
const PRE_PAINTED: { at: Vec3; radius: number }[] = [
  { at: { x: 0, y: 0, z: -13 }, radius: 2.2 },
  { at: { x: -10, y: 0, z: -7 }, radius: 2 },
  { at: { x: 9, y: 0, z: -19 }, radius: 1.8 },
  { at: { x: 0, y: 1.5, z: 0 }, radius: 2.5 },
  { at: { x: -7, y: 1.4, z: -15.4 }, radius: 1.3 },
];
const UP = new Vector3(0, 1, 0);
const DOWN: Vec3 = { x: 0, y: -1, z: 0 };

/** Loads physics, builds the offline sandbox and starts it. */
export async function startSandbox(container: HTMLElement, overlay: DevOverlay): Promise<void> {
  const rapierVersion = await initPhysics();
  overlay.update({ physics: `Rapier ${rapierVersion}` });
  new SandboxGame(container, overlay).start();
}

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** Phase 1 offline sandbox: one player running, jumping and painting the arena. */
class SandboxGame {
  private readonly overlay: DevOverlay;
  private readonly renderer = new WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  private readonly scene = new Scene();
  private readonly physics = new PhysicsWorld(ARENA.blocks);
  private readonly surfaces = buildSurfaces(ARENA.blocks);
  private readonly paint = new PaintGrid(this.surfaces);
  private readonly atlas: PaintAtlas;
  private readonly view = new ThirdPersonCamera(window.innerWidth / window.innerHeight);
  private readonly loop = new FixedStep(1 / CONFIG.net.tickRate);
  private readonly input: InputManager;
  private readonly player: PlayerState;
  private readonly body: Collider;
  private readonly character: BlobCharacter;
  private readonly shadow: Mesh;
  private readonly projectiles: Projectile[] = [];
  private readonly projectileView = new ProjectileView(TEAM_COLORS);
  private readonly particles: Particles;
  private readonly sfx = new Sfx();
  private readonly hud = createHud();
  /** Feet position before and after the latest tick, for drawing in between. */
  private readonly previousFeet = new Vector3();
  private readonly currentFeet = new Vector3();
  private readonly renderFeet = new Vector3();
  private readonly shadowNormal = new Vector3();
  private emptyClickCooldown = 0;
  private lastFrameMs = 0;
  private framesCounted = 0;
  private statsSeconds = 0;

  constructor(container: HTMLElement, overlay: DevOverlay) {
    this.overlay = overlay;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.scene.background = new Color(SKY_COLOR);
    this.scene.add(new HemisphereLight(0xffffff, HEMISPHERE_GROUND_COLOR, 1.4));
    const sun = new DirectionalLight(0xffffff, 2);
    sun.position.set(...SUN_DIRECTION).multiplyScalar(30);
    this.scene.add(sun);

    const layout = packAtlas(this.surfaces, PAINT_TEXTURE_SIZE, PAINT_PIXELS_PER_METER);
    this.atlas = new PaintAtlas(this.renderer, this.surfaces, layout);
    this.scene.add(createMapMesh(ARENA, this.surfaces, this.atlas));

    const toonRamp = createToonRamp();
    this.character = new BlobCharacter(TEAM_COLORS[START_TEAM], toonRamp);
    this.scene.add(this.character.root);
    this.particles = new Particles(300, toonRamp);
    this.scene.add(this.particles.mesh, this.projectileView.mesh);

    const shadowGeometry = new CircleGeometry(0.42, 24);
    shadowGeometry.rotateX(-Math.PI / 2);
    this.shadow = new Mesh(
      shadowGeometry,
      new MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      }),
    );
    this.scene.add(this.shadow);

    this.player = createPlayerState(this.spawnPoint(), SPAWN_YAW, START_TEAM);
    this.body = this.physics.createCharacter(this.player);
    this.view.yaw = SPAWN_YAW;
    this.syncFeet();
    this.prePaint();

    const startScreen = createStartScreen(() => this.input.keyboardMouse.requestLock());
    this.input = new InputManager(this.renderer.domElement, (locked) => {
      startScreen.setVisible(!locked);
    });

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.view.setAspect(window.innerWidth / window.innerHeight);
    });
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Backquote' || event.repeat) return;
      // Free the mouse so the panel's sliders can be used.
      if (document.pointerLockElement) document.exitPointerLock();
      toggleTuningPanel({
        respawn: () => this.respawn(),
        clearPaint: () => {
          this.paint.clear();
          this.atlas.clear();
        },
        switchTeam: () => {
          this.player.team = 1 - this.player.team;
          this.character.setColor(TEAM_COLORS[this.player.team]);
        },
        refillInk: () => {
          this.player.ink = CONFIG.weapon.inkCapacity;
        },
      });
    });
  }

  start(): void {
    this.overlay.update({ renderer: `three r${REVISION} · WebGL2` });
    this.renderer.setAnimationLoop(this.frame);
  }

  private readonly frame = (timeMs: number): void => {
    const dt = this.lastFrameMs === 0 ? 0 : Math.min((timeMs - this.lastFrameMs) / 1000, 0.25);
    this.lastFrameMs = timeMs;

    // Aim follows the mouse every frame, so looking around never waits for a tick.
    const look = this.input.consumeLook();
    this.view.look(look.x, look.y, CONFIG.camera.mouseSensitivity);

    this.loop.stepSeconds = 1 / CONFIG.net.tickRate;
    const steps = this.loop.advance(dt);
    for (let i = 0; i < steps; i++) this.tick();

    // Draw between the last two ticks so motion stays smooth at any frame rate.
    const alpha = this.loop.alpha;
    this.renderFeet.lerpVectors(this.previousFeet, this.currentFeet, alpha);
    const s = this.player;
    this.character.update(dt, {
      x: this.renderFeet.x,
      y: this.renderFeet.y,
      z: this.renderFeet.z,
      yaw: this.view.yaw,
      vx: s.vx,
      vy: s.vy,
      vz: s.vz,
      grounded: s.grounded,
    });
    this.updateShadow();
    this.projectileView.update(this.projectiles, alpha);
    this.particles.update(dt);
    this.atlas.flush();
    const ink = s.ink / CONFIG.weapon.inkCapacity;
    this.hud.update(ink, cssColor(TEAM_COLORS[s.team]), ink < 0.2);
    this.view.update(this.renderFeet, dt, this.raycastDistance);
    this.renderer.render(this.scene, this.view.camera);
    this.updateStats(dt);
  };

  private tick(): void {
    const s = this.player;
    const dt = this.loop.stepSeconds;
    this.previousFeet.set(s.x, s.y, s.z);
    const input = this.input.sampleTick(this.view.yaw, this.aimPitch());
    stepPlayer(this.physics, this.body, s, input, dt);

    const fired = stepWeapon(s, input, dt, PLAYER_SEED, this.projectiles);
    if (fired > 0) this.sfx.shoot();
    this.emptyClickCooldown -= dt;
    if (input.fire && s.ink < CONFIG.weapon.inkPerShot && this.emptyClickCooldown <= 0) {
      this.sfx.empty();
      this.emptyClickCooldown = 0.25;
    }
    stepProjectiles(this.physics, this.projectiles, dt, this.handleHit);

    this.physics.step();
    if (s.y < RESPAWN_BELOW_Y) this.respawn();
    this.currentFeet.set(s.x, s.y, s.z);
  }

  /**
   * Pitch that sends shots from the nozzle to whatever the crosshair points at. The camera
   * sits above and beside the blaster, so aiming with the camera's own pitch would miss.
   */
  private aimPitch(): number {
    const eye = this.view.camera.position;
    const forward = aimDirection(this.view.yaw, this.view.pitch);
    const hit = this.physics.raycast(eye, forward, AIM_DISTANCE);
    const distance = hit ? hit.distance : AIM_DISTANCE;
    const target = {
      x: eye.x + forward.x * distance,
      y: eye.y + forward.y * distance,
      z: eye.z + forward.z * distance,
    };
    const s = this.player;
    const muzzle = muzzlePosition({ x: s.x, y: s.y, z: s.z, yaw: this.view.yaw });
    const horizontal = Math.hypot(target.x - muzzle.x, target.z - muzzle.z);
    // Very close targets (e.g. hugging a wall) would give wild angles; use the camera's pitch.
    if (horizontal < 1) return this.view.pitch;
    return Math.atan2(target.y - muzzle.y, horizontal);
  }

  private readonly handleHit = (hit: ProjectileHit): void => {
    const splats = this.paint.splat(hit.point, CONFIG.weapon.splatRadius, hit.team);
    this.atlas.add(splats, hit.team);
    this.particles.burst(hit.point, hit.normal, TEAM_COLORS[hit.team], 6);
    const s = this.player;
    const distance = Math.hypot(hit.point.x - s.x, hit.point.y - s.y, hit.point.z - s.z);
    this.sfx.splat(clamp(1 - distance / 30, 0.1, 1));
  };

  private prePaint(): void {
    const enemy = 1 - START_TEAM;
    for (const { at, radius } of PRE_PAINTED) {
      this.atlas.add(this.paint.splat(at, radius, enemy), enemy);
    }
  }

  private readonly raycastDistance = (origin: Vec3, direction: Vec3, maxDistance: number) =>
    this.physics.raycast(origin, direction, maxDistance)?.distance ?? null;

  /** A soft dark disc under the player, so you can judge jumps. */
  private updateShadow(): void {
    const feet = this.renderFeet;
    const hit = this.physics.raycast({ x: feet.x, y: feet.y + 0.3, z: feet.z }, DOWN, 30);
    this.shadow.visible = hit !== null;
    if (!hit) return;
    this.shadowNormal.set(hit.normal.x, hit.normal.y, hit.normal.z);
    this.shadow.quaternion.setFromUnitVectors(UP, this.shadowNormal);
    this.shadow.position.set(hit.point.x, hit.point.y, hit.point.z);
    this.shadow.position.addScaledVector(this.shadowNormal, 0.03);
    this.shadow.scale.setScalar(clamp(1 - (feet.y - hit.point.y) * 0.15, 0.4, 1));
  }

  private spawnPoint(): Vec3 {
    const spawn = ARENA.spawns[START_TEAM][0];
    // Drop in from just above the pad.
    return { x: spawn.x, y: spawn.y + 0.05, z: spawn.z };
  }

  private respawn(): void {
    const team = this.player.team;
    Object.assign(this.player, createPlayerState(this.spawnPoint(), SPAWN_YAW, team));
    this.view.yaw = SPAWN_YAW;
    this.syncFeet();
  }

  /** Snaps the drawn position to the current state (no in-between blend). */
  private syncFeet(): void {
    this.currentFeet.set(this.player.x, this.player.y, this.player.z);
    this.previousFeet.copy(this.currentFeet);
  }

  private updateStats(dt: number): void {
    this.framesCounted++;
    this.statsSeconds += dt;
    if (this.statsSeconds < 0.5) return;
    this.overlay.update({
      fps: Math.round(this.framesCounted / this.statsSeconds),
      tickRate: CONFIG.net.tickRate,
    });
    this.framesCounted = 0;
    this.statsSeconds = 0;
  }
}
