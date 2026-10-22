import { describe, expect, it } from 'vitest';
import { ARENA } from '../maps/arena';
import { buildSurfaces } from '../maps/surfaces';
import { createRng } from '../rng';
import { PaintGrid } from './paintGrid';
import { decodePaintSnapshot, encodePaintSnapshot } from './paintSnapshot';

function arenaGrid(): PaintGrid {
  return new PaintGrid(buildSurfaces(ARENA.blocks));
}

/** Splats both teams' paint at random spots on the arena floor. */
function paintRandomly(grid: PaintGrid, splats: number): void {
  const random = createRng(7);
  for (let i = 0; i < splats; i++) {
    const at = { x: (random() - 0.5) * 34, y: 0, z: (random() - 0.5) * 62 };
    grid.splat(at, 0.6 + random() * 0.6, i % 2);
  }
}

describe('paint snapshots', () => {
  it('rebuild exactly the same paint on another grid', () => {
    const source = arenaGrid();
    paintRandomly(source, 300);
    const copy = arenaGrid();
    const cells = decodePaintSnapshot(encodePaintSnapshot(source.exportCells()));
    expect(cells).not.toBeNull();
    expect(copy.importCells(cells as Uint8Array)).toBe(true);
    expect(copy.exportCells()).toEqual(source.exportCells());
    expect(copy.paintedCells(0)).toBe(source.paintedCells(0));
    expect(copy.paintedCells(1)).toBe(source.paintedCells(1));
  });

  it('stay small: a few bytes when clean, a few KB when well painted', () => {
    const grid = arenaGrid();
    expect(encodePaintSnapshot(grid.exportCells()).byteLength).toBeLessThan(16);
    paintRandomly(grid, 300);
    expect(grid.paintedCells(0) + grid.paintedCells(1)).toBeGreaterThan(1000);
    expect(encodePaintSnapshot(grid.exportCells()).byteLength).toBeLessThan(12_000);
  });

  it('reject damaged data instead of painting garbage', () => {
    const grid = arenaGrid();
    paintRandomly(grid, 20);
    const bytes = encodePaintSnapshot(grid.exportCells());
    expect(decodePaintSnapshot(bytes.subarray(0, bytes.length - 2))).toBeNull();
    expect(arenaGrid().importCells(new Uint8Array(3))).toBe(false);
  });
});
