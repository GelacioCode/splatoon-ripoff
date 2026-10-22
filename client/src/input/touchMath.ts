/**
 * Turns a thumb's offset from the joystick's center (pixels, screen y pointing down) into a
 * move vector: x = right, y = forward, length 0–1. A small dead zone ignores jitter, and the
 * rest of the range is stretched so movement still starts smoothly from zero.
 */
export function joystickVector(
  dx: number,
  dy: number,
  radius: number,
  deadZone = 0.12,
): { x: number; y: number } {
  const distance = Math.hypot(dx, dy);
  const reach = Math.min(distance / radius, 1);
  if (distance === 0 || reach <= deadZone) return { x: 0, y: 0 };
  const strength = (reach - deadZone) / (1 - deadZone);
  return { x: (dx / distance) * strength, y: (-dy / distance) * strength };
}

/** Scales a drag (pixels) into camera turn amounts, optionally flipping up/down. */
export function lookDelta(
  dx: number,
  dy: number,
  sensitivity: number,
  invertY: boolean,
): { x: number; y: number } {
  return { x: dx * sensitivity, y: (invertY ? -dy : dy) * sensitivity };
}
