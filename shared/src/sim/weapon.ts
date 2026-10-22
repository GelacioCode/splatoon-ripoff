import { CONFIG } from '../config';
import type { Vec3 } from '../math3d';
import { createRng } from '../rng';
import type { PlayerInput } from './input';
import type { PlayerState } from './playerState';
import { createProjectile, type Projectile } from './projectiles';

const DEG_TO_RAD = Math.PI / 180;

/** Where the blaster's nozzle is: offset from the feet, turned with the player. */
export function muzzlePosition(s: { x: number; y: number; z: number; yaw: number }): Vec3 {
  const w = CONFIG.weapon;
  const sin = Math.sin(s.yaw);
  const cos = Math.cos(s.yaw);
  // right = (cos, 0, −sin), forward = (−sin, 0, −cos)
  return {
    x: s.x + cos * w.muzzleRight - sin * w.muzzleForward,
    y: s.y + w.muzzleHeight,
    z: s.z - sin * w.muzzleRight - cos * w.muzzleForward,
  };
}

/**
 * Fires while the trigger is held and there's ink, and refills ink after a pause. New shots
 * are appended to `out`; returns how many were fired. `seed` identifies the player, so each
 * shot's spread is the same wherever this runs.
 */
export function stepWeapon(
  s: PlayerState,
  input: PlayerInput,
  dt: number,
  seed: number,
  out: Projectile[],
): number {
  const w = CONFIG.weapon;
  s.fireCooldown -= dt;
  let fired = 0;
  if (input.fire) {
    while (s.fireCooldown <= 0 && s.ink >= w.inkPerShot) {
      // A fresh generator per shot, seeded by player and shot number.
      const random = createRng((seed ^ Math.imul(s.shotCount + 1, 0x9e3779b1)) >>> 0);
      const spread = w.spreadDeg * DEG_TO_RAD;
      const yaw = s.yaw + (random() * 2 - 1) * spread;
      const pitch = input.aimPitch + (random() * 2 - 1) * spread;
      out.push(createProjectile(muzzlePosition(s), yaw, pitch, s.team));
      s.ink -= w.inkPerShot;
      s.shotCount++;
      s.fireCooldown += w.fireInterval;
      fired++;
    }
  }
  // Holding the trigger keeps the rhythm; letting go means the next press fires at once.
  if (s.fireCooldown < 0) s.fireCooldown = 0;

  // Holding the trigger (even on an empty tank) counts as shooting: ink only refills once you let go.
  s.sinceShot = input.fire ? 0 : s.sinceShot + dt;
  if (s.sinceShot >= w.inkRefillDelay) {
    s.ink = Math.min(w.inkCapacity, s.ink + w.inkRefillRate * dt);
  }
  return fired;
}
