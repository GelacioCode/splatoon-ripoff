import { CONFIG } from '../config';
import type { Vec3 } from '../math3d';

/** Nobody is in the hill. */
export const HILL_FREE = -1;
/** Both teams are in the hill: the bar doesn't move. */
export const HILL_CONTESTED = 2;

/**
 * King of the Hill: one circle on the middle line, and a tug-of-war bar. `balance` starts at
 * 0 (the middle). While only team 0 is in the circle it moves up toward +100, while only
 * team 1 is in it, down toward −100. Reaching the end wins the stage: a net minute of holding.
 */
export interface Hill {
  x: number;
  y: number;
  z: number;
  radius: number;
  /** −100 … 100: team 0 wins the stage at +100, team 1 at −100. */
  balance: number;
  /** Who's in it: a team, HILL_FREE or HILL_CONTESTED. */
  holder: number;
}

/** What the hill rules need to know about each player in the arena. */
export interface HillPlayer {
  team: number;
  x: number;
  y: number;
  z: number;
  /** Not splatted. */
  alive: boolean;
}

export function createHill(spot: Vec3, radius: number = CONFIG.koth.hillRadius): Hill {
  return { x: spot.x, y: spot.y, z: spot.z, radius, balance: 0, holder: HILL_FREE };
}

/** Whether a point is inside the hill: within its circle, and not far above or below it. */
export function inHill(hill: Hill, x: number, y: number, z: number): boolean {
  return (
    Math.hypot(x - hill.x, z - hill.z) <= hill.radius &&
    Math.abs(y - hill.y) <= CONFIG.koth.hillHeight
  );
}

/**
 * One tick of the hill: who's in it, and the bar moving toward the enemy while exactly one
 * team holds it (100 points in `CONFIG.koth.winSeconds`). Returns the team that just won the
 * stage, or −1.
 */
export function stepHill(hill: Hill, players: readonly HillPlayer[], dt: number): number {
  let inside0 = false;
  let inside1 = false;
  for (const p of players) {
    if (!p.alive || !inHill(hill, p.x, p.y, p.z)) continue;
    if (p.team === 0) inside0 = true;
    else if (p.team === 1) inside1 = true;
  }
  hill.holder = inside0 && inside1 ? HILL_CONTESTED : inside0 ? 0 : inside1 ? 1 : HILL_FREE;
  if (hill.holder !== 0 && hill.holder !== 1) return -1;
  const push = (100 / CONFIG.koth.winSeconds) * dt;
  hill.balance = Math.max(-100, Math.min(100, hill.balance + (hill.holder === 0 ? push : -push)));
  if (hill.balance >= 100) return 0;
  if (hill.balance <= -100) return 1;
  return -1;
}

/** News about the hill for everyone's announcements (sent like flag news). */
export type HillEvent = { kind: 'hillHeld'; team: number } | { kind: 'hillWon'; team: number };
