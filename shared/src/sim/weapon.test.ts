import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { createInput } from './input';
import { createPlayerState } from './playerState';
import type { Projectile } from './projectiles';
import { stepWeapon } from './weapon';

const DT = 1 / 30;

/** Holds (or doesn't hold) the trigger for `seconds`; returns the shots fired. */
function hold(state = createPlayerState({ x: 0, y: 0, z: 0 }), fire = true, seconds = 1) {
  const shots: Projectile[] = [];
  const input = { ...createInput(), fire };
  for (let t = 0; t < Math.round(seconds / DT); t++) stepWeapon(state, input, DT, 1, shots);
  return { state, shots };
}

describe('stepWeapon', () => {
  it('fires at the configured rate and uses ink per shot', () => {
    const { state, shots } = hold();
    const expected = 1 / CONFIG.weapon.fireInterval;
    expect(shots.length).toBeGreaterThanOrEqual(Math.floor(expected));
    expect(shots.length).toBeLessThanOrEqual(Math.ceil(expected) + 1);
    expect(state.ink).toBeCloseTo(
      CONFIG.weapon.inkCapacity - shots.length * CONFIG.weapon.inkPerShot,
      9,
    );
  });

  it('stops firing when the tank is empty', () => {
    const state = createPlayerState({ x: 0, y: 0, z: 0 });
    state.ink = CONFIG.weapon.inkPerShot * 2;
    expect(hold(state).shots).toHaveLength(2);
  });

  it('refills ink after a short pause', () => {
    const state = createPlayerState({ x: 0, y: 0, z: 0 });
    state.ink = 50;
    hold(state, false, CONFIG.weapon.inkRefillDelay + 1);
    expect(state.ink).toBeGreaterThan(50 + CONFIG.weapon.inkRefillRate * 0.8);
  });

  it('gives the same shot the same spread every time (deterministic)', () => {
    const a = hold(undefined, true, 0.5).shots;
    const b = hold(undefined, true, 0.5).shots;
    expect(a.map((p) => p.vx)).toEqual(b.map((p) => p.vx));
    expect(a.map((p) => p.vy)).toEqual(b.map((p) => p.vy));
  });
});
