import type { Vec3 } from '../math3d';
import type { Projectile } from '../sim/projectiles';

// Paint and shot events go over the wire as packed bytes, 11 per event. Positions are stored
// in centimeters (±327 m), so a decoded event is within 5 mm of the original.

/** Paint the server put on the map: a splat where a shot hit, or a drip along its path. */
export interface PaintEvent {
  point: Vec3;
  /** Splat radius (m), stored in 2 cm steps up to 5.1 m. */
  radius: number;
  team: number;
  drip: boolean;
  /** Unit direction the shot was flying (drips are drawn as streaks along it). */
  direction: Vec3;
}

/** A shot someone fired, so other screens can fly it too. */
export interface ShotEvent {
  origin: Vec3;
  yaw: number;
  pitch: number;
  team: number;
  aimed: boolean;
  /** Index in WEAPON_KINDS. */
  weapon: number;
}

export const PAINT_EVENT_BYTES = 11;
export const SHOT_EVENT_BYTES = 11;

const CENTIMETERS = 100;
const RADIUS_STEP = 0.02;
const YAW_STEPS = 65536 / (2 * Math.PI);
const PITCH_STEPS = 10000;

function int16(value: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(value)));
}

function int8(value: number): number {
  return Math.max(-127, Math.min(127, Math.round(value * 127)));
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function writePosition(view: DataView, offset: number, p: Vec3): void {
  view.setInt16(offset, int16(p.x * CENTIMETERS), true);
  view.setInt16(offset + 2, int16(p.y * CENTIMETERS), true);
  view.setInt16(offset + 4, int16(p.z * CENTIMETERS), true);
}

function readPosition(view: DataView, offset: number): Vec3 {
  return {
    x: view.getInt16(offset, true) / CENTIMETERS,
    y: view.getInt16(offset + 2, true) / CENTIMETERS,
    z: view.getInt16(offset + 4, true) / CENTIMETERS,
  };
}

export function encodePaintEvents(events: readonly PaintEvent[]): Uint8Array {
  const bytes = new Uint8Array(events.length * PAINT_EVENT_BYTES);
  const view = viewOf(bytes);
  events.forEach((e, i) => {
    const o = i * PAINT_EVENT_BYTES;
    writePosition(view, o, e.point);
    view.setUint8(o + 6, Math.max(0, Math.min(255, Math.round(e.radius / RADIUS_STEP))));
    view.setUint8(o + 7, (e.team & 1) | (e.drip ? 2 : 0));
    view.setInt8(o + 8, int8(e.direction.x));
    view.setInt8(o + 9, int8(e.direction.y));
    view.setInt8(o + 10, int8(e.direction.z));
  });
  return bytes;
}

export function decodePaintEvents(bytes: Uint8Array): PaintEvent[] {
  const view = viewOf(bytes);
  const events: PaintEvent[] = [];
  for (let o = 0; o + PAINT_EVENT_BYTES <= bytes.byteLength; o += PAINT_EVENT_BYTES) {
    const flags = view.getUint8(o + 7);
    events.push({
      point: readPosition(view, o),
      radius: view.getUint8(o + 6) * RADIUS_STEP,
      team: flags & 1,
      drip: (flags & 2) !== 0,
      direction: {
        x: view.getInt8(o + 8) / 127,
        y: view.getInt8(o + 9) / 127,
        z: view.getInt8(o + 10) / 127,
      },
    });
  }
  return events;
}

export function encodeShotEvents(events: readonly ShotEvent[]): Uint8Array {
  const bytes = new Uint8Array(events.length * SHOT_EVENT_BYTES);
  const view = viewOf(bytes);
  events.forEach((e, i) => {
    const o = i * SHOT_EVENT_BYTES;
    writePosition(view, o, e.origin);
    const turn = 2 * Math.PI;
    const yaw = ((e.yaw % turn) + turn) % turn;
    view.setUint16(o + 6, Math.round(yaw * YAW_STEPS) & 0xffff, true);
    view.setInt16(o + 8, int16(e.pitch * PITCH_STEPS), true);
    view.setUint8(o + 10, (e.team & 1) | (e.aimed ? 2 : 0) | ((e.weapon & 3) << 2));
  });
  return bytes;
}

export function decodeShotEvents(bytes: Uint8Array): ShotEvent[] {
  const view = viewOf(bytes);
  const events: ShotEvent[] = [];
  for (let o = 0; o + SHOT_EVENT_BYTES <= bytes.byteLength; o += SHOT_EVENT_BYTES) {
    const flags = view.getUint8(o + 10);
    events.push({
      origin: readPosition(view, o),
      yaw: view.getUint16(o + 6, true) / YAW_STEPS,
      pitch: view.getInt16(o + 8, true) / PITCH_STEPS,
      team: flags & 1,
      aimed: (flags & 2) !== 0,
      weapon: (flags >> 2) & 3,
    });
  }
  return events;
}

/** Describes a shot that was just fired (still at its starting point). */
export function shotEventOf(p: Projectile): ShotEvent {
  return {
    origin: { x: p.x, y: p.y, z: p.z },
    yaw: Math.atan2(-p.vx, -p.vz),
    pitch: Math.atan2(p.vy, Math.hypot(p.vx, p.vz)),
    team: p.team,
    aimed: p.aimed,
    weapon: p.weapon,
  };
}
