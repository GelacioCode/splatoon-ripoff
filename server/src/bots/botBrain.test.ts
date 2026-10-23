import { describe, expect, it } from 'vitest';
import { createRng } from '@paint-rush/shared';
import { createBotMind, moveInput, think, yawToward, type BotView } from './botBrain';

const DT = 1 / 30;

function view(overrides: Partial<BotView> = {}): BotView {
  return {
    me: { x: 0, y: 0, z: -20, team: 0, carrying: false, splatted: false },
    enemies: [],
    flag: { x: 0, y: 1.5, z: 0, holder: 'none' },
    base: { x: 0, y: 1.5, z: -24.5 },
    enemyBase: { x: 0, y: 1.5, z: 24.5 },
    hill: null,
    halfWidth: 18,
    halfLength: 32,
    ...overrides,
  };
}

/** Where a stick input walks, the way stepPlayer turns it into a world direction. */
function walkDirection(yaw: number, moveX: number, moveY: number) {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return { x: cos * moveX - sin * moveY, z: -sin * moveX - cos * moveY };
}

describe('bot steering', () => {
  it('faces a target (yaw 0 looks toward −Z)', () => {
    expect(yawToward({ x: 0, z: 0 }, { x: 0, z: -5 })).toBeCloseTo(0, 9);
    expect(Math.abs(yawToward({ x: 0, z: 0 }, { x: 0, z: 5 }))).toBeCloseTo(Math.PI, 9);
  });

  it('walks toward where it wants to go, whichever way it faces', () => {
    for (const yaw of [0, 1, 2.5, -2]) {
      const stick = moveInput(yaw, 3, 4);
      const walk = walkDirection(yaw, stick.moveX, stick.moveY);
      expect(walk.x).toBeCloseTo(0.6, 9);
      expect(walk.z).toBeCloseTo(0.8, 9);
    }
  });
});

describe('bot thinking', () => {
  it('shoots at an enemy in range after a short reaction, and not at one far away', () => {
    const random = createRng(1);
    const near = view({ enemies: [{ x: 3, y: 0, z: -15 }] });
    const mind = createBotMind(random);
    // Not instantly: it takes a moment to react.
    expect(think(near, mind, DT, random).fire).toBe(false);
    let fired = false;
    for (let i = 0; i < 30 && !fired; i++) fired = think(near, mind, DT, random).fire;
    expect(fired).toBe(true);

    const farMind = createBotMind(random);
    const far = view({ enemies: [{ x: 0, y: 0, z: 25 }] });
    for (let i = 0; i < 30; i++) expect(think(far, farMind, DT, random).fire).toBe(false);
  });

  it('aims close to the enemy, but not perfectly', () => {
    const random = createRng(5);
    const mind = createBotMind(random);
    const enemy = { x: 0, y: 0, z: -30 };
    const exact = yawToward({ x: 0, z: -20 }, enemy);
    const errors = new Set<number>();
    for (let i = 0; i < 90; i++) {
      const input = think(view({ enemies: [enemy] }), mind, DT, random);
      const error = Math.abs(input.aimYaw - exact);
      expect(error).toBeLessThan(0.07);
      errors.add(Math.round(error * 1e4));
    }
    // The wobble changes over time (it's not one fixed offset).
    expect(errors.size).toBeGreaterThan(1);
  });

  it('runs the flag to the enemy base, and never swims while carrying it', () => {
    const random = createRng(2);
    const mind = createBotMind(random);
    const v = view({ me: { x: 0, y: 1.5, z: 0, team: 0, carrying: true, splatted: false } });
    for (let i = 0; i < 300; i++) {
      const input = think(v, mind, DT, random);
      expect(input.swim).toBe(false);
      const walk = walkDirection(input.aimYaw, input.moveX - mind.strafe, input.moveY);
      // The enemy base is toward +Z.
      expect(walk.z).toBeGreaterThan(0);
    }
  });

  it('falls back to defend its own base while an enemy has the flag', () => {
    const random = createRng(4);
    const mind = { ...createBotMind(random), chaser: false };
    const v = view({
      me: { x: 0, y: 0, z: 0, team: 0, carrying: false, splatted: false },
      flag: { x: 5, y: 0, z: 10, holder: 'theirs' },
    });
    for (let i = 0; i < 100; i++) {
      const input = think(v, mind, DT, random);
      const walk = walkDirection(input.aimYaw, input.moveX - mind.strafe, input.moveY);
      // Its own base is toward −Z.
      expect(walk.z).toBeLessThan(0);
    }
  });

  it('heads into the hill in King of the Hill, and stops walking once there', () => {
    const random = createRng(6);
    const mind = createBotMind(random);
    const hill = { x: 0, y: 0, z: 0, radius: 4.5 };
    const far = view({
      hill,
      me: { x: 0, y: 0, z: -20, team: 0, carrying: false, splatted: false },
    });
    const input = think(far, mind, DT, random);
    const walk = walkDirection(input.aimYaw, input.moveX - mind.strafe, input.moveY);
    expect(walk.z).toBeGreaterThan(0);

    // Standing on its own spot in the hill: no walking on (only the little strafe shuffle).
    const r = hill.radius * mind.hillSpot.reach;
    const spot = {
      x: Math.cos(mind.hillSpot.angle) * r,
      y: 0,
      z: Math.sin(mind.hillSpot.angle) * r,
    };
    const there = think(
      view({ hill, me: { ...spot, team: 0, carrying: false, splatted: false } }),
      mind,
      DT,
      random,
    );
    expect(there.moveY).toBe(0);
  });

  it('does nothing while splatted', () => {
    const random = createRng(3);
    const v = view({ me: { x: 0, y: 0, z: -20, team: 0, carrying: false, splatted: true } });
    const input = think(v, createBotMind(random), DT, random);
    expect(input.moveX).toBe(0);
    expect(input.moveY).toBe(0);
    expect(input.fire).toBe(false);
  });
});
