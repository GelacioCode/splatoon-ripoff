import { CONFIG } from '@paint-rush/shared';
import { BOMB_SLOT, PRIMARY_SLOT, type PlayerInput } from '@paint-rush/shared/sim';
import { yawToward } from './botBrain';

interface Point {
  x: number;
  y: number;
  z: number;
}

/** Bots throw at enemies this far away (m): not point-blank, and within a good lob. */
const THROW_MIN = 5;
const THROW_MAX = 11;
/** How often a bot with a target in range decides to throw (per second). */
const THROW_CHANCE = 0.35;
/** Out of bombs, a bot with nobody to fight walks to a crate this close (m). */
const CRATE_REACH = 16;

/** Where a bot is in a throw: 0 not throwing, 1 bomb in hand, 2 just thrown. */
export interface BombHabit {
  stage: number;
}

export function createBombHabit(): BombHabit {
  return { stage: 0 };
}

function nearest(me: Point, points: Iterable<Point>, max: number): Point | null {
  let best: Point | null = null;
  let bestDistance = max;
  for (const p of points) {
    const distance = Math.hypot(p.x - me.x, p.z - me.z);
    if (distance <= bestDistance) {
      best = p;
      bestDistance = distance;
    }
  }
  return best;
}

/** The aim pitch that lands a bomb about `distance` meters away on level ground. */
export function lobPitch(distance: number): number {
  const b = CONFIG.bomb;
  const reach = (distance * b.gravity) / (b.throwSpeed * b.throwSpeed);
  const angle = 0.5 * Math.asin(Math.min(1, Math.max(0, reach)));
  return angle - b.throwLift;
}

/**
 * Bombs for a bot, on top of what its brain already decided (`input`): now and then it takes
 * out a bomb and lobs it at an enemy at mid range (one tick to take it out, one to throw,
 * one to let go of the trigger), and with none left and nobody to fight, it walks to the
 * nearest bomb crate.
 */
export function useBombs(
  input: PlayerInput,
  me: Point & { bombs: number },
  enemies: Point[],
  crates: Iterable<Point>,
  habit: BombHabit,
  random: () => number,
  dt: number,
): void {
  if (habit.stage === 1) {
    const target = nearest(me, enemies, THROW_MAX);
    input.slot = BOMB_SLOT;
    if (target) {
      input.aimYaw = yawToward(me, target);
      input.aimPitch = lobPitch(Math.hypot(target.x - me.x, target.z - me.z));
      input.fire = true;
    }
    habit.stage = 2;
    return;
  }
  if (habit.stage === 2) {
    // Let go of the trigger (and put the bomb away), so the weapon fires again.
    input.slot = PRIMARY_SLOT;
    input.fire = false;
    habit.stage = 0;
    return;
  }
  if (me.bombs > 0) {
    const target = nearest(me, enemies, THROW_MAX);
    const far = target !== null && Math.hypot(target.x - me.x, target.z - me.z) >= THROW_MIN;
    if (far && random() < THROW_CHANCE * dt) {
      input.slot = BOMB_SLOT;
      input.fire = false;
      habit.stage = 1;
    }
    return;
  }
  if (enemies.length > 0) return;
  const crate = nearest(me, crates, CRATE_REACH);
  if (!crate) return;
  input.aimYaw = yawToward(me, crate);
  input.moveX = 0;
  input.moveY = 1;
  input.fire = false;
}
