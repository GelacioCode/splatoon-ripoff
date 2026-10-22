import { Vector3 } from 'three';
import { ARENA, CONFIG, weaponStats, type Vec3 } from '@paint-rush/shared';
import {
  createPlayerState,
  initPhysics,
  setWeapon,
  stepPlayer,
  stepProjectiles,
  stepWeapon,
  type Collider,
  type PlayerState,
  type Projectile,
} from '@paint-rush/shared/sim';
import type { BlobCharacter } from '../render/BlobCharacter';
import { TEAM_COLORS } from '../render/palette';
import type { DevOverlay } from '../ui/devOverlay';
import { FixedStep } from './fixedStep';
import { snapshotOf, World } from './World';

/** Team 0 (pink) starts at −Z and faces +Z, toward the middle of the map. */
const START_TEAM = 0;
const SPAWN_YAW = Math.PI;
/** Falling below this height puts you back on your spawn. */
const RESPAWN_BELOW_Y = -10;
/** Identifies this player's shots. */
const PLAYER_SEED = 1;
/** Enemy-colored patches painted at the start, to see and test the other team's paint. */
const PRE_PAINTED: { at: Vec3; radius: number }[] = [
  { at: { x: 0, y: 0, z: -13 }, radius: 2.2 },
  { at: { x: -10, y: 0, z: -7 }, radius: 2 },
  { at: { x: 9, y: 0, z: -19 }, radius: 1.8 },
  { at: { x: 0, y: 1.5, z: 0 }, radius: 2.5 },
  { at: { x: -7, y: 1.4, z: -15.4 }, radius: 1.3 },
];

/** Loads physics, builds the offline sandbox (open the page with ?offline) and starts it. */
export async function startSandbox(container: HTMLElement, overlay: DevOverlay): Promise<void> {
  const rapierVersion = await initPhysics();
  overlay.update({ physics: `Rapier ${rapierVersion}`, server: 'offline sandbox' });
  new SandboxGame(container, overlay).start();
}

/** Offline sandbox: one player running, jumping, painting and swimming, no server needed. */
class SandboxGame {
  private readonly world: World;
  private readonly loop = new FixedStep(1 / CONFIG.net.tickRate);
  private readonly player: PlayerState;
  private readonly body: Collider;
  private readonly character: BlobCharacter;
  private readonly projectiles: Projectile[] = [];
  /** Feet position before and after the latest tick, for drawing in between. */
  private readonly previousFeet = new Vector3();
  private readonly currentFeet = new Vector3();
  private readonly renderFeet = new Vector3();
  private emptyClickCooldown = 0;

  constructor(container: HTMLElement, overlay: DevOverlay) {
    this.world = new World(
      container,
      overlay,
      {
        respawn: () => this.respawn(),
        clearPaint: () => {
          this.world.paint.clear();
          this.world.atlas.clear();
        },
        switchTeam: () => {
          this.player.team = 1 - this.player.team;
          this.character.setColor(TEAM_COLORS[this.player.team]);
        },
        refillInk: () => {
          this.player.ink = weaponStats(this.player.weapon).magazine;
          this.player.reloadTimer = 0;
        },
      },
      (weapon) => {
        setWeapon(this.player, weapon);
        this.character.setWeapon(weapon);
      },
    );
    const weapon = this.world.settings.weapon;
    this.character = this.world.createCharacter(START_TEAM, weapon);
    this.player = createPlayerState(this.spawnPoint(), SPAWN_YAW, START_TEAM, weapon);
    this.body = this.world.physics.createCharacter(this.player);
    this.world.view.yaw = SPAWN_YAW;
    this.syncFeet();
    this.prePaint();
  }

  start(): void {
    this.world.start(this.frame);
  }

  private readonly frame = (timeMs: number): void => {
    const world = this.world;
    const s = this.player;
    const dt = world.beginFrame(timeMs, s.aiming);

    this.loop.stepSeconds = 1 / CONFIG.net.tickRate;
    const steps = this.loop.advance(dt);
    for (let i = 0; i < steps; i++) this.tick();

    // Draw between the last two ticks so motion stays smooth at any frame rate.
    const alpha = this.loop.alpha;
    this.renderFeet.lerpVectors(this.previousFeet, this.currentFeet, alpha);
    this.character.update(dt, {
      x: this.renderFeet.x,
      y: this.renderFeet.y,
      z: this.renderFeet.z,
      yaw: world.view.yaw,
      vx: s.vx,
      vy: s.vy,
      vz: s.vz,
      grounded: s.grounded,
      swimBlend: s.swimBlend,
      submerged: s.submerged,
      climbing: s.climbing,
    });
    world.drawFrame(dt, this.renderFeet, s, this.projectiles, alpha);
  };

  private tick(): void {
    const world = this.world;
    const s = this.player;
    const dt = this.loop.stepSeconds;
    this.previousFeet.set(s.x, s.y, s.z);
    const input = world.input.sampleTick(world.view.yaw, world.aimPitch(s));
    const before = snapshotOf(s);
    stepPlayer(world.physics, this.body, s, input, dt, world.paint);
    world.playerEffects(before, s, dt);

    const wasReloading = s.reloadTimer > 0;
    const fired = stepWeapon(s, input, dt, PLAYER_SEED, this.projectiles);
    if (fired > 0) world.sfx.shoot();
    if (wasReloading && s.reloadTimer === 0) world.sfx.reloaded();
    // A dry click while you pull the trigger during a reload, so it's clear why nothing fires.
    this.emptyClickCooldown -= dt;
    if (input.fire && s.reloadTimer > 0 && this.emptyClickCooldown <= 0) {
      world.sfx.empty();
      this.emptyClickCooldown = 0.25;
    }
    stepProjectiles(world.physics, this.projectiles, dt, (hit) => world.applyPaint(hit, s));

    world.physics.step();
    if (s.y < RESPAWN_BELOW_Y) this.respawn();
    this.currentFeet.set(s.x, s.y, s.z);
  }

  private prePaint(): void {
    const enemy = 1 - START_TEAM;
    for (const { at, radius } of PRE_PAINTED) {
      this.world.atlas.add(this.world.paint.splat(at, radius, enemy), enemy);
    }
  }

  private spawnPoint(): Vec3 {
    const spawn = ARENA.spawns[START_TEAM][0];
    // Drop in from just above the pad.
    return { x: spawn.x, y: spawn.y + 0.05, z: spawn.z };
  }

  private respawn(): void {
    const { team, weapon } = this.player;
    Object.assign(this.player, createPlayerState(this.spawnPoint(), SPAWN_YAW, team, weapon));
    this.world.view.yaw = SPAWN_YAW;
    this.syncFeet();
  }

  /** Snaps the drawn position to the current state (no in-between blend). */
  private syncFeet(): void {
    this.currentFeet.set(this.player.x, this.player.y, this.player.z);
    this.previousFeet.copy(this.currentFeet);
  }
}
