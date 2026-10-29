import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { weaponStats } from '../weapons';
import { createInput, type PlayerInput } from './input';
import { createPlayerState, type PlayerState } from './playerState';
import type { Projectile } from './projectiles';
import { stepWeapon } from './weapon';

const DT = 1 / 30;
const ASSAULT = 0;
const SNIPER = 1;
const assault = weaponStats(ASSAULT);

function newPlayer(ink: number = assault.magazine, weapon = ASSAULT): PlayerState {
  const state = createPlayerState({ x: 0, y: 0, z: 0 }, 0, 0, weapon);
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
  it('fires at the role rate and never refills while shooting', () => {
    const state = newPlayer();
    const shots = run(state, 1, { fire: true });
    const expected = 1 / assault.fireInterval;
    expect(shots.length).toBeGreaterThanOrEqual(Math.floor(expected));
    expect(shots.length).toBeLessThanOrEqual(Math.ceil(expected) + 1);
    expect(state.ink).toBeCloseTo(assault.magazine - shots.length * CONFIG.weapon.inkPerShot, 9);
  });

  it('reloads when the tank runs dry, and blocks shooting until the reload is done', () => {
    const state = newPlayer(CONFIG.weapon.inkPerShot * 2);
    // Two shots empty the tank; holding the trigger for the rest of the second fires nothing.
    expect(run(state, 1, { fire: true })).toHaveLength(2);
    expect(state.reloadTimer).toBeGreaterThan(0);
    run(state, assault.reloadSeconds);
    expect(state.reloadTimer).toBe(0);
    expect(state.ink).toBe(assault.magazine);
  });

  it('reloads by itself after a long pause without shooting', () => {
    const half = assault.magazine / 2;
    const state = newPlayer(half);
    run(state, CONFIG.weapon.autoReloadAfterSeconds - 1);
    expect(state.reloadTimer).toBe(0);
    expect(state.ink).toBe(half);
    run(state, 1.5);
    expect(state.reloadTimer).toBeGreaterThan(0);
    run(state, assault.reloadSeconds + 0.1);
    expect(state.ink).toBe(assault.magazine);
  });

  it('reloads on request and cannot shoot meanwhile', () => {
    const state = newPlayer(assault.magazine / 2);
    run(state, DT, { reload: true });
    expect(state.reloadTimer).toBeGreaterThan(0);
    expect(run(state, 1, { fire: true })).toHaveLength(0);
  });

  it('reloads 50 % faster while calm (no damage, no shooting for a while)', () => {
    const fast = assault.reloadSeconds / CONFIG.health.recoveryReloadSpeed;
    const calm = newPlayer(assault.magazine / 2);
    calm.sinceDamage = 99;
    calm.sinceShot = 99;
    run(calm, DT, { reload: true });
    run(calm, fast + 0.1);
    expect(calm.ink).toBe(assault.magazine);

    // Just hit: the normal reload time.
    const busy = newPlayer(assault.magazine / 2);
    run(busy, DT, { reload: true });
    run(busy, fast + 0.1);
    expect(busy.reloadTimer).toBeGreaterThan(0);
  });

  it('refills quickly while hidden in own paint, which also ends a reload', () => {
    const state = newPlayer(0);
    state.submerged = true;
    run(state, assault.magazine / CONFIG.swim.inkRefillRate + 0.1);
    expect(state.ink).toBe(assault.magazine);
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
    expect(aimed.maxAngle).toBeLessThanOrEqual((assault.aimSpreadDeg * Math.PI) / 180);
    expect(aimed.shots[0].straightTime).toBeGreaterThan(hip.shots[0].straightTime);
    expect(Math.hypot(aimed.shots[0].vx, aimed.shots[0].vz)).toBeGreaterThan(
      Math.hypot(hip.shots[0].vx, hip.shots[0].vz),
    );
  });

  it("empties a sniper's tank after its magazine of shots", () => {
    const state = newPlayer(weaponStats(SNIPER).magazine, SNIPER);
    const shots = run(state, 10, { fire: true });
    // Holding fire for 10 s: one magazine, a reload, then more shots; the first batch is the magazine.
    expect(shots.length).toBeGreaterThan(weaponStats(SNIPER).magazine);
    const quick = newPlayer(weaponStats(SNIPER).magazine, SNIPER);
    const firstMagazine = run(
      quick,
      weaponStats(SNIPER).magazine * weaponStats(SNIPER).fireInterval + 0.5,
      {
        fire: true,
      },
    );
    expect(firstMagazine).toHaveLength(weaponStats(SNIPER).magazine);
    expect(quick.reloadTimer).toBeGreaterThan(0);
  });

  it('gives the same shot the same spread every time (deterministic)', () => {
    const a = run(newPlayer(), 0.5, { fire: true });
    const b = run(newPlayer(), 0.5, { fire: true });
    expect(a.map((p) => p.vx)).toEqual(b.map((p) => p.vx));
    expect(a.map((p) => p.vy)).toEqual(b.map((p) => p.vy));
  });
});
