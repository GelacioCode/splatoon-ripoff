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
import {
  ARENA,
  buildSurfaces,
  clamp,
  CONFIG,
  damp,
  lerp,
  PaintGrid,
  type Vec3,
} from '@paint-rush/shared';
import {
  aimDirection,
  createPlayerState,
  initPhysics,
  muzzlePosition,
  PhysicsWorld,
  reloadProgress,
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
import { DynamicResolution } from '../render/DynamicResolution';
import { createMapMesh } from '../render/mapMesh';
import { packAtlas } from '../render/paint/atlasPacker';
import { PaintAtlas } from '../render/paint/PaintAtlas';
import { HEMISPHERE_GROUND_COLOR, SKY_COLOR, SUN_DIRECTION, TEAM_COLORS } from '../render/palette';
import { Particles } from '../render/Particles';
import { ProjectileView } from '../render/ProjectileView';
import { QUALITY_PRESETS, resolveQuality, type QualityLevel } from '../render/quality';
import { createToonRamp } from '../render/toon';
import { loadSettings, saveSettings, type Settings } from '../settings';
import type { DevOverlay } from '../ui/devOverlay';
import { createHud } from '../ui/hud';
import { createPauseMenu } from '../ui/pauseMenu';
import { toggleTuningPanel, type TuningActions } from '../ui/tuningPanel';
import { FixedStep } from './fixedStep';

/** Team 0 (pink) starts at −Z and faces +Z, toward the middle of the map. */
const START_TEAM = 0;
const SPAWN_YAW = Math.PI;
/** Falling below this height puts you back on your spawn. */
const RESPAWN_BELOW_Y = -10;
/** Identifies this player's shots (Phase 2 uses a per-player seed). */
const PLAYER_SEED = 1;
/** Most paint detail per meter the paint texture may use. */
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
/** Landing faster than this (m/s) makes a puff of droplets. */
const LANDING_PUFF_SPEED = 5;
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

/** Phones and tablets get touch controls; computers get mouse and keyboard. */
function isTouchDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

/** Phase 1 offline sandbox: one player running, jumping, painting and swimming. */
class SandboxGame {
  private readonly overlay: DevOverlay;
  private readonly settings: Settings = loadSettings();
  private readonly touchDevice = isTouchDevice();
  private readonly quality: QualityLevel;
  private readonly renderer: WebGLRenderer;
  private readonly resolution = new DynamicResolution();
  private readonly scene = new Scene();
  private readonly physics = new PhysicsWorld(ARENA.blocks);
  private readonly surfaces = buildSurfaces(ARENA.blocks);
  private readonly paint = new PaintGrid(this.surfaces);
  private readonly atlas: PaintAtlas;
  private readonly view = new ThirdPersonCamera(window.innerWidth / window.innerHeight);
  private readonly loop = new FixedStep(1 / CONFIG.net.tickRate);
  private readonly input: InputManager;
  private readonly menu: ReturnType<typeof createPauseMenu>;
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
  private readonly tuningActions: TuningActions;
  private pixelRatio = 1;
  /** Smoothed aim-mode zoom, 0–1. */
  private aimBlend = 0;
  private emptyClickCooldown = 0;
  private swimTrailTimer = 0;
  private lastFrameMs = 0;
  private framesCounted = 0;
  private statsSeconds = 0;

  constructor(container: HTMLElement, overlay: DevOverlay) {
    this.overlay = overlay;
    this.quality = resolveQuality(this.settings.quality, this.touchDevice);
    const preset = QUALITY_PRESETS[this.quality];

    this.renderer = new WebGLRenderer({
      antialias: preset.antialias,
      powerPreference: 'high-performance',
    });
    this.applyPixelRatio(1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);
    this.sfx.setVolume(this.settings.volume);

    this.scene.background = new Color(SKY_COLOR);
    this.scene.add(new HemisphereLight(0xffffff, HEMISPHERE_GROUND_COLOR, 1.4));
    const sun = new DirectionalLight(0xffffff, 2);
    sun.position.set(...SUN_DIRECTION).multiplyScalar(30);
    this.scene.add(sun);

    const layout = packAtlas(this.surfaces, preset.paintTextureSize, PAINT_PIXELS_PER_METER);
    this.atlas = new PaintAtlas(this.renderer, this.surfaces, layout);
    this.scene.add(createMapMesh(ARENA, this.surfaces, this.atlas));

    const toonRamp = createToonRamp();
    this.character = new BlobCharacter(TEAM_COLORS[START_TEAM], toonRamp);
    this.scene.add(this.character.root);
    this.particles = new Particles(preset.particles, toonRamp);
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

    this.tuningActions = {
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
        this.player.reloadTimer = 0;
      },
    };

    this.menu = createPauseMenu(this.settings, this.touchDevice, {
      play: () => this.play(),
      settingsChanged: (settings, changed) => this.settingsChanged(settings, changed),
      enableGyro: () => this.input.gyro.enable(),
      openTuning: () => toggleTuningPanel(this.tuningActions),
    });
    this.input = new InputManager(
      this.renderer.domElement,
      this.touchDevice,
      (locked) => {
        // Desktop: playing exactly while the mouse is captured (Esc frees it and pauses).
        if (this.touchDevice) return;
        this.input.playing = locked;
        this.menu.setVisible(!locked);
      },
      () => this.pause(),
    );

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.view.setAspect(window.innerWidth / window.innerHeight);
    });
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Backquote' || event.repeat) return;
      // Free the mouse so the panel's sliders can be used.
      if (document.pointerLockElement) document.exitPointerLock();
      toggleTuningPanel(this.tuningActions);
    });
  }

  start(): void {
    this.overlay.update({ renderer: `three r${REVISION} · WebGL2 · ${this.quality} quality` });
    this.renderer.setAnimationLoop(this.frame);
  }

  private play(): void {
    if (!this.touchDevice) {
      this.input.keyboardMouse.requestLock();
      return;
    }
    this.input.playing = true;
    this.menu.setVisible(false);
    this.input.touch?.setVisible(true);
    // Best effort: fullscreen hides the browser bars (not supported on iPhone).
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    if (this.settings.gyro) {
      this.input.gyro.enable().catch(() => undefined);
    }
  }

  private pause(): void {
    this.input.playing = false;
    this.input.touch?.setVisible(false);
    this.menu.setVisible(true);
  }

  private settingsChanged(settings: Settings, changed: keyof Settings): void {
    saveSettings(settings);
    if (changed === 'volume') this.sfx.setVolume(settings.volume);
    if (changed === 'gyro' && !settings.gyro) this.input.gyro.disable();
    // Paint texture size and anti-aliasing are fixed when the renderer starts.
    if (changed === 'quality') window.location.reload();
  }

  private readonly frame = (timeMs: number): void => {
    const frameMs = this.lastFrameMs === 0 ? 0 : timeMs - this.lastFrameMs;
    const dt = Math.min(frameMs / 1000, 0.25);
    this.lastFrameMs = timeMs;
    if (frameMs > 0) this.applyPixelRatio(this.resolution.update(frameMs));

    // Aim follows the mouse/finger every frame, so looking around never waits for a tick.
    const look = this.input.consumeLook(this.settings);
    // Finer aim while zoomed in.
    this.aimBlend = damp(this.aimBlend, this.player.aiming ? 1 : 0, 14, dt);
    const lookScale = lerp(1, CONFIG.camera.aimSensitivity, this.aimBlend);
    this.view.look(look.x * lookScale, look.y * lookScale, 1);

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
      swimBlend: s.swimBlend,
      submerged: s.submerged,
      climbing: s.climbing,
    });
    this.updateShadow();
    this.projectileView.update(this.projectiles, alpha);
    this.particles.update(dt);
    this.atlas.flush();
    const ink = s.ink / CONFIG.weapon.inkCapacity;
    this.hud.update(ink, reloadProgress(s), cssColor(TEAM_COLORS[s.team]), ink < 0.2);
    this.hud.updateHealth(s.hp / CONFIG.player.maxHp, cssColor(TEAM_COLORS[1 - s.team]));
    // Widen the view while swimming fast, for a sense of speed.
    const swimSpeedRatio = clamp(Math.hypot(s.vx, s.vz) / CONFIG.swim.swimSpeed, 0, 1);
    const fovBoost = s.submerged ? CONFIG.camera.swimFovBoost * swimSpeedRatio : 0;
    this.view.update(
      this.renderFeet,
      dt,
      this.raycastDistance,
      s.swimBlend,
      fovBoost,
      this.aimBlend,
    );
    this.hud.setAiming(s.aiming);
    this.renderer.render(this.scene, this.view.camera);
    this.updateStats(dt);
  };

  private tick(): void {
    const s = this.player;
    const dt = this.loop.stepSeconds;
    this.previousFeet.set(s.x, s.y, s.z);
    const input = this.input.sampleTick(this.view.yaw, this.aimPitch());
    const wasSubmerged = s.submerged;
    const wasGrounded = s.grounded;
    const fallSpeed = -s.vy;
    stepPlayer(this.physics, this.body, s, input, dt, this.paint);
    this.swimEffects(wasSubmerged, dt);
    // Landing puff: a little splash at your feet after a real fall (not when swimming).
    if (s.grounded && !wasGrounded && fallSpeed > LANDING_PUFF_SPEED && s.swimBlend < 0.5) {
      const count = Math.round(clamp(fallSpeed / 2, 4, 12));
      this.particles.burst({ x: s.x, y: s.y + 0.05, z: s.z }, UP, TEAM_COLORS[s.team], count, 2.5);
    }

    const wasReloading = s.reloadTimer > 0;
    const fired = stepWeapon(s, input, dt, PLAYER_SEED, this.projectiles);
    if (fired > 0) this.sfx.shoot();
    if (wasReloading && s.reloadTimer === 0) this.sfx.reloaded();
    // A dry click while you pull the trigger during a reload, so it's clear why nothing fires.
    this.emptyClickCooldown -= dt;
    if (input.fire && s.reloadTimer > 0 && this.emptyClickCooldown <= 0) {
      this.sfx.empty();
      this.emptyClickCooldown = 0.25;
    }
    stepProjectiles(this.physics, this.projectiles, dt, this.handleHit);

    this.physics.step();
    if (s.y < RESPAWN_BELOW_Y) this.respawn();
    this.currentFeet.set(s.x, s.y, s.z);
  }

  /** Renders at the quality preset's pixel ratio times the dynamic-resolution scale. */
  private applyPixelRatio(scale: number): void {
    const preset = QUALITY_PRESETS[this.quality];
    const ratio = Math.min(window.devicePixelRatio, preset.maxPixelRatio) * scale;
    if (Math.abs(ratio - this.pixelRatio) < 0.01) return;
    this.pixelRatio = ratio;
    this.renderer.setPixelRatio(ratio);
  }

  /** Splashes and sounds for diving into and out of your own paint, plus a ripple trail. */
  private swimEffects(wasSubmerged: boolean, dt: number): void {
    const s = this.player;
    const feet = { x: s.x, y: s.y + 0.05, z: s.z };
    const up = { x: 0, y: 1, z: 0 };
    const color = TEAM_COLORS[s.team];
    if (s.submerged !== wasSubmerged) {
      this.particles.burst(feet, up, color, 10, 3.5);
      if (s.submerged) this.sfx.swimIn();
      else this.sfx.swimOut();
    }
    this.swimTrailTimer -= dt;
    if (s.submerged && Math.hypot(s.vx, s.vz) > 2 && this.swimTrailTimer <= 0) {
      this.particles.burst(feet, up, color, 2, 1.8);
      this.swimTrailTimer = 0.06;
    }
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
    const splats = this.paint.splat(hit.point, hit.radius, hit.team);
    // Drips are drawn as thin streaks along the shot's path; real hits as full splats.
    this.atlas.add(splats, hit.team, hit.drip ? hit.direction : undefined);
    // Drips just paint quietly; real hits also splash and squish.
    if (hit.drip) return;
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
    // A puddle lies on the floor already, so it needs no shadow.
    this.shadow.visible = hit !== null && this.player.swimBlend < 0.5;
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
      resolution: Math.round(this.resolution.scale * 100),
    });
    this.framesCounted = 0;
    this.statsSeconds = 0;
  }
}
