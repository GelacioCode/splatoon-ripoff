import { CONFIG } from '../config';
import type { Vec3 } from '../math3d';
import { createRng } from '../rng';
import { weaponStats } from '../weapons';
import { isRecovering } from './health';
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
 * Fires the player's role weapon while the trigger is held and there's ink. Ink never trickles
 * back: the tank reloads completely, and nothing fires during a reload. A reload starts when
 * the tank runs dry, when the player asks for one, or after a long pause without shooting.
 * New shots are appended to `out`; returns how many were fired. `seed` identifies the
 * player, so each shot's spread is the same wherever this runs.
 */
export function stepWeapon(
  s: PlayerState,
  input: PlayerInput,
  dt: number,
  seed: number,
  out: Projectile[],
): number {
  const w = CONFIG.weapon;
  const role = weaponStats(s.weapon);
  // Splatted players can't shoot (the respawn brings a full tank).
  if (s.respawnTimer > 0) return 0;
  s.fireCooldown -= dt;
  let fired = 0;

  if (s.reloadTimer > 0) {
    // Faster while recovering (calm for a while, or swimming in your own paint).
    const speed = isRecovering(s) ? CONFIG.health.recoveryReloadSpeed : 1;
    s.reloadTimer = Math.max(0, s.reloadTimer - dt * speed);
    if (s.reloadTimer === 0) s.ink = role.magazine;
  } else if (input.fire && s.swimBlend === 0) {
    // Only while fully standing: no shooting as a puddle or mid-transform.
    while (s.fireCooldown <= 0 && s.ink >= w.inkPerShot) {
      // A fresh generator per shot, seeded by player and shot number.
      const random = createRng((seed ^ Math.imul(s.shotCount + 1, 0x9e3779b1)) >>> 0);
      // Aimed shots are far more precise and carry further.
      const spread = (s.aiming ? role.aimSpreadDeg : role.spreadDeg) * DEG_TO_RAD;
      const yaw = s.yaw + (random() * 2 - 1) * spread;
      const pitch = input.aimPitch + (random() * 2 - 1) * spread;
      out.push(createProjectile(muzzlePosition(s), yaw, pitch, s.team, s.aiming, s.weapon));
      s.ink -= w.inkPerShot;
      s.shotCount++;
      s.fireCooldown += role.fireInterval;
      fired++;
    }
  }
  // Holding the trigger keeps the rhythm; letting go means the next press fires at once.
  if (s.fireCooldown < 0) s.fireCooldown = 0;

  // Hiding in your own paint refills the tank quickly; a full tank also ends any reload.
  if (s.submerged) {
    s.ink = Math.min(role.magazine, s.ink + CONFIG.swim.inkRefillRate * dt);
    if (s.ink >= role.magazine) s.reloadTimer = 0;
  }

  // Holding the trigger (even on an empty tank) counts as shooting: ink only refills once you let go.
  s.sinceShot = input.fire ? 0 : s.sinceShot + dt;
  if (s.reloadTimer === 0 && s.ink < role.magazine) {
    const empty = s.ink < w.inkPerShot;
    const idle = s.sinceShot >= w.autoReloadAfterSeconds;
    if (empty || idle || input.reload) s.reloadTimer = role.reloadSeconds;
  }
  return fired;
}

/** Reload progress from 0 (just started) to 1 (done), or null when not reloading. */
export function reloadProgress(s: PlayerState): number | null {
  if (s.reloadTimer <= 0) return null;
  return 1 - s.reloadTimer / weaponStats(s.weapon).reloadSeconds;
}

/** Switches a player to another role with a full tank (an invalid index means assault). */
export function setWeapon(s: PlayerState, weapon: number): void {
  s.weapon = weapon;
  s.ink = weaponStats(weapon).magazine;
  s.reloadTimer = 0;
  s.fireCooldown = 0;
}
