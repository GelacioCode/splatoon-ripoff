import type { Vec3 } from '../math3d';
import { footprint } from './generate';
import type { MapDef } from './types';

/** Middle spots are at most this share of the half-width out from the center. */
const MIDDLE_REACH = 0.6;
/** A spot stays this far from the edges of blocks: not teetering on a ledge or against a wall (m). */
const EDGE_CLEARANCE = 0.8;
/** Spots are never higher than this (m). */
const MAX_HEIGHT = 3;
const TRIES = 12;

type Random = () => number;

/**
 * The height of the flat ground at (x, z): the top of the highest block there. Null when the
 * spot is on or next to a ramp, or close to a block's edge.
 */
export function groundAt(map: MapDef, x: number, z: number): number | null {
  let top: number | null = null;
  for (const block of map.blocks) {
    if (block.kind === 'boundary') continue;
    const area = footprint(block);
    // How far inside the block's footprint the spot is (negative: outside).
    const inside = Math.min(x - area.minX, area.maxX - x, z - area.minZ, area.maxZ - z);
    // The floor covers the whole arena; only its top matters.
    const clearance = block.kind === 'floor' ? 0 : EDGE_CLEARANCE;
    if (inside < -clearance) continue;
    const tilted = block.rotation.x !== 0 || block.rotation.y !== 0 || block.rotation.z !== 0;
    if (tilted || inside < clearance) return null;
    const blockTop = block.center.y + block.size.y / 2;
    top = top === null ? blockTop : Math.max(top, blockTop);
  }
  return top;
}

/**
 * A random spot on the middle line (z = 0), the same distance from both teams' spawns: on
 * flat ground, clear of edges and ramps. Used for the flag every round. Falls back to the
 * map's own flag spot if none is found.
 */
export function randomMiddleSpot(map: MapDef, random: Random): Vec3 {
  const reach = map.bounds.maxX * MIDDLE_REACH;
  for (let i = 0; i < TRIES; i++) {
    const x = (random() * 2 - 1) * reach;
    const y = groundAt(map, x, 0);
    if (y !== null && y <= MAX_HEIGHT) return { x, y, z: 0 };
  }
  return { ...map.flagSpawn };
}
