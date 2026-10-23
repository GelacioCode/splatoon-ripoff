import {
  BoxGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  REVISION,
  Scene,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import {
  ARENA,
  buildSurfaces,
  clamp,
  CONFIG,
  damp,
  DEFAULT_LOOK,
  lerp,
  PaintGrid,
  weaponStats,
  type Look,
  type MapDef,
  type PaintEvent,
  type Vec3,
} from '@paint-rush/shared';
import {
  aimDirection,
  muzzlePosition,
  PhysicsWorld,
  reloadProgress,
  type PlayerState,
  type Projectile,
  type ProjectileHit,
} from '@paint-rush/shared/sim';
import { Sfx } from '../audio/Sfx';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { chooseTouchControls } from '../input/controlsMode';
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
import { KillFeed } from '../ui/killFeed';
import { createPauseMenu } from '../ui/pauseMenu';
import { preventBrowserZoom } from '../ui/preventBrowserZoom';
import { toggleTuningPanel, type TuningActions } from '../ui/tuningPanel';

/** Most paint detail per meter the paint texture may use. */
const PAINT_PIXELS_PER_METER = 16;
/** How far ahead the crosshair looks for something to aim at (m). */
const AIM_DISTANCE = 80;
/** Landing faster than this (m/s) makes a puff of droplets. */
const LANDING_PUFF_SPEED = 5;
const UP = new Vector3(0, 1, 0);
const DOWN: Vec3 = { x: 0, y: -1, z: 0 };

/** What the effects need to compare between two moments of the local player. */
export interface PlayerSnapshot {
  submerged: boolean;
  grounded: boolean;
  vy: number;
}

export function snapshotOf(s: PlayerState): PlayerSnapshot {
  return { submerged: s.submerged, grounded: s.grounded, vy: s.vy };
}

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** Touch controls or mouse and keyboard (see chooseTouchControls for the rules). */
function isTouchDevice(settings: Settings): boolean {
  return chooseTouchControls(
    settings.controls,
    window.location.search,
    window.matchMedia('(pointer: coarse)').matches,
  );
}

/**
 * Everything both game modes share: renderer and scene, the map with its paint, the camera,
 * input, the pause menu, HUD, effects and sound. The offline sandbox and the online game
 * each drive one of these with their own player logic.
 */
export class World {
  readonly settings: Settings = loadSettings();
  readonly touchDevice = isTouchDevice(this.settings);
  readonly quality: QualityLevel;
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  /**
   * The current arena and everything built from it. Online, a new layout replaces these
   * after every capture (see `loadMap`), so don't keep references to them across frames.
   */
  map: MapDef = ARENA;
  /** The layout seed `map` was built from (0 = Drip Yard; see arenaFor). */
  mapSeed = 0;
  physics = new PhysicsWorld(ARENA.blocks);
  surfaces = buildSurfaces(ARENA.blocks);
  paint = new PaintGrid(this.surfaces);
  atlas: PaintAtlas;
  /** Scene objects that belong to the current arena (its mesh and base zones). */
  private mapObjects: Mesh[] = [];
  private readonly paintTextureSize: number;
  readonly view = new ThirdPersonCamera(window.innerWidth / window.innerHeight);
  readonly input: InputManager;
  readonly particles: Particles;
  readonly projectileView = new ProjectileView(TEAM_COLORS);
  readonly sfx = new Sfx();
  readonly killFeed = new KillFeed();
  readonly overlay: DevOverlay;
  private readonly roleChanged: (weapon: number) => void;
  /** The cel-shading ramp every toon material shares. */
  readonly toonRamp = createToonRamp();
  private readonly hud = createHud();
  private readonly menu: ReturnType<typeof createPauseMenu>;
  /** False while lobby screens are up: the menu then never appears (e.g. on Esc). */
  private menuEnabled: boolean;
  private readonly resolution = new DynamicResolution();
  private readonly shadow: Mesh;
  private readonly shadowNormal = new Vector3();
  private pixelRatio = 1;
  private aimBlend = 0;
  private swimTrailTimer = 0;
  private emptyClickCooldown = 0;
  private lastFrameMs = 0;
  private framesCounted = 0;
  private statsSeconds = 0;

  /**
   * `roleChanged` runs when the player picks another role in the menu (already saved in
   * `settings.weapon`). With `menuAtStart` false, the pause menu stays hidden until
   * `setMenuVisible(true)` (online, the lobby screens come first).
   */
  constructor(
    container: HTMLElement,
    overlay: DevOverlay,
    tuning: TuningActions,
    roleChanged: (weapon: number) => void,
    menuAtStart = true,
  ) {
    this.overlay = overlay;
    this.roleChanged = roleChanged;
    if (this.touchDevice) preventBrowserZoom();
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

    this.paintTextureSize = preset.paintTextureSize;
    this.atlas = this.createAtlas();
    this.addMapObjects();

    this.particles = new Particles(preset.particles, this.toonRamp);
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

    this.menu = createPauseMenu(this.settings, this.touchDevice, {
      play: () => this.play(),
      settingsChanged: (settings, changed) => this.settingsChanged(settings, changed),
      enableGyro: () => this.input.gyro.enable(),
      openTuning: () => toggleTuningPanel(tuning),
    });
    this.menuEnabled = menuAtStart;
    this.menu.setVisible(menuAtStart);
    this.input = new InputManager(
      this.renderer.domElement,
      this.touchDevice,
      (locked) => {
        // Desktop: playing exactly while the mouse is captured (Esc frees it and pauses).
        if (this.touchDevice) return;
        this.input.playing = locked;
        this.menu.setVisible(!locked && this.menuEnabled);
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
      toggleTuningPanel(tuning);
    });
    if (!this.touchDevice) this.switchToTouchOnFingerTap();
    this.overlay.update({ renderer: `three r${REVISION} · WebGL2 · ${this.quality} quality` });
  }

  /**
   * The device was guessed to have a mouse, but a finger touched the screen before playing
   * (some foldables and tablets report both): remember touch controls and reload into them.
   * A choice made on purpose (the Controls setting or `?desktop`) is left alone.
   */
  private switchToTouchOnFingerTap(): void {
    if (this.settings.controls !== 'auto') return;
    if (new URLSearchParams(window.location.search).has('desktop')) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || this.input.playing) return;
      window.removeEventListener('pointerdown', onPointerDown, true);
      event.preventDefault();
      event.stopPropagation();
      this.settings.controls = 'touch';
      saveSettings(this.settings);
      window.location.reload();
    };
    // Capture phase: before the tap can press a button (e.g. "Click to play").
    window.addEventListener('pointerdown', onPointerDown, true);
  }

  /**
   * Shows the pause menu (with its Play button), or hides it and stops play, e.g. when going
   * back to a lobby screen.
   */
  setMenuVisible(visible: boolean): void {
    this.menuEnabled = visible;
    if (visible) {
      this.pause();
      return;
    }
    this.input.playing = false;
    this.input.touch?.setVisible(false);
    if (document.pointerLockElement) document.exitPointerLock();
    this.menu.setVisible(false);
  }

  /**
   * Swaps the arena for another layout (online: a new random one after every capture). Its
   * physics, paint grid and paint texture start fresh, so the old paint is gone. Anything
   * made in the old physics world (e.g. our own body) has to be made again.
   */
  loadMap(map: MapDef, seed: number): void {
    if (seed === this.mapSeed && map === this.map) return;
    for (const object of this.mapObjects) {
      this.scene.remove(object);
      object.geometry.dispose();
      (object.material as Material).dispose();
    }
    this.mapObjects = [];
    this.atlas.dispose();
    this.physics.dispose();
    this.map = map;
    this.mapSeed = seed;
    this.physics = new PhysicsWorld(map.blocks);
    this.surfaces = buildSurfaces(map.blocks);
    this.paint = new PaintGrid(this.surfaces);
    this.atlas = this.createAtlas();
    this.addMapObjects();
  }

  /** The paint texture for the current surfaces (detail depends on the quality preset). */
  private createAtlas(): PaintAtlas {
    const layout = packAtlas(this.surfaces, this.paintTextureSize, PAINT_PIXELS_PER_METER);
    return new PaintAtlas(this.renderer, this.surfaces, layout);
  }

  /** The arena mesh and the base zones of the current map. */
  private addMapObjects(): void {
    const mesh = createMapMesh(this.map, this.surfaces, this.atlas);
    this.scene.add(mesh);
    this.mapObjects.push(mesh);
    this.addBaseZones();
  }

  /** Each team's base (where the flag is brought to score): a glowing box in its color. */
  private addBaseZones(): void {
    this.map.bases.forEach((zone, team) => {
      const color = TEAM_COLORS[team];
      const volume = new Mesh(
        new BoxGeometry(zone.size.x, zone.size.y, zone.size.z),
        new MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.1,
          depthWrite: false,
          side: DoubleSide,
        }),
      );
      volume.position.set(zone.center.x, zone.center.y, zone.center.z);
      const floor = new Mesh(
        new PlaneGeometry(zone.size.x, zone.size.z),
        new MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(zone.center.x, zone.center.y - zone.size.y / 2 + 0.03, zone.center.z);
      this.scene.add(volume, floor);
      this.mapObjects.push(volume, floor);
    });
  }

  /** Your shot hit an enemy: hit marker and tick. */
  showHit(splat: boolean): void {
    this.hud.showHit(splat);
    this.sfx.hit(splat);
  }

  /** A shot hit you. */
  flashHurt(): void {
    this.hud.flashHurt();
  }

  /** "Splatted by …" while waiting to respawn; null hides it. */
  setSplatted(text: string | null): void {
    this.hud.setSplatted(text);
  }

  /** Starts calling `frame` once per display refresh. */
  start(frame: (timeMs: number) => void): void {
    this.renderer.setAnimationLoop(frame);
  }

  createCharacter(team: number, weapon: number, look: Look = DEFAULT_LOOK): BlobCharacter {
    const character = new BlobCharacter(TEAM_COLORS[team], this.toonRamp, weapon, look);
    this.scene.add(character.root);
    return character;
  }

  removeCharacter(character: BlobCharacter): void {
    this.scene.remove(character.root);
    character.dispose();
  }

  /**
   * Starts a frame: adapts the resolution and turns the camera by this frame's mouse, touch
   * and gyro movement (finer while aiming). Returns the frame time in seconds.
   */
  beginFrame(timeMs: number, aiming: boolean): number {
    const frameMs = this.lastFrameMs === 0 ? 0 : timeMs - this.lastFrameMs;
    this.lastFrameMs = timeMs;
    const dt = Math.min(frameMs / 1000, 0.25);
    if (frameMs > 0) this.applyPixelRatio(this.resolution.update(frameMs));

    const look = this.input.consumeLook(this.settings);
    this.aimBlend = damp(this.aimBlend, aiming ? 1 : 0, 14, dt);
    const lookScale = lerp(1, CONFIG.camera.aimSensitivity, this.aimBlend);
    this.view.look(look.x * lookScale, look.y * lookScale, 1);
    return dt;
  }

  /**
   * Pitch that sends shots from the nozzle to whatever the crosshair points at. The camera
   * sits above and beside the blaster, so aiming with the camera's own pitch would miss.
   */
  aimPitch(feet: Vec3): number {
    const eye = this.view.camera.position;
    const forward = aimDirection(this.view.yaw, this.view.pitch);
    const hit = this.physics.raycast(eye, forward, AIM_DISTANCE);
    const distance = hit ? hit.distance : AIM_DISTANCE;
    const target = {
      x: eye.x + forward.x * distance,
      y: eye.y + forward.y * distance,
      z: eye.z + forward.z * distance,
    };
    const muzzle = muzzlePosition({ x: feet.x, y: feet.y, z: feet.z, yaw: this.view.yaw });
    const horizontal = Math.hypot(target.x - muzzle.x, target.z - muzzle.z);
    // Very close targets (e.g. hugging a wall) would give wild angles; use the camera's pitch.
    if (horizontal < 1) return this.view.pitch;
    return Math.atan2(target.y - muzzle.y, horizontal);
  }

  /** Paint landing on the map (offline): the grid, the paint texture, splashes and sound. */
  applyPaint(hit: ProjectileHit, listener: Vec3): void {
    this.paintAt(hit);
    this.splash(hit, listener);
  }

  /** Paint landing on the map: the gameplay grid and the paint texture. */
  paintAt(paint: PaintEvent): void {
    const splats = this.paint.splat(paint.point, paint.radius, paint.team);
    // Drips are drawn as thin streaks along the shot's path; real hits as full splats.
    this.atlas.add(splats, paint.team, paint.drip ? paint.direction : undefined);
  }

  /** A shot hitting the map: droplets and a splat sound, quieter further away. Drips make neither. */
  splash(hit: ProjectileHit, listener: Vec3): void {
    if (hit.drip) return;
    this.particles.burst(hit.point, hit.normal, TEAM_COLORS[hit.team], 6);
    this.sfx.splat(this.loudnessAt(hit.point, listener));
  }

  /** 1 close by, fading to 0.1 at 30 m. */
  loudnessAt(point: Vec3, listener: Vec3): number {
    const distance = Math.hypot(point.x - listener.x, point.y - listener.y, point.z - listener.z);
    return clamp(1 - distance / 30, 0.1, 1);
  }

  /**
   * Replaces all paint with a snapshot's cells (joining mid-match). Each painted cell is redrawn
   * as a soft blob. Returns false if the snapshot doesn't fit this map.
   */
  loadPaintSnapshot(cells: Uint8Array): boolean {
    if (!this.paint.importCells(cells)) return false;
    this.atlas.clear();
    const radius = this.paint.cellSize * 0.9;
    this.paint.forEachPaintedCell((surfaceId, u, v, team) =>
      this.atlas.addBlob({ surfaceId, u, v, radius }, team),
    );
    return true;
  }

  /** The reload chime, and a dry click when pulling the trigger during a reload. */
  weaponSounds(wasReloading: boolean, s: PlayerState, fire: boolean, dt: number): void {
    if (wasReloading && s.reloadTimer === 0) this.sfx.reloaded();
    this.emptyClickCooldown -= dt;
    if (fire && s.reloadTimer > 0 && this.emptyClickCooldown <= 0) {
      this.sfx.empty();
      this.emptyClickCooldown = 0.25;
    }
  }

  /** Splashes and sounds when the local player dives in or out of paint, lands, or swims. */
  playerEffects(before: PlayerSnapshot, s: PlayerState, dt: number): void {
    const feet = { x: s.x, y: s.y + 0.05, z: s.z };
    const color = TEAM_COLORS[s.team];
    if (s.submerged !== before.submerged) {
      this.particles.burst(feet, UP, color, 10, 3.5);
      if (s.submerged) this.sfx.swimIn();
      else this.sfx.swimOut();
    }
    this.swimTrailTimer -= dt;
    if (s.submerged && Math.hypot(s.vx, s.vz) > 2 && this.swimTrailTimer <= 0) {
      this.particles.burst(feet, UP, color, 2, 1.8);
      this.swimTrailTimer = 0.06;
    }
    const fallSpeed = -before.vy;
    if (s.grounded && !before.grounded && fallSpeed > LANDING_PUFF_SPEED && s.swimBlend < 0.5) {
      this.particles.burst(feet, UP, color, Math.round(clamp(fallSpeed / 2, 4, 12)), 2.5);
    }
  }

  /**
   * Finishes a frame: effects, HUD and camera for the local player (`feet` is where to draw
   * them), then renders. `alpha` blends shots between their last two positions.
   */
  drawFrame(dt: number, feet: Vector3, s: PlayerState, projectiles: Projectile[], alpha: number) {
    // A bad number here would send the camera into nowhere (an empty sky) for good.
    if (!Number.isFinite(feet.x + feet.y + feet.z)) {
      this.warnOnce('camera target is not a number', { feet: feet.toArray(), state: s });
      feet.set(ARENA.spawns[0][0].x, ARENA.spawns[0][0].y, ARENA.spawns[0][0].z);
    }
    if (!Number.isFinite(this.view.yaw) || !Number.isFinite(this.view.pitch)) {
      this.warnOnce('camera angle is not a number', { yaw: this.view.yaw, pitch: this.view.pitch });
      this.view.yaw = 0;
      this.view.pitch = -0.2;
    }
    this.updateShadow(feet, s.swimBlend);
    this.projectileView.update(projectiles, alpha);
    this.particles.update(dt);
    this.atlas.flush();

    const ink = s.ink / weaponStats(s.weapon).magazine;
    this.hud.update(ink, reloadProgress(s), cssColor(TEAM_COLORS[s.team]), ink < 0.2);
    this.hud.updateHealth(s.hp / CONFIG.player.maxHp, cssColor(TEAM_COLORS[1 - s.team]));
    this.hud.setAiming(s.aiming);
    // Widen the view while swimming fast, for a sense of speed.
    const swimSpeedRatio = clamp(Math.hypot(s.vx, s.vz) / CONFIG.swim.swimSpeed, 0, 1);
    const fovBoost = s.submerged ? CONFIG.camera.swimFovBoost * swimSpeedRatio : 0;
    this.view.update(feet, dt, this.raycastDistance, s.swimBlend, fovBoost, this.aimBlend);
    this.renderer.render(this.scene, this.view.camera);
    this.updateStats(dt);
  }

  private readonly warned = new Set<string>();

  /** Logs a diagnostic to the browser console once per kind of problem. */
  private warnOnce(problem: string, details: unknown): void {
    if (this.warned.has(problem)) return;
    this.warned.add(problem);
    console.warn(`[world] ${problem}`, details);
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
    if (changed === 'weapon') this.roleChanged(settings.weapon);
    if (changed === 'gyro' && !settings.gyro) this.input.gyro.disable();
    // Paint texture size and anti-aliasing are fixed when the renderer starts, and the
    // controls are set up once at start too.
    if (changed === 'quality' || changed === 'controls') window.location.reload();
  }

  /** Renders at the quality preset's pixel ratio times the dynamic-resolution scale. */
  private applyPixelRatio(scale: number): void {
    const preset = QUALITY_PRESETS[this.quality];
    const ratio = Math.min(window.devicePixelRatio, preset.maxPixelRatio) * scale;
    if (Math.abs(ratio - this.pixelRatio) < 0.01) return;
    this.pixelRatio = ratio;
    this.renderer.setPixelRatio(ratio);
  }

  private readonly raycastDistance = (origin: Vec3, direction: Vec3, maxDistance: number) =>
    this.physics.raycast(origin, direction, maxDistance)?.distance ?? null;

  /** A soft dark disc under the local player, so you can judge jumps. */
  private updateShadow(feet: Vector3, swimBlend: number): void {
    const hit = this.physics.raycast({ x: feet.x, y: feet.y + 0.3, z: feet.z }, DOWN, 30);
    // A puddle lies on the floor already, so it needs no shadow.
    this.shadow.visible = hit !== null && swimBlend < 0.5;
    if (!hit) return;
    this.shadowNormal.set(hit.normal.x, hit.normal.y, hit.normal.z);
    this.shadow.quaternion.setFromUnitVectors(UP, this.shadowNormal);
    this.shadow.position.set(hit.point.x, hit.point.y, hit.point.z);
    this.shadow.position.addScaledVector(this.shadowNormal, 0.03);
    this.shadow.scale.setScalar(clamp(1 - (feet.y - hit.point.y) * 0.15, 0.4, 1));
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
