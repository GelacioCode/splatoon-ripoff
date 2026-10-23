import { CONFIG } from '../config';
import type { Vec3 } from '../math3d';
import { DEFAULT_WEAPON, weaponStats } from '../weapons';
import type { PhysicsWorld } from './physicsWorld';

const DOWN: Vec3 = { x: 0, y: -1, z: 0 };

/** A paint shot in flight. */
export interface Projectile {
  x: number;
  y: number;
  z: number;
  /** Position at the start of the latest tick, for drawing in between ticks. */
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds since it was fired. */
  age: number;
  /** Meters flown since the last drip. */
  sinceDrip: number;
  /** Seconds it flies straight before it starts to drop (depends on the role, longer aimed). */
  straightTime: number;
  /** Paint it leaves: the splat on a hit, and the drip trail along the way (m). */
  splatRadius: number;
  dripEvery: number;
  dripRadius: number;
  team: number;
  /** The role that fired it (index in WEAPON_KINDS) and whether it was aimed. */
  weapon: number;
  aimed: boolean;
  /** HP it takes from an enemy it hits. */
  damage: number;
}

/**
 * Checks one tick of a shot's flight against players: the straight piece from `from` along
 * `direction`, `distance` long (cut short where it would hit the map). Return true if it hit
 * someone; the shot is then used up and leaves no paint.
 */
export type ShotTargetCheck = (
  shot: Projectile,
  from: Vec3,
  direction: Vec3,
  distance: number,
) => boolean;

/** Paint landing somewhere: a shot hitting the map, or a drip falling from a shot. */
export interface ProjectileHit {
  point: Vec3;
  normal: Vec3;
  /** Index of the map block that was hit. */
  blockIndex: number;
  team: number;
  /** Radius of the paint splat to leave (m). */
  radius: number;
  /** True for the small drops shots leave along their path. */
  drip: boolean;
  /** Unit direction the shot was flying (drips are drawn as streaks along it). */
  direction: Vec3;
}

/** Unit direction for a yaw/pitch aim (yaw 0 looks toward −Z, positive pitch looks up). */
export function aimDirection(yaw: number, pitch: number): Vec3 {
  const cosPitch = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * cosPitch,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cosPitch,
  };
}

/**
 * A new shot from a role's weapon (`weapon` indexes WEAPON_KINDS). Aimed shots fly faster and
 * stay straight for longer before dropping.
 */
export function createProjectile(
  origin: Vec3,
  yaw: number,
  pitch: number,
  team: number,
  aimed = false,
  weapon = DEFAULT_WEAPON,
) {
  const role = weaponStats(weapon);
  const speed = role.projectileSpeed * (aimed ? CONFIG.weapon.aimProjectileSpeedMultiplier : 1);
  const direction = aimDirection(yaw, pitch);
  const projectile: Projectile = {
    x: origin.x,
    y: origin.y,
    z: origin.z,
    px: origin.x,
    py: origin.y,
    pz: origin.z,
    vx: direction.x * speed,
    vy: direction.y * speed,
    vz: direction.z * speed,
    age: 0,
    sinceDrip: 0,
    straightTime: aimed ? role.aimStraightTime : role.straightTime,
    splatRadius: role.splatRadius,
    dripEvery: role.dripEvery,
    dripRadius: role.dripRadius,
    team,
    weapon,
    aimed,
    damage: role.damage,
  };
  return projectile;
}

/**
 * Moves every shot one tick: straight at first, then dropping. A shot that reaches the map is
 * reported through `onHit` and removed from the list. Along the way, shots drip small paint
 * spots onto the floor below them, also reported through `onHit` (with `drip` set). With
 * `hitsTarget`, shots can also hit players before they reach the map.
 */
export function stepProjectiles(
  physics: PhysicsWorld,
  projectiles: Projectile[],
  dt: number,
  onHit: (hit: ProjectileHit, shot: Projectile) => void,
  hitsTarget?: ShotTargetCheck,
): void {
  const w = CONFIG.weapon;
  let kept = 0;
  for (const p of projectiles) {
    p.px = p.x;
    p.py = p.y;
    p.pz = p.z;
    if (p.age >= p.straightTime) p.vy -= w.projectileGravity * dt;
    p.age += dt;

    const dx = p.vx * dt;
    const dy = p.vy * dt;
    const dz = p.vz * dt;
    const length = Math.hypot(dx, dy, dz);
    const direction =
      length > 0 ? { x: dx / length, y: dy / length, z: dz / length } : { x: 0, y: -1, z: 0 };
    const hit = length > 0 ? physics.raycast(p, direction, length) : null;
    // A player in the way is hit first (only up to where the shot would meet the map).
    const reach = hit ? hit.distance : length;
    if (hitsTarget && reach > 0 && hitsTarget(p, { x: p.x, y: p.y, z: p.z }, direction, reach)) {
      continue;
    }
    if (hit) {
      onHit(
        {
          point: hit.point,
          normal: hit.normal,
          blockIndex: hit.blockIndex,
          team: p.team,
          radius: p.splatRadius,
          drip: false,
          direction,
        },
        p,
      );
      continue;
    }
    p.x += dx;
    p.y += dy;
    p.z += dz;

    p.sinceDrip += length;
    if (p.sinceDrip >= p.dripEvery) {
      p.sinceDrip -= p.dripEvery;
      const floor = physics.raycast(p, DOWN, w.dripMaxHeight);
      if (floor && floor.normal.y > 0.5) {
        onHit(
          {
            point: floor.point,
            normal: floor.normal,
            blockIndex: floor.blockIndex,
            team: p.team,
            radius: p.dripRadius,
            drip: true,
            direction,
          },
          p,
        );
      }
    }

    if (p.age < w.maxLifetime && p.y > -10) projectiles[kept++] = p;
  }
  projectiles.length = kept;
}
