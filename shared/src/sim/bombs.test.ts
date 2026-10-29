import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import type { BlockDef } from '../maps/types';
import { blastDamage, createBomb, stepBombs, stepBombThrow, type Bomb } from './bombs';
import { initPhysics } from './index';
import { createInput, type PlayerInput } from './input';
import { PhysicsWorld } from './physicsWorld';
import { BOMB_SLOT, createPlayerState, PRIMARY_SLOT } from './playerState';
import type { Projectile } from './projectiles';
import { stepWeapon } from './weapon';

const DT = 1 / CONFIG.net.tickRate;

/** A big floor with its top at y = 0. */
const FLOOR: BlockDef = {
  kind: 'floor',
  center: { x: 0, y: -0.5, z: 0 },
  size: { x: 80, y: 1, z: 80 },
  rotation: { x: 0, y: 0, z: 0 },
  paintable: true,
};

let physics: PhysicsWorld;

beforeAll(async () => {
  await initPhysics();
  physics = new PhysicsWorld([FLOOR]);
});

afterAll(() => {
  physics.dispose();
});

const input = (over: Partial<PlayerInput> = {}): PlayerInput => ({ ...createInput(), ...over });

describe('throwing bombs', () => {
  it('throws one bomb per click with a bomb in hand, and starts everyone with 2', () => {
    const s = createPlayerState({ x: 0, y: 0, z: 0 });
    expect(s.bombs).toBe(CONFIG.bomb.max);
    const out: Bomb[] = [];
    stepBombThrow(s, input({ slot: BOMB_SLOT }), DT, 'me', out);
    expect(s.slot).toBe(BOMB_SLOT);
    // Holding the trigger throws once, not again and again.
    for (let i = 0; i < 60; i++)
      stepBombThrow(s, input({ slot: BOMB_SLOT, fire: true }), DT, 'me', out);
    expect(out).toHaveLength(1);
    expect(s.bombs).toBe(CONFIG.bomb.max - 1);
    expect(out[0]).toMatchObject({ owner: 'me', number: 1, team: 0 });
  });

  it('puts the weapon back in hand after the last bomb, and needs a fresh press to shoot', () => {
    const s = createPlayerState({ x: 0, y: 0, z: 0 });
    const bombs: Bomb[] = [];
    const shots: Projectile[] = [];
    const click = () => {
      stepBombThrow(s, input({ slot: BOMB_SLOT }), CONFIG.bomb.cooldownSeconds, 'me', bombs);
      stepBombThrow(s, input({ slot: BOMB_SLOT, fire: true }), DT, 'me', bombs);
    };
    click();
    click();
    expect(bombs).toHaveLength(2);
    expect(s.bombs).toBe(0);
    expect(s.slot).toBe(PRIMARY_SLOT);
    // Still holding the trigger from the throw: no shot yet.
    stepWeapon(s, input({ fire: true }), DT, 1, shots);
    expect(shots).toHaveLength(0);
    // Asking for a bomb with none left keeps the weapon in hand.
    stepBombThrow(s, input({ slot: BOMB_SLOT }), DT, 'me', bombs);
    expect(s.slot).toBe(PRIMARY_SLOT);
  });

  it("doesn't shoot paint while a bomb is in hand", () => {
    const s = createPlayerState({ x: 0, y: 0, z: 0 });
    const shots: Projectile[] = [];
    stepBombThrow(s, input({ slot: BOMB_SLOT }), DT, 'me', []);
    stepWeapon(s, input({ slot: BOMB_SLOT, fire: true }), DT, 1, shots);
    expect(shots).toHaveLength(0);
  });
});

describe('bombs in flight', () => {
  it('fly in an arc, come to rest on the floor, and go off after the fuse', () => {
    const bombs = [createBomb('me', 1, { x: 0, y: 1, z: 0 }, 0, 0, 0)];
    const blasts: Bomb[] = [];
    let ticks = 0;
    while (bombs.length > 0 && ticks < 200) {
      stepBombs(physics, bombs, DT, (b) => blasts.push(b));
      ticks++;
      for (const b of bombs) expect(b.y).toBeGreaterThan(0);
    }
    expect(blasts).toHaveLength(1);
    const blast = blasts[0];
    // Thrown forward (−Z), it landed a few meters away, lying on the floor.
    expect(blast.z).toBeLessThan(-3);
    expect(blast.y).toBeCloseTo(CONFIG.bomb.radius, 1);
    expect(ticks * DT).toBeCloseTo(CONFIG.bomb.fuseSeconds, 1);
  });

  it('hurt most up close, less toward the edge, and not at all past it', () => {
    const b = CONFIG.bomb;
    expect(blastDamage(0)).toBe(b.maxDamage);
    expect(blastDamage(b.blastRadius)).toBeCloseTo(b.minDamage, 6);
    expect(blastDamage(b.blastRadius / 2)).toBeLessThan(b.maxDamage);
    expect(blastDamage(b.blastRadius / 2)).toBeGreaterThan(b.minDamage);
    expect(blastDamage(b.blastRadius + 0.1)).toBe(0);
  });
});
