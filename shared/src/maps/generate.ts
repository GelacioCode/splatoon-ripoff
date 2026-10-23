import { CONFIG } from '../config';
import { createRng } from '../rng';
import {
  ARENA,
  ARENA_HALF_LENGTH,
  ARENA_HALF_WIDTH,
  box,
  composeArena,
  ramp,
  spawnPadFront,
} from './arena';
import type { BlockDef, MapDef } from './types';

/** An area on the ground (x, z), in team 0's half. */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Where pieces may go in team 0's half of an arena this `scale` (inside the boundary, short
 * of the center line).
 */
function areaFor(scale: number): Rect {
  const halfWidth = ARENA_HALF_WIDTH * scale;
  return {
    minX: -halfWidth,
    maxX: halfWidth,
    minZ: -ARENA_HALF_LENGTH * scale + 1.5,
    maxZ: -1.2,
  };
}

/** Always left open: the spawn pad and base, and the center platform with its ramp. */
export function keepClear(scale: number): Rect[] {
  const halfLength = ARENA_HALF_LENGTH * scale;
  return [
    { minX: -6 * scale, maxX: 6 * scale, minZ: -halfLength, maxZ: spawnPadFront(scale) + 5 },
    { minX: -7, maxX: 7, minZ: -10.5, maxZ: 0 },
  ];
}

/** The size step for this many players at Start (an index into CONFIG.lobby.arenaSizes). */
export function arenaSizeFor(players: number): number {
  const sizes = CONFIG.lobby.arenaSizes;
  const index = sizes.findIndex((size) => players <= size.upToPlayers);
  return index < 0 ? sizes.length - 1 : index;
}

/** How much wider and longer than normal an arena of this size step is. */
export function arenaScale(size: number): number {
  const sizes = CONFIG.lobby.arenaSizes;
  return (sizes[size] ?? sizes[0]).scale;
}

/** Room left between pieces so there's always a way through (m). */
const WALKWAY = 1.6;
const TRIES = 40;

type Random = () => number;

function between(random: Random, min: number, max: number): number {
  return min + random() * (max - min);
}

/** The ground a block covers. Ramps tilt around X, so they're shorter along Z than their slab. */
export function footprint(block: BlockDef): Rect {
  const depth = block.size.z * Math.abs(Math.cos(block.rotation.x)) + block.size.y;
  const halfDepth = block.rotation.x === 0 ? block.size.z / 2 : depth / 2;
  return {
    minX: block.center.x - block.size.x / 2,
    maxX: block.center.x + block.size.x / 2,
    minZ: block.center.z - halfDepth,
    maxZ: block.center.z + halfDepth,
  };
}

function overlaps(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.minX < b.maxX + gap && a.maxX > b.minX - gap && a.minZ < b.maxZ + gap && a.maxZ > b.minZ - gap
  );
}

function inside(r: Rect, area: Rect): boolean {
  return r.minX >= area.minX && r.maxX <= area.maxX && r.minZ >= area.minZ && r.maxZ <= area.maxZ;
}

/** Builds one piece (one or more blocks) at a random spot in an arena of this scale. */
type PieceMaker = (random: Random, scale: number) => BlockDef[];

/** A random spot for a piece's center: x across the half, z from the back to near the middle. */
function spot(random: Random, scale: number, margin: number): [number, number] {
  const halfWidth = ARENA_HALF_WIDTH * scale - margin;
  const back = -ARENA_HALF_LENGTH * scale + margin + 1;
  return [between(random, -halfWidth, halfWidth), between(random, back, -3)];
}

function lowCover(random: Random, scale: number): BlockDef[] {
  const w = between(random, 1.4, 2.8);
  const h = between(random, 1, 1.6);
  const d = between(random, 1, 2.4);
  const [x, z] = spot(random, scale, 3);
  return [box('block', [x, h / 2, z], [w, h, d])];
}

function pillar(random: Random, scale: number): BlockDef[] {
  const w = between(random, 1.3, 1.8);
  const h = between(random, 2.2, 2.9);
  const [x, z] = spot(random, scale, 3);
  return [box('block', [x, h / 2, z], [w, h, w])];
}

