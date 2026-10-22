import { CONFIG } from '../config';
import type { Vec3 } from '../math3d';
import type { PhysicsWorld } from './physicsWorld';

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
  team: number;
}

export interface ProjectileHit {
  point: Vec3;
  normal: Vec3;
  /** Index of the map block that was hit. */
  blockIndex: number;
  team: number;
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

export function createProjectile(origin: Vec3, yaw: number, pitch: number, team: number) {
  const speed = CONFIG.weapon.projectileSpeed;
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
    team,
  };
  return projectile;
}

/**
 * Moves every shot one tick: straight at first, then dropping. A shot that reaches the map is
 * reported through `onHit` and removed from the list.
 */
export function stepProjectiles(
  physics: PhysicsWorld,
  projectiles: Projectile[],
  dt: number,
  onHit: (hit: ProjectileHit) => void,
): void {
  const w = CONFIG.weapon;
  let kept = 0;
  for (const p of projectiles) {
    p.px = p.x;
    p.py = p.y;
    p.pz = p.z;
    if (p.age >= w.straightTime) p.vy -= w.projectileGravity * dt;
    p.age += dt;

    const dx = p.vx * dt;
    const dy = p.vy * dt;
    const dz = p.vz * dt;
    const length = Math.hypot(dx, dy, dz);
    const hit =
      length > 0
        ? physics.raycast(p, { x: dx / length, y: dy / length, z: dz / length }, length)
        : null;
    if (hit) {
      onHit({ point: hit.point, normal: hit.normal, blockIndex: hit.blockIndex, team: p.team });
      continue;
    }
    p.x += dx;
    p.y += dy;
    p.z += dz;
    if (p.age < w.maxLifetime && p.y > -10) projectiles[kept++] = p;
  }
  projectiles.length = kept;
}
