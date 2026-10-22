import { describe, expect, it } from 'vitest';
import { createProjectile } from '../sim/projectiles';
import {
  decodePaintEvents,
  decodeShotEvents,
  encodePaintEvents,
  encodeShotEvents,
  PAINT_EVENT_BYTES,
  shotEventOf,
  type PaintEvent,
} from './events';

const HALF_CENTIMETER = 0.005 + 1e-9;

describe('paint events', () => {
  it('come back the same after packing, within half a centimeter', () => {
    const events: PaintEvent[] = [
      {
        point: { x: -17.384, y: 0, z: 31.2049 },
        radius: 0.85,
        team: 1,
        drip: false,
        direction: { x: 0, y: -1, z: 0 },
      },
      {
        point: { x: 3.3333, y: 2.25, z: -0.001 },
        radius: 0.3,
        team: 0,
        drip: true,
        direction: { x: 0.6, y: -0.48, z: -0.64 },
      },
    ];
    const bytes = encodePaintEvents(events);
    expect(bytes.byteLength).toBe(events.length * PAINT_EVENT_BYTES);
    const decoded = decodePaintEvents(bytes);
    expect(decoded).toHaveLength(events.length);
    decoded.forEach((d, i) => {
      const e = events[i];
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(Math.abs(d.point[axis] - e.point[axis])).toBeLessThanOrEqual(HALF_CENTIMETER);
        expect(Math.abs(d.direction[axis] - e.direction[axis])).toBeLessThan(0.01);
      }
      // Radius is stored in 2 cm steps.
      expect(Math.abs(d.radius - e.radius)).toBeLessThanOrEqual(0.01 + 1e-9);
      expect(d.team).toBe(e.team);
      expect(d.drip).toBe(e.drip);
    });
  });

  it('read correctly from the middle of a larger buffer', () => {
    const event: PaintEvent = {
      point: { x: 1, y: 2, z: 3 },
      radius: 1,
      team: 1,
      drip: false,
      direction: { x: 1, y: 0, z: 0 },
    };
    const packed = encodePaintEvents([event]);
    const buffer = new Uint8Array(packed.byteLength + 5);
    buffer.set(packed, 5);
    expect(decodePaintEvents(buffer.subarray(5))[0].point).toEqual(event.point);
  });
});

describe('shot events', () => {
  it('rebuild the same shot on another screen', () => {
    const fired = createProjectile({ x: 4.2, y: 1.37, z: -20.5 }, -2.9, 0.31, 1, true, 2);
    const [event] = decodeShotEvents(encodeShotEvents([shotEventOf(fired)]));
    const copy = createProjectile(
      event.origin,
      event.yaw,
      event.pitch,
      event.team,
      event.aimed,
      event.weapon,
    );
    expect(Math.abs(copy.x - fired.x)).toBeLessThanOrEqual(HALF_CENTIMETER);
    expect(Math.abs(copy.z - fired.z)).toBeLessThanOrEqual(HALF_CENTIMETER);
    // Same speed and direction: within 1 cm/s on each axis.
    expect(copy.vx).toBeCloseTo(fired.vx, 2);
    expect(copy.vy).toBeCloseTo(fired.vy, 2);
    expect(copy.vz).toBeCloseTo(fired.vz, 2);
    expect(copy.team).toBe(1);
    expect(copy.aimed).toBe(true);
    expect(copy.weapon).toBe(2);
    expect(copy.straightTime).toBe(fired.straightTime);
  });
});
