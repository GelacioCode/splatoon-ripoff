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
import { ARENA, clamp, CONFIG, type Vec3 } from '@paint-rush/shared';
import {
  createPlayerState,
  initPhysics,
  PhysicsWorld,
  stepPlayer,
  type Collider,
  type PlayerState,
} from '@paint-rush/shared/sim';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { InputManager } from '../input/InputManager';
import { BlobCharacter } from '../render/BlobCharacter';
import { createMapMesh } from '../render/mapMesh';
import { HEMISPHERE_GROUND_COLOR, SKY_COLOR, SUN_DIRECTION, TEAM_COLORS } from '../render/palette';
import { createToonRamp } from '../render/toon';
import type { DevOverlay } from '../ui/devOverlay';
import { createStartScreen } from '../ui/startScreen';
import { toggleTuningPanel } from '../ui/tuningPanel';
import { FixedStep } from './fixedStep';

/** The sandbox player is on team 0 (pink), which starts at −Z. */
const TEAM = 0;
/** Team 0 faces +Z (toward the middle of the map) when it spawns. */
const SPAWN_YAW = Math.PI;
/** Falling below this height puts you back on your spawn. */
const RESPAWN_BELOW_Y = -10;
const UP = new Vector3(0, 1, 0);
const DOWN: Vec3 = { x: 0, y: -1, z: 0 };

/** Loads physics, builds the offline sandbox and starts it. */
export async function startSandbox(container: HTMLElement, overlay: DevOverlay): Promise<void> {
  const rapierVersion = await initPhysics();
  overlay.update({ physics: `Rapier ${rapierVersion}` });
  new SandboxGame(container, overlay).start();
}

/** Phase 1 offline sandbox: one player running around the arena. */
class SandboxGame {
  private readonly overlay: DevOverlay;
  private readonly renderer = new WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  private readonly scene = new Scene();
  private readonly physics = new PhysicsWorld(ARENA.blocks);
  private readonly view = new ThirdPersonCamera(window.innerWidth / window.innerHeight);
  private readonly loop = new FixedStep(1 / CONFIG.net.tickRate);
  private readonly input: InputManager;
  private readonly player: PlayerState;
  private readonly body: Collider;
  private readonly character: BlobCharacter;
  private readonly shadow: Mesh;
  /** Feet position before and after the latest tick, for drawing in between. */
  private readonly previousFeet = new Vector3();
  private readonly currentFeet = new Vector3();
  private readonly renderFeet = new Vector3();
  private readonly shadowNormal = new Vector3();
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
    this.scene.add(createMapMesh(ARENA));

    this.character = new BlobCharacter(TEAM_COLORS[TEAM], createToonRamp());
    this.scene.add(this.character.root);

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

    this.player = createPlayerState(this.spawnPoint(), SPAWN_YAW);
    this.body = this.physics.createCharacter(this.player);
    this.view.yaw = SPAWN_YAW;
    this.syncFeet();

    const crosshair = document.createElement('div');
    crosshair.className = 'crosshair';
    document.body.appendChild(crosshair);

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
      toggleTuningPanel({ respawn: () => this.respawn() });
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
    this.renderFeet.lerpVectors(this.previousFeet, this.currentFeet, this.loop.alpha);
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
    this.view.update(this.renderFeet, dt, this.raycastDistance);
    this.renderer.render(this.scene, this.view.camera);
    this.updateStats(dt);
  };

  private tick(): void {
    const s = this.player;
    this.previousFeet.set(s.x, s.y, s.z);
    const input = this.input.sampleTick(this.view.yaw, this.view.pitch);
    stepPlayer(this.physics, this.body, s, input, this.loop.stepSeconds);
    this.physics.step();
    if (s.y < RESPAWN_BELOW_Y) this.respawn();
    this.currentFeet.set(s.x, s.y, s.z);
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
    const spawn = ARENA.spawns[TEAM][0];
    // Drop in from just above the pad.
    return { x: spawn.x, y: spawn.y + 0.05, z: spawn.z };
  }

  private respawn(): void {
    Object.assign(this.player, createPlayerState(this.spawnPoint(), SPAWN_YAW));
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
