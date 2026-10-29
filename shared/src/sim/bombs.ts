import { CONFIG } from '../config';
import { lerp } from '../math';
import type { Vec3 } from '../math3d';
import type { PlayerInput } from './input';
import type { PhysicsWorld } from './physicsWorld';
import { BOMB_SLOT, PRIMARY_SLOT, type PlayerState } from './playerState';
import { aimDirection } from './projectiles';
import { muzzlePosition } from './weapon';

/**
 * A thrown paint bomb: it flies in an arc, bounces and rolls, and goes off when its fuse runs
 * out. The server's bombs are the real ones; screens fly the same ones for show.
 */
export interface Bomb {
  /** Who threw it (session id) and their throw number: together, the bomb's name. */
  owner: string;
  number: number;
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
  /** Seconds until it goes off. */
  fuse: number;
  team: number;
  /** Lying still on the ground (no more moving). */
  resting: boolean;
}

/** A bomb leaving the hand: along the aim, tipped up a little for an arc. */
export function createBomb(
  owner: string,
  number: number,
  origin: Vec3,
  yaw: number,
  pitch: number,
  team: number,
): Bomb {
  const b = CONFIG.bomb;
  const direction = aimDirection(yaw, Math.min(1.4, pitch + b.throwLift));
  return {
    owner,
    number,
    x: origin.x,
    y: origin.y,
    z: origin.z,
    px: origin.x,
    py: origin.y,
    pz: origin.z,
    vx: direction.x * b.throwSpeed,
    vy: direction.y * b.throwSpeed,
    vz: direction.z * b.throwSpeed,
    fuse: b.fuseSeconds,
    team,
    resting: false,
  };
}

/**
 * What's in hand, and throwing a bomb. `input.slot` picks the role's weapon or a bomb (only
 * with bombs left); with a bomb in hand, a fresh press of the trigger throws it (holding
 * doesn't keep throwing). The last bomb thrown puts the weapon back in hand. Runs before
 * stepWeapon, which only fires with the weapon in hand. New bombs are appended to `out`;
 * returns how many were thrown (0 or 1).
 */
export function stepBombThrow(
  s: PlayerState,
  input: PlayerInput,
  dt: number,
  owner: string,
  out: Bomb[],
): number {
  if (s.respawnTimer > 0) return 0;
  s.bombCooldown = Math.max(0, s.bombCooldown - dt);
  const wanted = input.slot === BOMB_SLOT && s.bombs > 0 ? BOMB_SLOT : PRIMARY_SLOT;
  if (wanted !== s.slot) {
    s.slot = wanted;
    // Switching while holding the trigger doesn't throw (or fire) until it's let go.
    s.fireLatch = input.fire;
  }
  if (!input.fire) s.fireLatch = false;
  const ready = s.bombCooldown <= 0 && s.swimBlend === 0 && !s.fireLatch;
  if (s.slot !== BOMB_SLOT || !input.fire || !ready) return 0;
  s.bombs--;
  s.bombsThrown++;
  s.bombCooldown = CONFIG.bomb.cooldownSeconds;
  s.fireLatch = true;
  out.push(createBomb(owner, s.bombsThrown, muzzlePosition(s), s.yaw, input.aimPitch, s.team));
  if (s.bombs <= 0) s.slot = PRIMARY_SLOT;
  return 1;
}

/** The velocity after bouncing off a surface with this normal: bounced back and slowed. */
function bounce(b: Bomb, n: Vec3): void {
  const c = CONFIG.bomb;
  const into = b.vx * n.x + b.vy * n.y + b.vz * n.z;
  if (into >= 0) return;
  // Normal part reflected and damped, sideways part slowed by friction.
  const nx = n.x * into;
  const ny = n.y * into;
  const nz = n.z * into;
  b.vx = (b.vx - nx) * c.friction - nx * c.bounce;
  b.vy = (b.vy - ny) * c.friction - ny * c.bounce;
  b.vz = (b.vz - nz) * c.friction - nz * c.bounce;
}

/** Below this speed on flat ground a bomb stops (m/s). */
const REST_SPEED = 0.6;

/**
 * Moves every bomb one tick (falling, bouncing off the map, rolling to a stop) and counts
 * down their fuses. A bomb whose fuse runs out is reported through `onBlast` and removed;
 * one that falls off the map is just removed.
 */
export function stepBombs(
  physics: PhysicsWorld,
  bombs: Bomb[],
  dt: number,
  onBlast: (bomb: Bomb) => void,
): void {
  const c = CONFIG.bomb;
  let kept = 0;
  for (const b of bombs) {
    b.px = b.x;
    b.py = b.y;
    b.pz = b.z;
    b.fuse -= dt;
    if (b.fuse <= 0) {
      onBlast(b);
      continue;
    }
    if (!b.resting) {
      b.vy -= c.gravity * dt;
      const dx = b.vx * dt;
      const dy = b.vy * dt;
      const dz = b.vz * dt;
      const length = Math.hypot(dx, dy, dz);
      if (length > 0) {
        const direction = { x: dx / length, y: dy / length, z: dz / length };
        const hit = physics.raycast(b, direction, length + c.radius);
        if (hit) {
          // Touching the surface (its own size away from it), then bounce.
          b.x = hit.point.x + hit.normal.x * c.radius;
          b.y = hit.point.y + hit.normal.y * c.radius;
          b.z = hit.point.z + hit.normal.z * c.radius;
          bounce(b, hit.normal);
          const flat = hit.normal.y > 0.7;
          if (flat && Math.hypot(b.vx, b.vy, b.vz) < REST_SPEED) {
            b.vx = 0;
            b.vy = 0;
            b.vz = 0;
            b.resting = true;
          }
        } else {
          b.x += dx;
          b.y += dy;
          b.z += dz;
        }
      }
    }
    if (b.y > -10) bombs[kept++] = b;
  }
  bombs.length = kept;
}

/** Damage from a blast `distance` meters away: full up close, less toward the edge, none past it. */
export function blastDamage(distance: number): number {
  const c = CONFIG.bomb;
  if (distance > c.blastRadius) return 0;
  return lerp(c.maxDamage, c.minDamage, Math.max(0, distance) / c.blastRadius);
}
