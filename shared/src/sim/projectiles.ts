import { CONFIG } from '../config';
import type { Vec3 } from '../math3d';
import { DEFAULT_WEAPON, weaponStats } from '../weapons';
import type { PhysicsWorld, RayHit } from './physicsWorld';

const DOWN: Vec3 = { x: 0, y: -1, z: 0 };
/** Two floor spots this close in height are on the same floor, so a trail line joins them (m). */
const SAME_FLOOR = 0.05;
/** Trail lines are at least this long (shorter: a dot), and at most this long (m). */
const MIN_TRAIL = 0.05;
const MAX_TRAIL = 12;

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
  /**
   * Where its paint trail on the floor got to: the next trail line starts here (the floor
   * under where it was fired, then the end of the last line). Null over a drop or before the
   * first tick.
   */
  trailFrom: Vec3 | null;
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
  /** True for the paint trail shots leave on the floor along their path. */
  drip: boolean;
  /**
   * Unit direction the shot was flying. For a trail line, the flat direction it runs in (it
   * ends at `point`, `trail` meters from its start).
   */
  direction: Vec3;
  /** Length of the trail line ending at `point` (m); 0 for a splat or a lone dot. */
  trail: number;
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
    trailFrom: null,
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

/** The floor right under a point, if there is one close enough below (not a wall). */
function floorUnder(physics: PhysicsWorld, at: Vec3): RayHit | null {
  const floor = physics.raycast(at, DOWN, CONFIG.weapon.dripMaxHeight);
  return floor && floor.normal.y > 0.5 ? floor : null;
}

/**
 * The next piece of a shot's paint trail, ending at `floor`: a straight line back to where
 * the trail got to, when that's on the same floor; otherwise a lone dot, starting a new line.
 */
function trailPiece(p: Projectile, floor: RayHit, direction: Vec3): ProjectileHit {
  const piece: ProjectileHit = {
    point: floor.point,
    normal: floor.normal,
    blockIndex: floor.blockIndex,
    team: p.team,
    radius: p.dripRadius,
    drip: true,
    direction,
    trail: 0,
  };
  const from = p.trailFrom;
  if (from && Math.abs(from.y - floor.point.y) < SAME_FLOOR) {
    const dx = floor.point.x - from.x;
    const dz = floor.point.z - from.z;
    const length = Math.hypot(dx, dz);
    if (length >= MIN_TRAIL && length <= MAX_TRAIL) {
      piece.trail = length;
      piece.direction = { x: dx / length, y: 0, z: dz / length };
    }
  }
  return piece;
}

/**
 * Moves every shot one tick: straight at first, then dropping. A shot that reaches the map is
 * reported through `onHit` and removed from the list. Along the way, shots leave a straight,
 * unbroken paint trail on the floor below them: pieces of line, each joining the last,
 * reported through `onHit` (with `drip` set). With `hitsTarget`, shots can also hit players
 * before they reach the map.
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
    // A new shot's trail starts on the floor under where it was fired.
    if (p.age === 0) p.trailFrom = floorUnder(physics, p)?.point ?? null;
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
      // Landing on the floor: the trail runs all the way to the splat.
      if (hit.normal.y > 0.5) {
        const last = trailPiece(p, hit, direction);
        if (last.trail > 0) onHit(last, p);
      }
      onHit(
        {
          point: hit.point,
          normal: hit.normal,
          blockIndex: hit.blockIndex,
          team: p.team,
          radius: p.splatRadius,
          drip: false,
          direction,
          trail: 0,
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
      const floor = floorUnder(physics, p);
      if (floor) {
        onHit(trailPiece(p, floor, direction), p);
        p.trailFrom = floor.point;
      } else {
        // Over a drop: the next line starts fresh on the far side.
        p.trailFrom = null;
      }
    }

    if (p.age < w.maxLifetime && p.y > -10) projectiles[kept++] = p;
  }
  projectiles.length = kept;
}
