import { CONFIG } from '../config';
import type { Surface } from '../maps/surfaces';
import type { Vec3 } from '../math3d';
import { projectSplat, type SurfaceSplat } from './projectSplat';

/** Returned by the team lookups for unpainted spots. */
export const NO_TEAM = -1;

/**
 * The gameplay side of paint: which team owns each square cell of every paintable surface.
 * Drives swimming, slowdowns and turf %. The client draws prettier paint from the same splats.
 */
export class PaintGrid {
  readonly cellSize: number;
  private readonly surfaces: Surface[];
  /** Per surface: one byte per cell, 0 = clean, otherwise team + 1. Null when not paintable. */
  private readonly cells: (Uint8Array | null)[];
  private readonly columns: number[];
  private readonly surfacesByBlock = new Map<number, Surface[]>();
  private readonly painted = [0, 0];
  /** Number of paintable cells in the whole map. */
  readonly totalCells: number;

  constructor(surfaces: Surface[], cellSize = CONFIG.paint.cellSize) {
    this.cellSize = cellSize;
    this.surfaces = surfaces;
    this.columns = surfaces.map((s) => Math.max(1, Math.ceil(s.width / cellSize)));
    let total = 0;
    this.cells = surfaces.map((s, i) => {
      if (!s.paintable) return null;
      const count = this.columns[i] * Math.max(1, Math.ceil(s.height / cellSize));
      total += count;
      return new Uint8Array(count);
    });
    this.totalCells = total;
    for (const s of surfaces) {
      if (!s.paintable) continue;
      const list = this.surfacesByBlock.get(s.blockIndex) ?? [];
      list.push(s);
      this.surfacesByBlock.set(s.blockIndex, list);
    }
  }

  /** Paints a ball of paint for `team`; returns the circle it left on each surface. */
  splat(center: Vec3, radius: number, team: number): SurfaceSplat[] {
    const splats = projectSplat(this.surfaces, center, radius);
    for (const splat of splats) this.paintCircle(splat, team);
    return splats;
  }

  /** Like `splat`, but returns how many cells became `team`'s (for paint points). */
  splatCounting(center: Vec3, radius: number, team: number): number {
    let changed = 0;
    for (const splat of projectSplat(this.surfaces, center, radius)) {
      changed += this.paintCircle(splat, team);
    }
    return changed;
  }

  /** Team owning the paint at (u, v) on a surface, or NO_TEAM. */
  teamAtUv(surfaceId: number, u: number, v: number): number {
    const grid = this.cells[surfaceId];
    if (!grid) return NO_TEAM;
    const columns = this.columns[surfaceId];
    const column = Math.floor(u / this.cellSize);
    const row = Math.floor(v / this.cellSize);
    const rows = grid.length / columns;
    if (column < 0 || column >= columns || row < 0 || row >= rows) return NO_TEAM;
    return grid[row * columns + column] - 1;
  }

  /** Team owning the paint at a world point lying on a surface, or NO_TEAM. */
  teamAt(surfaceId: number, point: Vec3): number {
    const s = this.surfaces[surfaceId];
    const dx = point.x - s.origin.x;
    const dy = point.y - s.origin.y;
    const dz = point.z - s.origin.z;
    const u = dx * s.uAxis.x + dy * s.uAxis.y + dz * s.uAxis.z;
    const v = dx * s.vAxis.x + dy * s.vAxis.y + dz * s.vAxis.z;
    return this.teamAtUv(surfaceId, u, v);
  }

  /** The paintable face of a block that points along `normal` (e.g. from a ray hit), or −1. */
  surfaceAt(blockIndex: number, normal: Vec3): number {
    let best = -1;
    let bestDot = 0.7;
    for (const s of this.surfacesByBlock.get(blockIndex) ?? []) {
      const d = s.normal.x * normal.x + s.normal.y * normal.y + s.normal.z * normal.z;
      if (d > bestDot) {
        bestDot = d;
        best = s.id;
      }
    }
    return best;
  }

  /** How many cells a team has painted. */
  paintedCells(team: number): number {
    return this.painted[team] ?? 0;
  }

  clear(): void {
    for (const grid of this.cells) grid?.fill(0);
    this.painted[0] = 0;
    this.painted[1] = 0;
  }

  /** Every cell of every paintable surface in one array (surface order), for snapshots. */
  exportCells(): Uint8Array {
    const all = new Uint8Array(this.totalCells);
    let offset = 0;
    for (const grid of this.cells) {
      if (!grid) continue;
      all.set(grid, offset);
      offset += grid.length;
    }
    return all;
  }

  /** Replaces all paint with exported cells; returns false (changing nothing) on a size mismatch. */
  importCells(all: Uint8Array): boolean {
    if (all.length !== this.totalCells) return false;
    let offset = 0;
    this.painted[0] = 0;
    this.painted[1] = 0;
    for (const grid of this.cells) {
      if (!grid) continue;
      for (let i = 0; i < grid.length; i++) {
        // Anything that isn't a known team counts as clean.
        const value = all[offset + i] <= 2 ? all[offset + i] : 0;
        grid[i] = value;
        if (value !== 0) this.painted[value - 1]++;
      }
      offset += grid.length;
    }
    return true;
  }

  /** Calls `visit` with the center (u, v) of every painted cell and its team. */
  forEachPaintedCell(visit: (surfaceId: number, u: number, v: number, team: number) => void): void {
    const size = this.cellSize;
    this.cells.forEach((grid, surfaceId) => {
      if (!grid) return;
      const columns = this.columns[surfaceId];
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] === 0) continue;
        const column = i % columns;
        const row = (i - column) / columns;
        visit(surfaceId, (column + 0.5) * size, (row + 0.5) * size, grid[i] - 1);
      }
    });
  }

  /** Paints the cells inside a circle; returns how many changed to `team`. */
  private paintCircle({ surfaceId, u, v, radius }: SurfaceSplat, team: number): number {
    const grid = this.cells[surfaceId];
    if (!grid) return 0;
    let changed = 0;
    const size = this.cellSize;
    const columns = this.columns[surfaceId];
    const rows = grid.length / columns;
    const firstColumn = Math.max(0, Math.floor((u - radius) / size));
    const lastColumn = Math.min(columns - 1, Math.floor((u + radius) / size));
    const firstRow = Math.max(0, Math.floor((v - radius) / size));
    const lastRow = Math.min(rows - 1, Math.floor((v + radius) / size));
    const value = team + 1;
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        // A cell belongs to the splat when its center is inside the circle.
        const du = (column + 0.5) * size - u;
        const dv = (row + 0.5) * size - v;
        if (du * du + dv * dv > radius * radius) continue;
        const index = row * columns + column;
        const previous = grid[index];
        if (previous === value) continue;
        if (previous !== 0) this.painted[previous - 1]--;
        grid[index] = value;
        this.painted[team]++;
        changed++;
      }
    }
    return changed;
  }
}
