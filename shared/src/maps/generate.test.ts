import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { ARENA } from './arena';
import { arenaFor, footprint, KEEP_CLEAR, newLayoutSeed, randomCover } from './generate';
import type { BlockDef } from './types';

const SEEDS = [1, 2, 3, 42, 777, 123456, 0xdeadbeef];
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

function isHalfTurnOf(a: BlockDef, b: BlockDef): boolean {
  return (
    a.kind === b.kind &&
    near(a.center.x, -b.center.x) &&
    near(a.center.y, b.center.y) &&
    near(a.center.z, -b.center.z) &&
    near(a.size.x, b.size.x) &&
    near(a.size.z, b.size.z) &&
    near(a.rotation.x, -b.rotation.x)
  );
}

describe('random layouts', () => {
  it('are the same on every screen for the same seed, and differ between seeds', () => {
    expect(randomCover(42)).toEqual(randomCover(42));
    expect(randomCover(42)).not.toEqual(randomCover(43));
  });

  it('play the same for both teams (every block has a 180° twin)', () => {
    for (const seed of SEEDS) {
      const map = arenaFor(seed);
      for (const block of map.blocks) {
        expect(map.blocks.some((other) => isHalfTurnOf(block, other))).toBe(true);
      }
    }
  });

  it('keep the spawn, base and center clear, and stay in their own half', () => {
    for (const seed of SEEDS) {
      for (const block of randomCover(seed)) {
        const area = footprint(block);
        expect(area.maxZ).toBeLessThan(0);
        for (const clear of KEEP_CLEAR) {
          const hit =
            area.minX < clear.maxX &&
            area.maxX > clear.minX &&
            area.minZ < clear.maxZ &&
            area.maxZ > clear.minZ;
          expect(hit).toBe(false);
        }
      }
    }
  });

  it('never stack pieces on top of each other', () => {
    for (const seed of SEEDS) {
      const cover = randomCover(seed).filter((b) => b.kind !== 'ramp');
      cover.forEach((a, i) => {
        for (const b of cover.slice(i + 1)) {
          const fa = footprint(a);
          const fb = footprint(b);
          const touching =
            fa.minX < fb.maxX && fa.maxX > fb.minX && fa.minZ < fb.maxZ && fa.maxZ > fb.minZ;
          expect(touching).toBe(false);
        }
      });
    }
  });

  it('have enough cover to fight around', () => {
    for (const seed of SEEDS) expect(randomCover(seed).length).toBeGreaterThanOrEqual(4);
  });

  it('use Drip Yard for seed 0, and new seeds are never 0', () => {
    expect(arenaFor(0)).toBe(ARENA);
    const random = createRng(9);
    for (let i = 0; i < 100; i++) expect(newLayoutSeed(random)).toBeGreaterThan(0);
  });
});
