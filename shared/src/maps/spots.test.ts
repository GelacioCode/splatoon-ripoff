import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { ARENA } from './arena';
import { arenaFor } from './generate';
import { groundAt, randomMiddleSpot } from './spots';

describe('groundAt', () => {
  it('finds the floor, and the top of the center platform', () => {
    expect(groundAt(ARENA, 10, 0)).toBe(0);
    expect(groundAt(ARENA, 0, 0)).toBe(1.5);
  });

  it('refuses ramps and the edge of the platform', () => {
    // The ramp up to the platform runs from z = −9 to −5 at x = 0.
    expect(groundAt(ARENA, 0, -7)).toBeNull();
    // The platform's side is at x = 5.
    expect(groundAt(ARENA, 5, 0)).toBeNull();
    expect(groundAt(ARENA, 4.5, 0)).toBeNull();
  });
});

describe('randomMiddleSpot', () => {
  it('is on the middle line, on flat ground, never at an edge', () => {
    const random = createRng(7);
    for (let i = 0; i < 100; i++) {
      const spot = randomMiddleSpot(ARENA, random);
      expect(spot.z).toBe(0);
      expect(Math.abs(spot.x)).toBeLessThanOrEqual(ARENA.bounds.maxX * 0.6);
      // On the platform (1.5 m up) or the floor beside it, clear of its edge at |x| = 5.
      expect(Math.abs(spot.x) < 4.2 || Math.abs(spot.x) > 5.8).toBe(true);
      expect(spot.y).toBe(Math.abs(spot.x) < 5 ? 1.5 : 0);
    }
  });

  it('can keep a whole circle level (the hill never hangs over the platform edge)', () => {
    const random = createRng(3);
    const around = 3.5;
    for (let i = 0; i < 50; i++) {
      const spot = randomMiddleSpot(ARENA, random, around);
      expect(groundAt(ARENA, spot.x - around, 0)).toBe(spot.y);
      expect(groundAt(ARENA, spot.x + around, 0)).toBe(spot.y);
    }
  });

  it('moves around from round to round, in random layouts and bigger arenas too', () => {
    const random = createRng(11);
    const xs = new Set<number>();
    const layouts: [number, number][] = [
      [1234, 0],
      [98765, 1],
      [42, 2],
    ];
    for (const [seed, size] of layouts) {
      const map = arenaFor(seed, size);
      for (let i = 0; i < 20; i++) {
        const spot = randomMiddleSpot(map, random);
        expect(spot.z).toBe(0);
        expect([0, 1.5]).toContain(spot.y);
        xs.add(Math.round(spot.x * 10));
      }
    }
    expect(xs.size).toBeGreaterThan(20);
  });
});
