import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { arenaFor } from '../maps/generate';
import type { Vec3 } from '../math3d';
import { createRng } from '../rng';
import { maxCrates, randomCrateSpot, takesCrate } from './crates';

const crate = { x: 0, y: 0, z: 0 };
const player = (over: Partial<Parameters<typeof takesCrate>[0]> = {}) => ({
  x: 0.5,
  y: 0.05,
  z: 0.3,
  bombs: 0,
  respawnTimer: 0,
  ...over,
});

describe('bomb crates', () => {
  it('refill a player who touches one and is missing a bomb', () => {
    expect(takesCrate(player(), crate)).toBe(true);
    expect(takesCrate(player({ bombs: CONFIG.bomb.max - 1 }), crate)).toBe(true);
    // Full, splatted, too far, or on a ledge above it: no.
    expect(takesCrate(player({ bombs: CONFIG.bomb.max }), crate)).toBe(false);
    expect(takesCrate(player({ respawnTimer: 2 }), crate)).toBe(false);
    expect(takesCrate(player({ x: 3 }), crate)).toBe(false);
    expect(takesCrate(player({ y: 2.5 }), crate)).toBe(false);
  });

  it('appear on low flat ground, away from the spawns and from each other', () => {
    const map = arenaFor(42, 0, 'desert');
    const random = createRng(7);
    const spots: Vec3[] = [];
    for (let i = 0; i < 6; i++) {
      const spot = randomCrateSpot(map, random, spots);
      if (spot) spots.push(spot);
    }
    expect(spots.length).toBeGreaterThan(1);
    spots.forEach((a, i) => {
      expect(Math.abs(a.z)).toBeLessThan(map.bounds.maxZ - 7);
      expect(a.y).toBeLessThanOrEqual(1.6);
      for (const b of spots.slice(i + 1)) {
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(CONFIG.crates.spacing);
      }
    });
  });

  it('come in bigger numbers in bigger arenas', () => {
    expect(maxCrates(1)).toBe(CONFIG.crates.maxOnMap);
    expect(maxCrates(1.5)).toBeGreaterThan(maxCrates(1));
  });
});
