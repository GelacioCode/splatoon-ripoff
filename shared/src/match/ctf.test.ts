import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { ARENA } from '../maps/arena';
import { createFlag, matchResult, stepFlag, type FlagEvent, type FlagPlayer } from './ctf';

const SPAWN = ARENA.flagSpawn;
const BASES = ARENA.bases;
const DT = 1 / 30;

function player(id: string, team: number, at: { x: number; y: number; z: number }): FlagPlayer {
  return { id, team, ...at, alive: true, standing: true };
}

/** Runs the flag for `seconds` with the given players; returns every event. */
function run(flag: ReturnType<typeof createFlag>, players: FlagPlayer[], seconds: number) {
  const events: FlagEvent[] = [];
  for (let t = 0; t < Math.round(seconds / DT); t++) {
    const event = stepFlag(flag, players, DT, SPAWN, BASES);
    if (event) events.push(event);
  }
  return events;
}

describe('the flag', () => {
  it('is taken by a player standing next to it', () => {
    const flag = createFlag(SPAWN);
    const sam = player('sam', 0, { x: SPAWN.x + 0.5, y: SPAWN.y, z: SPAWN.z });
    expect(stepFlag(flag, [sam], DT, SPAWN, BASES)).toEqual({ kind: 'taken', by: 'sam', team: 0 });
    expect(flag.state).toBe('carried');
  });

  it("can't be taken by a puddle, a splatted player, or from too far away", () => {
    const flag = createFlag(SPAWN);
    const puddle = { ...player('a', 0, SPAWN), standing: false };
    const splatted = { ...player('b', 1, SPAWN), alive: false };
    const far = player('c', 0, { x: SPAWN.x + 3, y: SPAWN.y, z: SPAWN.z });
    expect(run(flag, [puddle, splatted, far], 1)).toEqual([]);
    expect(flag.state).toBe('home');
  });

  it('scores when carried into your own base (not the enemy one), then resets', () => {
    const flag = createFlag(SPAWN);
    const sam = player('sam', 0, SPAWN);
    stepFlag(flag, [sam], DT, SPAWN, BASES);
    // Through the enemy base: nothing.
    Object.assign(sam, BASES[1].center);
    expect(stepFlag(flag, [sam], DT, SPAWN, BASES)).toBeNull();
    // Into team 0's base: a capture.
    Object.assign(sam, BASES[0].center);
    expect(stepFlag(flag, [sam], DT, SPAWN, BASES)).toEqual({
      kind: 'captured',
      by: 'sam',
      team: 0,
    });
    expect(flag.state).toBe('away');
    expect(run(flag, [], CONFIG.match.flagResetDelaySeconds + 0.1)).toEqual([{ kind: 'reset' }]);
    expect(flag).toMatchObject({ state: 'home', x: SPAWN.x, z: SPAWN.z });
  });

  it('drops where its carrier is splatted; anyone can take it, or it returns by itself', () => {
    const flag = createFlag(SPAWN);
    const sam = player('sam', 0, SPAWN);
    stepFlag(flag, [sam], DT, SPAWN, BASES);
    const dropAt = { x: 5, y: 0, z: -10 };
    Object.assign(sam, dropAt);
    stepFlag(flag, [sam], DT, SPAWN, BASES);
    sam.alive = false;
    expect(stepFlag(flag, [sam], DT, SPAWN, BASES)).toEqual({
      kind: 'dropped',
      by: 'sam',
      team: 0,
    });
    expect(flag).toMatchObject({ state: 'dropped', ...dropAt });

    // An enemy picks it up from the ground.
    const alex = player('alex', 1, dropAt);
    expect(stepFlag(flag, [alex], DT, SPAWN, BASES)).toMatchObject({ kind: 'taken', by: 'alex' });

    // Dropped again and left alone: back home after the return time.
    alex.alive = false;
    stepFlag(flag, [alex], DT, SPAWN, BASES);
    expect(run(flag, [alex], CONFIG.match.flagReturnSeconds + 0.1)).toEqual([{ kind: 'returned' }]);
    expect(flag.state).toBe('home');
  });

  it('drops if its carrier leaves the game', () => {
    const flag = createFlag(SPAWN);
    stepFlag(flag, [player('sam', 0, SPAWN)], DT, SPAWN, BASES);
    expect(stepFlag(flag, [], DT, SPAWN, BASES)).toMatchObject({ kind: 'dropped', by: 'sam' });
  });
});

describe('matchResult', () => {
  const goal = CONFIG.match.capturesToWin;

  it('ends as soon as a team reaches the capture goal', () => {
    expect(matchResult([goal, 1], 100, [0, 0])).toEqual({ winner: 0, reason: 'captures' });
    expect(matchResult([1, 1], 100, [0, 0])).toBeNull();
  });

  it("uses the host's capture goal (3, 5 or 7)", () => {
    expect(matchResult([1, 3], 100, [0, 0], 5)).toBeNull();
    expect(matchResult([1, 5], 100, [0, 0], 5)).toEqual({ winner: 1, reason: 'captures' });
    expect(matchResult([6, 2], 100, [0, 0], 7)).toBeNull();
  });

  it('when time runs out: most captures, then most turf, else a draw', () => {
    expect(matchResult([2, 1], 0, [10, 90])).toEqual({ winner: 0, reason: 'time' });
    expect(matchResult([1, 1], 0, [10, 90])).toEqual({ winner: 1, reason: 'turf' });
    expect(matchResult([1, 1], 0, [50, 50])).toEqual({ winner: -1, reason: 'draw' });
  });
});
