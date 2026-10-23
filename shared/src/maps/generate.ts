import { createRng } from '../rng';
import { ARENA, box, composeArena, ramp } from './arena';
import type { BlockDef, MapDef } from './types';

/** An area on the ground (x, z), in team 0's half. */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Where pieces may go in team 0's half (inside the boundary, short of the center line). */
const AREA: Rect = { minX: -18, maxX: 18, minZ: -30.5, maxZ: -1.2 };

/** Always left open: the spawn pad and base, and the center platform with its ramp. */
export const KEEP_CLEAR: readonly Rect[] = [
  { minX: -6, maxX: 6, minZ: -32, maxZ: -22 },
  { minX: -7, maxX: 7, minZ: -10.5, maxZ: 0 },
];

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

/** Builds one piece (one or more blocks) at a random spot. */
type PieceMaker = (random: Random) => BlockDef[];

function lowCover(random: Random): BlockDef[] {
  const w = between(random, 1.4, 2.8);
  const h = between(random, 1, 1.6);
  const d = between(random, 1, 2.4);
  return [box('block', [between(random, -15, 15), h / 2, between(random, -28, -3)], [w, h, d])];
}

function pillar(random: Random): BlockDef[] {
  const w = between(random, 1.3, 1.8);
  const h = between(random, 2.2, 2.9);
  return [box('block', [between(random, -15, 15), h / 2, between(random, -28, -3)], [w, h, w])];
}

/** A tall wall to swim up once it's painted, across or along the lanes. */
function climbWall(random: Random): BlockDef[] {
  const length = between(random, 4, 6);
  const h = between(random, 2.5, 3.2);
  const across = random() < 0.5;
  const size: [number, number, number] = across ? [length, h, 0.8] : [0.8, h, length];
  return [box('wall', [between(random, -14, 14), h / 2, between(random, -27, -4)], size)];
}

/** A raised ledge by one side wall, with a ramp up to it from the spawn side. */
function sideLedge(random: Random): BlockDef[] {
  const w = between(random, 4.5, 6.5);
  const h = between(random, 2, 2.6);
  const d = between(random, 6, 9);
  const side = random() < 0.5 ? -1 : 1;
  // Flush against the side wall, so there's no gap to fall into.
  const x = side * (18 - w / 2);
  const z = between(random, -16, -4) - d / 2;
  const rampLength = between(random, 4.5, 6);
  const front = z - d / 2;
  return [box('block', [x, h / 2, z], [w, h, d]), ramp(x, 3, front - rampLength, front, 0, h)];
}

/** Which pieces a layout gets: a side ledge most of the time, walls, pillars and low cover. */
function plan(random: Random): PieceMaker[] {
  const pieces: PieceMaker[] = [];
  if (random() < 0.7) pieces.push(sideLedge);
  const walls = 1 + Math.floor(random() * 2);
  const pillars = Math.floor(random() * 3);
  const covers = 3 + Math.floor(random() * 3);
  for (let i = 0; i < walls; i++) pieces.push(climbWall);
  for (let i = 0; i < pillars; i++) pieces.push(pillar);
  for (let i = 0; i < covers; i++) pieces.push(lowCover);
  return pieces;
}

/**
 * Team 0's cover for a fresh random layout: each piece is tried at random spots until it fits
 * inside the half, clear of the spawn, base and center, with a walkway around the others.
 */
export function randomCover(seed: number): BlockDef[] {
  const random = createRng(seed);
  const placed: BlockDef[] = [];
  const taken: Rect[] = [...KEEP_CLEAR];
  for (const make of plan(random)) {
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const piece = make(random);
      const areas = piece.map(footprint);
      const fits = areas.every(
        (area) => inside(area, AREA) && taken.every((other) => !overlaps(area, other, WALKWAY)),
      );
      if (!fits) continue;
      placed.push(...piece);
      taken.push(...areas);
      break;
    }
  }
  return placed;
}

/**
 * The arena for a round: seed 0 is the hand-made Drip Yard (first round), any other seed a
 * fresh random layout that's the same on every screen.
 */
export function arenaFor(seed: number): MapDef {
  return seed === 0 ? ARENA : composeArena(`Layout ${seed.toString(36)}`, randomCover(seed));
}

/** A seed for a new random layout (never 0, which means Drip Yard). */
export function newLayoutSeed(random: Random): number {
  return 1 + Math.floor(random() * 0xfffffffe);
}
