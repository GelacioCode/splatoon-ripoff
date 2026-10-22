import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { createInput, type PlayerInput } from './input';
import { createPlayerState, type PlayerState } from './playerState';
import type { Projectile } from './projectiles';
import { stepWeapon } from './weapon';

const DT = 1 / 30;

function newPlayer(ink: number = CONFIG.weapon.inkCapacity): PlayerState {
  const state = createPlayerState({ x: 0, y: 0, z: 0 });
  state.ink = ink;
  return state;
}

/** Runs the weapon for `seconds` with the given buttons; returns the shots fired. */
function run(state: PlayerState, seconds: number, buttons: Partial<PlayerInput> = {}) {
  const shots: Projectile[] = [];
  const input = { ...createInput(), ...buttons };
  for (let t = 0; t < Math.round(seconds / DT); t++) stepWeapon(state, input, DT, 1, shots);
  return shots;
}

describe('stepWeapon', () => {
  it('fires at the configured rate and never refills while shooting', () => {
    const state = newPlayer();
    const shots = run(state, 1, { fire: true });
    const expected = 1 / CONFIG.weapon.fireInterval;
    expect(shots.length).toBeGreaterThanOrEqual(Math.floor(expected));
    expect(shots.length).toBeLessThanOrEqual(Math.ceil(expected) + 1);
    expect(state.ink).toBeCloseTo(
      CONFIG.weapon.inkCapacity - shots.length * CONFIG.weapon.inkPerShot,
      9,
    );
  });

  it('reloads when the tank runs dry, and blocks shooting until the reload is done', () => {
    const state = newPlayer(CONFIG.weapon.inkPerShot * 2);
    // Two shots empty the tank; holding the trigger for the rest of the second fires nothing.
    expect(run(state, 1, { fire: true })).toHaveLength(2);
    expect(state.reloadTimer).toBeGreaterThan(0);
    run(state, CONFIG.weapon.reloadSeconds);
    expect(state.reloadTimer).toBe(0);
    expect(state.ink).toBe(CONFIG.weapon.inkCapacity);
  });

  it('reloads by itself after a long pause without shooting', () => {
    const half = CONFIG.weapon.inkCapacity / 2;
    const state = newPlayer(half);
    run(state, CONFIG.weapon.autoReloadAfterSeconds - 1);
    expect(state.reloadTimer).toBe(0);
    expect(state.ink).toBe(half);
    run(state, 1.5);
    expect(state.reloadTimer).toBeGreaterThan(0);
    run(state, CONFIG.weapon.reloadSeconds + 0.1);
    expect(state.ink).toBe(CONFIG.weapon.inkCapacity);
  });

  it('reloads on request and cannot shoot meanwhile', () => {
    const state = newPlayer(CONFIG.weapon.inkCapacity / 2);
    run(state, DT, { reload: true });
    expect(state.reloadTimer).toBeGreaterThan(0);
    expect(run(state, 1, { fire: true })).toHaveLength(0);
  });

  it('refills quickly while hidden in own paint, which also ends a reload', () => {
    const state = newPlayer(0);
    state.submerged = true;
    run(state, CONFIG.weapon.inkCapacity / CONFIG.swim.inkRefillRate + 0.1);
    expect(state.ink).toBe(CONFIG.weapon.inkCapacity);
    expect(state.reloadTimer).toBe(0);
  });

  it('cannot shoot as a puddle', () => {
    const state = newPlayer();
    state.swimBlend = 1;
    expect(run(state, 1, { fire: true })).toHaveLength(0);
  });

  it('aims far more precisely, and aimed shots fly faster and straighter for longer', () => {
    const wobble = (aiming: boolean) => {
      const state = newPlayer();
      state.aiming = aiming;
      const shots = run(state, 1, { fire: true });
      // Largest sideways angle away from straight ahead (yaw 0 shoots toward −Z).
      return {
        shots,
        maxAngle: Math.max(...shots.map((p) => Math.abs(Math.atan2(p.vx, -p.vz)))),
      };
    };
    const hip = wobble(false);
    const aimed = wobble(true);
    expect(aimed.maxAngle).toBeLessThan(hip.maxAngle);
    expect(aimed.maxAngle).toBeLessThanOrEqual((CONFIG.weapon.aimSpreadDeg * Math.PI) / 180);
    expect(aimed.shots[0].straightTime).toBeGreaterThan(hip.shots[0].straightTime);
    expect(Math.hypot(aimed.shots[0].vx, aimed.shots[0].vz)).toBeGreaterThan(
      Math.hypot(hip.shots[0].vx, hip.shots[0].vz),
    );
  });

  it('gives the same shot the same spread every time (deterministic)', () => {
    const a = run(newPlayer(), 0.5, { fire: true });
    const b = run(newPlayer(), 0.5, { fire: true });
    expect(a.map((p) => p.vx)).toEqual(b.map((p) => p.vx));
    expect(a.map((p) => p.vy)).toEqual(b.map((p) => p.vy));
  });
});
