import { CONFIG } from '../config';
import type { Vec3 } from '../math3d';

/**
 * Everything the simulation knows about one player. Only flat numbers and booleans, so the
 * Phase 2 netcode can copy, rewind and replay it.
 */
export interface PlayerState {
  /** Feet position (m). */
  x: number;
  y: number;
  z: number;
  /** Velocity (m/s). */
  vx: number;
  vy: number;
  vz: number;
  /** Facing angle around Y (radians), same convention as PlayerInput.aimYaw. */
  yaw: number;
  /** Team index: 0 or 1. */
  team: number;
  grounded: boolean;
  /** Seconds since the player last stood on the ground. */
  airTime: number;
  /** Set by a jump and cleared on landing, so coyote time can't be used twice. */
  jumped: boolean;
  /** Seconds a recent jump press stays valid (jump buffering). */
  jumpBuffer: number;
  /** Jump button state on the previous tick, to detect new presses. */
  jumpHeld: boolean;
  /** Ink left in the tank. */
  ink: number;
  /** Seconds until the next shot may fire. */
  fireCooldown: number;
  /** Seconds since the trigger was last held (a long pause triggers a reload). */
  sinceShot: number;
  /** Seconds of reload left; 0 when not reloading. */
  reloadTimer: number;
  /** Shots fired so far; seeds each shot's spread so client and server agree. */
  shotCount: number;
  hp: number;
  /** Seconds since the player last took damage (health regenerates after a pause). */
  sinceDamage: number;
  /** 0 = standing, 1 = fully melted into a puddle (swim form). */
  swimBlend: number;
  /** Hidden in own paint (swimming on it, or climbing it): fast, and ink refills. */
  submerged: boolean;
  /** Swimming up a wall painted in the player's color. */
  climbing: boolean;
  /** Team whose paint is under the player's feet, or −1. */
  groundTeam: number;
  /** In aim mode (aim held, not swimming). */
  aiming: boolean;
}

export function createPlayerState(feet: Vec3, yaw = 0, team = 0): PlayerState {
  return {
    x: feet.x,
    y: feet.y,
    z: feet.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw,
    team,
    grounded: false,
    airTime: 0,
    jumped: false,
    jumpBuffer: 0,
    jumpHeld: false,
    ink: CONFIG.weapon.inkCapacity,
    fireCooldown: 0,
    sinceShot: 0,
    reloadTimer: 0,
    shotCount: 0,
    hp: CONFIG.player.maxHp,
    sinceDamage: 0,
    swimBlend: 0,
    submerged: false,
    climbing: false,
    groundTeam: -1,
    aiming: false,
  };
}
