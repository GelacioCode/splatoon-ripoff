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
  grounded: boolean;
  /** Seconds since the player last stood on the ground. */
  airTime: number;
  /** Set by a jump and cleared on landing, so coyote time can't be used twice. */
  jumped: boolean;
  /** Seconds a recent jump press stays valid (jump buffering). */
  jumpBuffer: number;
  /** Jump button state on the previous tick, to detect new presses. */
  jumpHeld: boolean;
}

export function createPlayerState(feet: Vec3, yaw = 0): PlayerState {
  return {
    x: feet.x,
    y: feet.y,
    z: feet.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw,
    grounded: false,
    airTime: 0,
    jumped: false,
    jumpBuffer: 0,
    jumpHeld: false,
  };
}
