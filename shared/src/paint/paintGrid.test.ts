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

  it('lets the other team paint over it', () => {
    const { grid, floor } = createGrid();
    grid.splat({ x: 0, y: 0, z: -5 }, 1, 0);
    const painted = grid.paintedCells(0);
    grid.splat({ x: 0, y: 0, z: -5 }, 1, 1);
    expect(grid.teamAt(floor, { x: 0, y: 0, z: -5 })).toBe(1);
    expect(grid.paintedCells(0)).toBe(0);
    expect(grid.paintedCells(1)).toBe(painted);
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
