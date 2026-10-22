const TWO_PI = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Frame-rate independent exponential smoothing toward `target`.
 * `lambda` is how fast it catches up (higher = snappier); `dt` is in seconds.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Wraps an angle into the range −π (inclusive) to π (exclusive), in radians. */
export function wrapAngle(angle: number): number {
  return angle - TWO_PI * Math.floor((angle + Math.PI) / TWO_PI);
}

/** Like `damp`, but for angles: always turns the short way around the circle. */
export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  return current + wrapAngle(target - current) * (1 - Math.exp(-lambda * dt));
}