/** A tall wall to swim up once it's painted, across or along the lanes. */
function climbWall(random: Random, scale: number): BlockDef[] {
  const length = between(random, 4, 6);
  const h = between(random, 2.5, 3.2);
  const across = random() < 0.5;
  const size: [number, number, number] = across ? [length, h, 0.8] : [0.8, h, length];
  const [x, z] = spot(random, scale, 4);
  return [box('wall', [x, h / 2, z], size)];
}

/** A raised ledge by one side wall, with a ramp up to it from the spawn side. */
function sideLedge(random: Random, scale: number): BlockDef[] {
  const w = between(random, 4.5, 6.5);
  const h = between(random, 2, 2.6);
  const d = between(random, 6, 9);
  const side = random() < 0.5 ? -1 : 1;
  // Flush against the side wall, so there's no gap to fall into.
  const x = side * (ARENA_HALF_WIDTH * scale - w / 2);
  const z = between(random, -16 * scale, -4) - d / 2;
  const rampLength = between(random, 4.5, 6);
  const front = z - d / 2;
  return [box('block', [x, h / 2, z], [w, h, d]), ramp(x, 3, front - rampLength, front, 0, h)];
}

/**
 * Which pieces a layout gets: a side ledge most of the time (both sides in big arenas),
 * walls, pillars and low cover, more of them the bigger the arena.
 */
function plan(random: Random, scale: number): PieceMaker[] {
  const pieces: PieceMaker[] = [];
  const area = scale * scale;
  const ledges = (random() < 0.7 ? 1 : 0) + (scale > 1.2 && random() < 0.6 ? 1 : 0);
  const walls = Math.round((1 + Math.floor(random() * 2)) * area);
  const pillars = Math.round(Math.floor(random() * 3) * area);
  const covers = Math.round((3 + Math.floor(random() * 3)) * area);
  for (let i = 0; i < ledges; i++) pieces.push(sideLedge);
  for (let i = 0; i < walls; i++) pieces.push(climbWall);
  for (let i = 0; i < pillars; i++) pieces.push(pillar);
  for (let i = 0; i < covers; i++) pieces.push(lowCover);
  return pieces;
}

/**
 * Team 0's cover for a fresh random layout: each piece is tried at random spots until it fits
 * inside the half, clear of the spawn, base and center, with a walkway around the others.
 */
export function randomCover(seed: number, scale = 1): BlockDef[] {
  const random = createRng(seed);
  const placed: BlockDef[] = [];
  const area = areaFor(scale);
  const taken: Rect[] = keepClear(scale);
  for (const make of plan(random, scale)) {
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const piece = make(random, scale);
      const areas = piece.map(footprint);
      const fits = areas.every(
        (rect) => inside(rect, area) && taken.every((other) => !overlaps(rect, other, WALKWAY)),
      );
      if (!fits) continue;
      placed.push(...piece);
      taken.push(...areas);
      break;
    }
  }
  return placed;
}

/** The fixed layout used for round 1 in arenas bigger than Drip Yard. */
const BIG_FIRST_ROUND_SEED = 0x5eed;

/**
 * The arena for a round, in size step `size` (see arenaSizeFor). Seed 0 is the first round:
 * the hand-made Drip Yard at normal size, or a fixed layout in bigger arenas (Drip Yard is
 * made for the normal size). Any other seed is a fresh random layout, the same on every
 * screen.
 */
export function arenaFor(seed: number, size = 0): MapDef {
  const scale = arenaScale(size);
  if (seed === 0 && scale === 1) return ARENA;
  const layoutSeed = seed === 0 ? BIG_FIRST_ROUND_SEED : seed;
  const name = seed === 0 ? 'Big Yard' : `Layout ${seed.toString(36)}`;
  return composeArena(name, randomCover(layoutSeed, scale), scale);
}

/** A seed for a new random layout (never 0, which means Drip Yard). */
export function newLayoutSeed(random: Random): number {
  return 1 + Math.floor(random() * 0xfffffffe);
}
