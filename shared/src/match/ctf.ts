import { CONFIG } from '../config';
import type { ZoneDef } from '../maps/types';
import type { Vec3 } from '../math3d';

/**
 * Where the one neutral flag is: at its spawn in the middle, carried by someone, dropped where
 * its carrier was splatted, or away for a moment after a capture.
 */
export type FlagState = 'home' | 'carried' | 'dropped' | 'away';

/** A synced flag state string as a FlagState ('home' for anything unknown). */
export function parseFlagState(value: string): FlagState {
  return value === 'carried' || value === 'dropped' || value === 'away' ? value : 'home';
}

export interface Flag {
  state: FlagState;
  /** Position (for 'carried': the carrier's feet, updated every tick). */
  x: number;
  y: number;
  z: number;
  /** Session id of the carrier ('carried' only). */
  carrier: string;
  /** Seconds until a dropped flag returns, or until it reappears after a capture. */
  timer: number;
}

/** What the flag rules need to know about each player in the arena. */
export interface FlagPlayer {
  id: string;
  team: number;
  x: number;
  y: number;
  z: number;
  /** Not splatted. */
  alive: boolean;
  /** Standing up: puddles can't pick the flag up (carriers can't swim). */
  standing: boolean;
}

export type FlagEvent =
  | { kind: 'taken'; by: string; team: number }
  | { kind: 'dropped'; by: string; team: number }
  | { kind: 'captured'; by: string; team: number }
  | { kind: 'returned' }
  | { kind: 'reset' };

/** Feet height difference within which a player can still reach the flag (m). */
const PICKUP_HEIGHT = 2;

export function createFlag(spawn: Vec3): Flag {
  return { state: 'home', x: spawn.x, y: spawn.y, z: spawn.z, carrier: '', timer: 0 };
}

export function isInZone(zone: ZoneDef, x: number, y: number, z: number): boolean {
  return (
    Math.abs(x - zone.center.x) <= zone.size.x / 2 &&
    Math.abs(y - zone.center.y) <= zone.size.y / 2 &&
    Math.abs(z - zone.center.z) <= zone.size.z / 2
  );
}

function placeAt(flag: Flag, at: Vec3): void {
  flag.x = at.x;
  flag.y = at.y;
  flag.z = at.z;
}

/**
 * One tick of the flag rules (Capture the Flag):
 *  - anyone standing next to a flag at home or dropped takes it;
 *  - the carrier brings it into the enemy team's base to capture: their team scores, and the
 *    flag is away for a moment, then back at its spawn;
 *  - a splatted (or departed) carrier drops it where they were; untouched, it returns home.
 * Returns what happened this tick, if anything.
 */
export function stepFlag(
  flag: Flag,
  players: readonly FlagPlayer[],
  dt: number,
  spawn: Vec3,
  bases: readonly [ZoneDef, ZoneDef],
): FlagEvent | null {
  const m = CONFIG.match;
  if (flag.state === 'away') {
    flag.timer -= dt;
    if (flag.timer > 0) return null;
    flag.state = 'home';
    flag.timer = 0;
    placeAt(flag, spawn);
    return { kind: 'reset' };
  }

  if (flag.state === 'carried') {
    const carrier = players.find((p) => p.id === flag.carrier);
    if (!carrier || !carrier.alive) {
      // Dropped on the spot (the last known carrier position).
      const by = flag.carrier;
      const team = carrier?.team ?? -1;
      flag.state = 'dropped';
      flag.carrier = '';
      flag.timer = m.flagReturnSeconds;
      return { kind: 'dropped', by, team };
    }
    placeAt(flag, carrier);
    // Scored in the other team's base (in front of their spawn), so they have to defend it.
    const base = bases[1 - carrier.team];
    if (base && isInZone(base, carrier.x, carrier.y, carrier.z)) {
      flag.state = 'away';
      flag.carrier = '';
      flag.timer = m.flagResetDelaySeconds;
      return { kind: 'captured', by: carrier.id, team: carrier.team };
    }
    return null;
  }

  // At home or dropped: the first player close enough takes it.
  const reach = m.flagPickupRadius;
  for (const p of players) {
    if (!p.alive || !p.standing) continue;
    if (Math.hypot(p.x - flag.x, p.z - flag.z) > reach) continue;
    if (Math.abs(p.y - flag.y) > PICKUP_HEIGHT) continue;
    flag.state = 'carried';
    flag.carrier = p.id;
    flag.timer = 0;
    placeAt(flag, p);
    return { kind: 'taken', by: p.id, team: p.team };
  }

  if (flag.state === 'dropped') {
    flag.timer -= dt;
    if (flag.timer <= 0) {
      flag.state = 'home';
      flag.timer = 0;
      placeAt(flag, spawn);
      return { kind: 'returned' };
    }
  }
  return null;
}

/** Who won, once the match is over: a team, or −1 for a draw. */
export interface MatchResult {
  winner: number;
  reason: 'captures' | 'time' | 'turf' | 'draw';
}

/**
 * Whether the match is over, and who won: first to `goal` captures (the host's setting);
 * otherwise when time runs out, the most captures, then the most paint. Paint is wiped every
 * round, so `turf` is each team's paint over the whole match.
 */
export function matchResult(
  scores: readonly [number, number],
  timeLeft: number,
  turf: readonly [number, number],
  goal: number = CONFIG.match.capturesToWin,
): MatchResult | null {
  if (scores[0] >= goal || scores[1] >= goal) {
    return { winner: scores[0] >= goal ? 0 : 1, reason: 'captures' };
  }
  if (timeLeft > 0) return null;
  if (scores[0] !== scores[1]) return { winner: scores[0] > scores[1] ? 0 : 1, reason: 'time' };
  if (turf[0] !== turf[1]) return { winner: turf[0] > turf[1] ? 0 : 1, reason: 'turf' };
  return { winner: -1, reason: 'draw' };
}
