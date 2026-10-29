import { CONFIG } from '../config';
import { groundAt } from '../maps/spots';
import type { MapDef } from '../maps/types';
import type { Vec3 } from '../math3d';

/** Crates stay this far from the back walls, where the spawn pads and bases are (m). */
const AWAY_FROM_SPAWNS = 8;
/** And at most this high: on the floor, low cover or the center platform (m). */
const MAX_HEIGHT = 1.6;
const TRIES = 30;

/** How many crates can lie in an arena this `scale` at once (more in bigger ones, by area). */
export function maxCrates(scale: number): number {
  return Math.max(1, Math.round(CONFIG.crates.maxOnMap * scale * scale));
}

/**
 * A random spot for a new crate: flat ground anywhere in the arena (the same chance for both
 * teams' halves), away from the spawn pads, not too high, and `CONFIG.crates.spacing` from
 * the crates already lying around. Null if none was found this time.
 */
export function randomCrateSpot(map: MapDef, random: () => number, others: Vec3[]): Vec3 | null {
  const b = map.bounds;
  const margin = 1.5;
  for (let i = 0; i < TRIES; i++) {
    const x = b.minX + margin + random() * (b.maxX - b.minX - margin * 2);
    const z = b.minZ + AWAY_FROM_SPAWNS + random() * (b.maxZ - b.minZ - AWAY_FROM_SPAWNS * 2);
    const y = groundAt(map, x, z);
    if (y === null || y > MAX_HEIGHT) continue;
    const spacing = CONFIG.crates.spacing;
    if (others.some((o) => Math.hypot(o.x - x, o.z - z) < spacing)) continue;
    return { x, y, z };
  }
  return null;
}

/** Whether a player touching distance from `crate` takes it: alive and missing a bomb. */
export function takesCrate(
  player: { x: number; y: number; z: number; bombs: number; respawnTimer: number },
  crate: Vec3,
): boolean {
  if (player.respawnTimer > 0 || player.bombs >= CONFIG.bomb.max) return false;
  const close = Math.hypot(player.x - crate.x, player.z - crate.z) <= CONFIG.crates.pickupRadius;
  return close && Math.abs(player.y - crate.y) <= 1.5;
}
