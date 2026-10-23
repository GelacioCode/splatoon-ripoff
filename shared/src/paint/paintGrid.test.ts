import { describe, expect, it } from 'vitest';
import { buildSurfaces } from '../maps/surfaces';
import { NO_TEAM, PaintGrid } from './paintGrid';
import { TEST_BLOCKS } from './testMap';

const UP = { x: 0, y: 1, z: 0 };

function createGrid() {
  const grid = new PaintGrid(buildSurfaces(TEST_BLOCKS), 0.5);
  const floor = grid.surfaceAt(0, UP);
  return { grid, floor };
}

describe('PaintGrid', () => {
  it('paints the cells under a splat for its team', () => {
    const { grid, floor } = createGrid();
    grid.splat({ x: 0, y: 0, z: -5 }, 1, 0);
    expect(grid.teamAt(floor, { x: 0, y: 0, z: -5 })).toBe(0);
    expect(grid.teamAt(floor, { x: 5, y: 0, z: -5 })).toBe(NO_TEAM);
    // About π·r² / cell² ≈ 12 cells.
    expect(grid.paintedCells(0)).toBeGreaterThan(8);
    expect(grid.paintedCells(0)).toBeLessThan(18);
  });

  it('counts the cells a splat newly paints (painting your own paint again scores nothing)', () => {
    const { grid } = createGrid();
    const first = grid.splatCounting({ x: 0, y: 0, z: -5 }, 1, 0);
    expect(first).toBe(grid.paintedCells(0));
    expect(grid.splatCounting({ x: 0, y: 0, z: -5 }, 1, 0)).toBe(0);
    expect(grid.splatCounting({ x: 0, y: 0, z: -5 }, 1, 1)).toBe(first);
  });

  it('lets the other team paint over it', () => {
    const { grid, floor } = createGrid();
    grid.splat({ x: 0, y: 0, z: -5 }, 1, 0);
    const painted = grid.paintedCells(0);
    grid.splat({ x: 0, y: 0, z: -5 }, 1, 1);
    expect(grid.teamAt(floor, { x: 0, y: 0, z: -5 })).toBe(1);
    expect(grid.paintedCells(0)).toBe(0);
    expect(grid.paintedCells(1)).toBe(painted);
  });

  it('paints a trail line with no gaps along it (so it can be swum along), and not far off it', () => {
    const { grid, floor } = createGrid();
    // A slanted line, the hardest case for square cells.
    const from = { x: -3, y: 0, z: -5 };
    const to = { x: 3.3, y: 0, z: -2.7 };
    const marks = grid.stroke(from, to, 0.36, 0);
    expect(marks.strokes).toHaveLength(1);
    expect(marks.changed).toBe(grid.paintedCells(0));
    for (let t = 0; t <= 1; t += 0.01) {
      const at = { x: from.x + (to.x - from.x) * t, y: 0, z: from.z + (to.z - from.z) * t };
      expect(grid.teamAt(floor, at)).toBe(0);
    }
    expect(grid.teamAt(floor, { x: 0, y: 0, z: -2.5 })).toBe(NO_TEAM);
  });

  it('paints a trail event as its line, and a splat event as a circle', () => {
    const { grid, floor } = createGrid();
    const trail = grid.applyEvent({
      point: { x: 0, y: 0, z: -8 },
      radius: 0.36,
      team: 1,
      drip: true,
      direction: { x: 0, y: 0, z: -1 },
      trail: 2,
    });
    expect(trail.strokes).toHaveLength(1);
    expect(grid.teamAt(floor, { x: 0, y: 0, z: -6.2 })).toBe(1);
    const splat = grid.applyEvent({
      point: { x: 4, y: 0, z: -4 },
      radius: 1,
      team: 0,
      drip: false,
      direction: { x: 0, y: -1, z: 0 },
      trail: 0,
    });
    expect(splat.splats.length).toBeGreaterThan(0);
    expect(grid.teamAt(floor, { x: 4, y: 0, z: -4 })).toBe(0);
  });

  it('finds the face a ray hit by its normal, and can be wiped clean', () => {
    const { grid, floor } = createGrid();
    expect(floor).toBeGreaterThanOrEqual(0);
    expect(grid.surfaceAt(1, { x: 0, y: 0, z: -1 })).toBeGreaterThanOrEqual(0);
    grid.splat({ x: 0, y: 0, z: -5 }, 1, 0);
    grid.clear();
    expect(grid.paintedCells(0)).toBe(0);
    expect(grid.teamAt(floor, { x: 0, y: 0, z: -5 })).toBe(NO_TEAM);
  });
});
