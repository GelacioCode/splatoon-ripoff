import { describe, expect, it } from 'vitest';
import { ARENA } from './arena';
import type { BlockDef } from './types';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** True when `b` is `a` turned 180° around the center of the map. */
function isHalfTurnOf(a: BlockDef, b: BlockDef): boolean {
  return (
    a.kind === b.kind &&
    a.paintable === b.paintable &&
    near(a.center.x, -b.center.x) &&
    near(a.center.y, b.center.y) &&
    near(a.center.z, -b.center.z) &&
    near(a.size.x, b.size.x) &&
    near(a.size.y, b.size.y) &&
    near(a.size.z, b.size.z) &&
    near(a.rotation.x, -b.rotation.x) &&
    near(a.rotation.y, b.rotation.y) &&
    near(a.rotation.z, -b.rotation.z)
  );
}

describe('ARENA', () => {
  it('plays the same for both teams (every block has a 180° twin)', () => {
    for (const block of ARENA.blocks) {
      expect(ARENA.blocks.some((other) => isHalfTurnOf(block, other))).toBe(true);
    }
  });

  it('only contains boxes with a real size', () => {
    for (const block of ARENA.blocks) {
      expect(block.size.x).toBeGreaterThan(0);
      expect(block.size.y).toBeGreaterThan(0);
      expect(block.size.z).toBeGreaterThan(0);
    }
  });

  it('puts every spawn inside the arena and above the floor', () => {
    const { minX, maxX, minZ, maxZ } = ARENA.bounds;
    for (const spawn of [...ARENA.spawns[0], ...ARENA.spawns[1]]) {
      expect(spawn.x).toBeGreaterThan(minX);
      expect(spawn.x).toBeLessThan(maxX);
      expect(spawn.z).toBeGreaterThan(minZ);
      expect(spawn.z).toBeLessThan(maxZ);
      expect(spawn.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives each team its base and spawns on its own side', () => {
    expect(ARENA.bases[0].center.z).toBeLessThan(0);
    expect(ARENA.bases[1].center.z).toBeGreaterThan(0);
    expect(ARENA.spawns[0].every((spawn) => spawn.z < 0)).toBe(true);
    expect(ARENA.spawns[1].every((spawn) => spawn.z > 0)).toBe(true);
  });
});
