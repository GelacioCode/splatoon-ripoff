import type { Surface } from '../maps/surfaces';
import type { Vec3 } from '../math3d';

/** Where a splat lands on one surface: a circle in that surface's u/v coordinates (m). */
export interface SurfaceSplat {
  surfaceId: number;
  u: number;
  v: number;
  radius: number;
}

/**
 * Treats a splat as a ball of paint and returns the circle it leaves on every paintable
 * surface it touches, so paint wraps naturally onto walls and over edges.
 */
export function projectSplat(surfaces: Surface[], center: Vec3, radius: number): SurfaceSplat[] {
  const splats: SurfaceSplat[] = [];
  for (const s of surfaces) {
    if (!s.paintable) continue;
    const dx = center.x - s.origin.x;
    const dy = center.y - s.origin.y;
    const dz = center.z - s.origin.z;
    // Height of the ball's center above the surface. Slightly behind still counts, so paint
    // can roll over an edge; further behind means the surface faces the other way.
    const depth = dx * s.normal.x + dy * s.normal.y + dz * s.normal.z;
    if (depth > radius || depth < -radius * 0.5) continue;
    const circle = Math.sqrt(radius * radius - depth * depth);
    const u = dx * s.uAxis.x + dy * s.uAxis.y + dz * s.uAxis.z;
    const v = dx * s.vAxis.x + dy * s.vAxis.y + dz * s.vAxis.z;
    if (u < -circle || u > s.width + circle || v < -circle || v > s.height + circle) continue;
    splats.push({ surfaceId: s.id, u, v, radius: circle });
  }
  return splats;
}
