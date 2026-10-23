import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { createHill, HILL_CONTESTED, HILL_FREE, stepHill, type HillPlayer } from './koth';

const DT = 1 / 30;
const SPOT = { x: 3, y: 0, z: 0 };

function player(team: number, x = SPOT.x, z = SPOT.z, y = SPOT.y): HillPlayer {
  return { team, x, y, z, alive: true };
}

/** Steps the hill for `seconds`; returns the first stage win (or −1). */
function run(hill: ReturnType<typeof createHill>, players: HillPlayer[], seconds: number): number {
  for (let t = 0; t < Math.round(seconds / DT); t++) {
    const won = stepHill(hill, players, DT);
    if (won >= 0) return won;
  }
  return -1;
}

describe('the hill', () => {
  it('pushes the bar toward the enemy while one team holds it alone', () => {
    const hill = createHill(SPOT);
    run(hill, [player(0)], 6);
    expect(hill.holder).toBe(0);
    // 100 points per winSeconds: 6 s is a tenth of the way.
    expect(hill.balance).toBeCloseTo((100 * 6) / CONFIG.koth.winSeconds, 1);
    run(hill, [player(1)], 12);
    expect(hill.holder).toBe(1);
    expect(hill.balance).toBeLessThan(0);
  });

  it('stands still while both teams are in it, or nobody is', () => {
    const hill = createHill(SPOT);
    run(hill, [player(0)], 3);
    const before = hill.balance;
    run(hill, [player(0), player(1, SPOT.x + 1)], 5);
    expect(hill.holder).toBe(HILL_CONTESTED);
    expect(hill.balance).toBe(before);
    run(hill, [player(0, 20), player(1, -20)], 5);
    expect(hill.holder).toBe(HILL_FREE);
    expect(hill.balance).toBe(before);
  });

  it("doesn't count splatted players, or anyone outside the circle", () => {
    const hill = createHill(SPOT);
    const splatted = { ...player(1), alive: false };
    const outside = player(1, SPOT.x + CONFIG.koth.hillRadius + 0.5);
    const above = player(1, SPOT.x, SPOT.z, SPOT.y + CONFIG.koth.hillHeight + 1);
    run(hill, [player(0), splatted, outside, above], 2);
    expect(hill.holder).toBe(0);
  });

  it('wins the stage after a net minute of holding', () => {
    const hill = createHill(SPOT);
    expect(run(hill, [player(1)], CONFIG.koth.winSeconds - 1)).toBe(-1);
    expect(run(hill, [player(1)], 2)).toBe(1);
    expect(hill.balance).toBe(-100);
  });
});
