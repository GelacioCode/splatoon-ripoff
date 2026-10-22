import { describe, expect, it } from 'vitest';
import { buildSurfaces } from '../maps/surfaces';
import { projectSplat } from './projectSplat';
import { TEST_BLOCKS } from './testMap';

const surfaces = buildSurfaces(TEST_BLOCKS);

describe('projectSplat', () => {
  it('leaves a full-size circle on the floor it lands on', () => {
    const splats = projectSplat(surfaces, { x: 0, y: 0, z: -5 }, 1);
    expect(splats).toHaveLength(1);
    const [floor] = splats;
    expect(surfaces[floor.surfaceId].blockIndex).toBe(0);
    // The floor's top face starts at its (−10, 0, +10) corner, u along +X and v along −Z.
    expect(floor.u).toBeCloseTo(10, 9);
    expect(floor.v).toBeCloseTo(15, 9);
    expect(floor.radius).toBeCloseTo(1, 9);
  });

  it('wraps onto a nearby wall when it lands next to it', () => {
    const splats = projectSplat(surfaces, { x: 0, y: 0, z: 4.3 }, 1);
    const wallFront = splats.find(
      (s) => surfaces[s.surfaceId].blockIndex === 1 && surfaces[s.surfaceId].normal.z < -0.9,
    );
    expect(splats.some((s) => surfaces[s.surfaceId].blockIndex === 0)).toBe(true);
    expect(wallFront).toBeDefined();
    expect(wallFront?.radius).toBeCloseTo(Math.sqrt(1 - 0.2 * 0.2), 9);
  });

  it('misses surfaces that are far away', () => {
    expect(projectSplat(surfaces, { x: 50, y: 0, z: 50 }, 1)).toHaveLength(0);
  });
});
