import { CONFIG } from '../config';
import { lerp } from '../math';
import type { Vec3 } from '../math3d';
import type { PlayerState } from './playerState';

/** Height of the body's middle above the feet, standing and as a puddle (m). */
const STANDING_CENTER = 0.56;
const PUDDLE_CENTER = 0.15;

/** The ball a shot must touch to hit a player at these feet (wider and lower as a puddle). */
export function playerHitSphere(
  x: number,
  y: number,
  z: number,
  swimBlend: number,
): { center: Vec3; radius: number } {
  const p = CONFIG.player;
  return {
    center: { x, y: y + lerp(STANDING_CENTER, PUDDLE_CENTER, swimBlend), z },
    radius: lerp(p.hitRadius, p.puddleHitRadius, swimBlend),
  };
}

/**
 * Whether a straight piece of a shot's path (from `from`, unit `direction`, `distance` long)
 * passes through a ball.
 */
export function segmentHitsSphere(
  from: Vec3,
  direction: Vec3,
  distance: number,
  center: Vec3,
  radius: number,
): boolean {
  const ox = center.x - from.x;
  const oy = center.y - from.y;
  const oz = center.z - from.z;
  // The point of the segment closest to the ball's center.
  const along = Math.min(
    distance,
    Math.max(0, ox * direction.x + oy * direction.y + oz * direction.z),
  );
  const dx = ox - direction.x * along;
  const dy = oy - direction.y * along;
  const dz = oz - direction.z * along;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

/** Whether this player can be hurt right now: alive and past spawn protection. */
export function isVulnerable(s: PlayerState): boolean {
  return s.respawnTimer <= 0 && s.protectTimer <= 0;
}

export type DamageResult = 'ignored' | 'hit' | 'splatted';

/**
 * How long a player waits after their `splats`-th splat of the match (1 = the first):
 * 3 s, then 1 s more each time, at most 10 s (see CONFIG.player).
 */
export function respawnSeconds(splats: number): number {
  const p = CONFIG.player;
  const extra = Math.max(0, splats - 1) * p.respawnStepSeconds;
  return Math.min(p.respawnMaxSeconds, p.respawnBaseSeconds + extra);
}

/**
 * A shot from `shooterTeam` hitting `target`. Teammates, splatted players and freshly
 * respawned ones aren't hurt. At 0 HP the target is splatted: out for `respawnWait` seconds.
 */
export function applyShotDamage(
  target: PlayerState,
  shooterTeam: number,
  damage: number,
  respawnWait = respawnSeconds(1),
): DamageResult {
  if (target.team === shooterTeam || !isVulnerable(target)) return 'ignored';
  target.hp -= damage;
  target.sinceDamage = 0;
  if (target.hp > 0) return 'hit';
  target.hp = 0;
  target.swimBlend = 0;
  target.submerged = false;
  target.climbing = false;
  target.respawnTimer = respawnWait;
  return 'splatted';
}

/**
 * Counts down a player's respawn and spawn protection (server only: it decides when you're
 * back). Returns true on the tick the respawn is due.
 */
export function stepLife(s: PlayerState, dt: number): boolean {
  if (s.protectTimer > 0) s.protectTimer = Math.max(0, s.protectTimer - dt);
  if (s.respawnTimer <= 0) return false;
  s.respawnTimer = Math.max(0, s.respawnTimer - dt);
  return s.respawnTimer === 0;
}
