import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { ARENA } from './arena';
import {
  arenaFor,
  arenaScale,
  arenaSizeFor,
  footprint,
  keepClear,
  newLayoutSeed,
  randomCover,
  themeProps,
} from './generate';
import type { BlockDef } from './types';

const SEEDS = [1, 2, 3, 42, 777, 123456, 0xdeadbeef];
/** Every arena size step (normal, 1.25×, 1.5×). */
const SIZES = [0, 1, 2];
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

  it('play the same for both teams (every block has a 180° twin), at every size', () => {
    for (const size of SIZES) {
      for (const seed of SEEDS) {
        const map = arenaFor(seed, size);
        for (const block of map.blocks) {
          expect(map.blocks.some((other) => isHalfTurnOf(block, other))).toBe(true);
        }
      }
    }
  });

  it('keep the spawn, base and center clear, and stay in their own half', () => {
    for (const size of SIZES) {
      const scale = arenaScale(size);
      for (const seed of SEEDS) {
        for (const block of randomCover(seed, scale)) {
          const area = footprint(block);
          expect(area.maxZ).toBeLessThan(0);
          for (const clear of keepClear(scale)) {
            const hit =
              area.minX < clear.maxX &&
              area.maxX > clear.minX &&
              area.minZ < clear.maxZ &&
              area.maxZ > clear.minZ;
            expect(hit).toBe(false);
          }
        }
      }
    }
  });

  it('never stack pieces on top of each other', () => {
    for (const size of SIZES) {
      for (const seed of SEEDS) {
        const cover = randomCover(seed, arenaScale(size)).filter((b) => b.kind !== 'ramp');
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
    }
  });

  it('have enough cover to fight around, and more of it in bigger arenas', () => {
    for (const seed of SEEDS) {
      expect(randomCover(seed).length).toBeGreaterThanOrEqual(4);
      expect(randomCover(seed, arenaScale(2)).length).toBeGreaterThan(randomCover(seed).length);
    }
  });

  it('use Drip Yard for the first round at normal size, and new seeds are never 0', () => {
    expect(arenaFor(0)).toBe(ARENA);
    expect(arenaFor(0, 2)).not.toBe(ARENA);
    const random = createRng(9);
    for (let i = 0; i < 100; i++) expect(newLayoutSeed(random)).toBeGreaterThan(0);
  });
});

describe('map objects (themes)', () => {
  const THEMES = ['forest', 'desert', 'office'] as const;

  it('stand in every themed arena, mirrored for both teams, the same on every screen', () => {
    for (const theme of THEMES) {
      for (const size of SIZES) {
        for (const seed of [0, ...SEEDS]) {
          const map = arenaFor(seed, size, theme);
          const props = map.blocks.filter((b) => b.prop);
          expect(props.length).toBeGreaterThan(0);
          for (const block of props) {
            expect(block.paintable).toBe(false);
            expect(map.blocks.some((other) => other.prop && isHalfTurnOf(block, other))).toBe(true);
          }
          expect(arenaFor(seed, size, theme)).toEqual(map);
        }
      }
    }
  });

  it('keep clear of the layout, the spawn, base and center, and of each other', () => {
    for (const theme of THEMES) {
      for (const size of SIZES) {
        const scale = arenaScale(size);
        for (const seed of SEEDS) {
          const cover = randomCover(seed, scale);
          const props = themeProps(theme, cover, seed, scale);
          const others = [...cover.map(footprint), ...keepClear(scale)];
          props.forEach((prop, i) => {
            const a = footprint(prop);
            expect(a.maxZ).toBeLessThan(0);
            for (const b of [...others, ...props.slice(i + 1).map(footprint)]) {
              const touching =
                a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
              expect(touching).toBe(false);
            }
          });
        }
      }
    }
  });

  it("don't change the layout itself, and Drip Yard (the original look) has none", () => {
    const plain = arenaFor(5, 0).blocks;
    const forest = arenaFor(5, 0, 'forest').blocks.filter((b) => !b.prop);
    expect(forest).toEqual(plain);
    expect(arenaFor(5, 0, 'yard').blocks.some((b) => b.prop)).toBe(false);
    expect(arenaFor(0, 0, 'yard')).toBe(ARENA);
  });
});

describe('arena size', () => {
  it('grows with the player count: normal up to 10, 1.25× up to 20, 1.5× beyond', () => {
    expect([1, 10, 11, 20, 21, 30].map(arenaSizeFor)).toEqual([0, 0, 1, 1, 2, 2]);
    expect([0, 1, 2].map(arenaScale)).toEqual([1, 1.25, 1.5]);
  });

  it('scales width and length but not heights; spawns and bases stay on their pads', () => {
    const normal = arenaFor(5, 0);
    const big = arenaFor(5, 2);
    expect(big.bounds.maxX).toBeCloseTo(normal.bounds.maxX * 1.5, 6);
    expect(big.bounds.maxZ).toBeCloseTo(normal.bounds.maxZ * 1.5, 6);
    expect(big.flagSpawn).toEqual(normal.flagSpawn);
    for (const map of [normal, big]) {
      for (const spawn of [...map.spawns[0], ...map.spawns[1]]) {
        expect(Math.abs(spawn.x)).toBeLessThan(map.bounds.maxX);
        expect(Math.abs(spawn.z)).toBeLessThan(map.bounds.maxZ);
      }
      // The base sits between the spawn pad and the middle.
      expect(map.bases[0].center.z).toBeGreaterThan(map.spawns[0][0].z);
      expect(map.bases[0].center.z).toBeLessThan(0);
    }
  });
});
