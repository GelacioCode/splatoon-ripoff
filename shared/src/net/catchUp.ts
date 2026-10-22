import { CONFIG } from '../config';

/**
 * How many of a player's queued inputs the server should run this tick. Normally one, so the
 * player moves at the same rate as their own screen predicts. When more than
 * `maxQueuedInputs` are waiting (e.g. after a network hiccup delivered a burst), extra ones
 * run now, at most `maxCatchUpSteps` per tick, so the queue shrinks back instead of adding
 * delay for good. Running inputs (rather than dropping them) keeps every jump and shot.
 */
export function inputsToRun(
  queued: number,
  maxQueued = CONFIG.net.maxQueuedInputs,
  maxSteps = CONFIG.net.maxCatchUpSteps,
): number {
  return Math.max(1, Math.min(maxSteps, queued - maxQueued));
}
