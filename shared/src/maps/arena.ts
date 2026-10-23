import type { Vec3 } from '../math3d';
import type { BlockDef, BlockKind, MapDef, ZoneDef } from './types';

type Triple = [number, number, number];

export function box(
  kind: BlockKind,
  [cx, cy, cz]: Triple,
  [sx, sy, sz]: Triple,
  paintable = true,
): BlockDef {
  return {
    kind,
    center: { x: cx, y: cy, z: cz },
    size: { x: sx, y: sy, z: sz },
    rotation: { x: 0, y: 0, z: 0 },
    paintable,
  };
}

/**
 * A ramp running along Z: a tilted slab whose top face climbs from height `yStart` at
 * `zStart` to height `yEnd` at `zEnd`.
 */
export function ramp(
  x: number,
  width: number,
  zStart: number,
  zEnd: number,
  yStart: number,
  yEnd: number,
): BlockDef {
  const thickness = 0.4;
  const dz = zEnd - zStart;
  const dy = yEnd - yStart;
  const angle = -Math.atan(dy / dz);
  // The top face's normal after tilting around X; the slab hangs just below the walking line.
  const normalY = Math.cos(angle);
  const normalZ = Math.sin(angle);
  return {
    kind: 'ramp',
    center: {
      x,
      y: (yStart + yEnd) / 2 - (normalY * thickness) / 2,
      z: (zStart + zEnd) / 2 - (normalZ * thickness) / 2,
    },
    size: { x: width, y: thickness, z: Math.hypot(dz, dy) },
    rotation: { x: angle, y: 0, z: 0 },
    paintable: true,
  };
}

/** The same point turned 180° around the center of the map. */
export function turnPoint(p: Vec3): Vec3 {
  return { x: -p.x, y: p.y, z: -p.z };
}

/** The same block turned 180° around the center of the map (team 1's copy of a team 0 block). */
function turnBlock(block: BlockDef): BlockDef {
  return {
    ...block,
    center: turnPoint(block.center),
    rotation: { x: -block.rotation.x, y: block.rotation.y, z: -block.rotation.z },
  };
}

/** Half the arena's width (x) and length (z) at scale 1 (m): 36 × 64. */
export const ARENA_HALF_WIDTH = 18;
export const ARENA_HALF_LENGTH = 32;
const PAD_DEPTH = 5;
/** The base starts this far in front of the spawn pad, and is this deep (m). */
const BASE_GAP = 0.5;
const BASE_DEPTH = 4;

/**
 * The parts every layout shares, for an arena `scale` times the normal width and length
 * (heights stay the same, so jumps and walls feel the same): the floor and the center
 * platform, plus team 0's boundary, spawn pad and ramp up to the platform.
 */
function frame(scale: number) {
  const halfWidth = ARENA_HALF_WIDTH * scale;
  const halfLength = ARENA_HALF_LENGTH * scale;
  const padZ = -halfLength + PAD_DEPTH / 2;
  const center: BlockDef[] = [
    box('floor', [0, -0.5, 0], [halfWidth * 2, 1, halfLength * 2]),
    // Raised platform where the flag appears.
    box('block', [0, 0.75, 0], [10, 1.5, 10]),
  ];
  const half: BlockDef[] = [
    // Boundary: tall and unpaintable, so nobody can climb out.
    box('boundary', [-(halfWidth + 0.5), 3, 0], [1, 6, halfLength * 2 + 2], false),
    box('boundary', [0, 3, -(halfLength + 0.5)], [halfWidth * 2 + 2, 6, 1], false),
    // Spawn pad at the back (wider in bigger arenas, for the bigger teams).
    box('block', [0, 0.5, padZ], [10 * scale, 1, PAD_DEPTH]),
    // Ramp up to the center platform.
    ramp(0, 4, -9, -5, 0, 1.5),
  ];
  // On top of the spawn pad, front row first (more room for the camera behind you).
  const spawns: Vec3[] = [
    { x: 0, y: 1, z: padZ + 1 },
    { x: -2.5 * scale, y: 1, z: padZ + 1 },
    { x: 2.5 * scale, y: 1, z: padZ + 1 },
    { x: -1.5 * scale, y: 1, z: padZ - 1 },
    { x: 1.5 * scale, y: 1, z: padZ - 1 },
  ];
  const base: ZoneDef = {
    center: { x: 0, y: 1.5, z: padZ + PAD_DEPTH / 2 + BASE_GAP + BASE_DEPTH / 2 },
    size: { x: 8 * scale, y: 3, z: BASE_DEPTH },
  };
  return { halfWidth, halfLength, padZ, center, half, spawns, base };
}

/** The front edge of team 0's spawn pad (z) in an arena of this scale. */
export function spawnPadFront(scale: number): number {
  return -ARENA_HALF_LENGTH * scale + PAD_DEPTH;
}

/** The original "Drip Yard" cover for team 0's half, used for the first round. */
const CLASSIC_COVER: BlockDef[] = [
  // Low cover in front of the base.
  box('block', [-6, 0.6, -21], [2.4, 1.2, 1]),
  box('block', [6, 0.6, -21], [2.4, 1.2, 1]),
  // Climbable wall in the left lane.
  box('wall', [-7, 1.5, -15], [5, 3, 0.8]),
  // Left side ledge with a ramp up to it.
  box('block', [-15, 1.25, -11], [6, 2.5, 10]),
  ramp(-15, 3, -21, -16, 0, 2.5),
  // Tall cover in the right lane.
  box('wall', [10, 1.25, -12], [1.2, 2.5, 4]),
  // Cover around the middle.
  box('block', [-7, 0.75, -4], [1.6, 1.5, 1.6]),
  box('block', [8, 0.75, -6], [1.6, 1.5, 1.6]),
];

/**
 * An arena from team 0's cover (−Z half): the shared frame (floor, boundary, spawn pads,
 * center platform and its ramps) plus that cover, mirrored for team 1 so both sides play
 * alike. 36 × 64 m at scale 1; bigger scales are for more players (see arenaScaleFor).
 */
export function composeArena(name: string, cover: readonly BlockDef[], scale = 1): MapDef {
  const f = frame(scale);
  const half = [...f.half, ...cover];
  return {
    name,
    bounds: { minX: -f.halfWidth, maxX: f.halfWidth, minZ: -f.halfLength, maxZ: f.halfLength },
    blocks: [...f.center, ...half, ...half.map(turnBlock)],
    spawns: [f.spawns, f.spawns.map(turnPoint)],
    bases: [f.base, { center: turnPoint(f.base.center), size: f.base.size }],
    flagSpawn: { x: 0, y: 1.5, z: 0 },
  };
}

/** "Drip Yard": the first Capture the Flag arena, hand-made (the first round of every match). */
export const ARENA: MapDef = composeArena('Drip Yard', CLASSIC_COVER);
