import { describe, expect, it } from 'vitest';
import { CONFIG } from '@paint-rush/shared';
import { BOMB_SLOT, createInput, PRIMARY_SLOT } from '@paint-rush/shared/sim';
import { createBombHabit, lobPitch, useBombs } from './botBombs';

const always = () => 0;
const me = { x: 0, y: 0, z: 0, bombs: 2 };

describe('bot bombs', () => {
  it('take out a bomb, lob it at a mid-range enemy, then let go of the trigger', () => {
    const habit = createBombHabit();
    const enemy = { x: 0, y: 0, z: -8 };
    const take = createInput();
    // With a sure dice roll and a big enough tick, it decides to throw.
    useBombs(take, me, [enemy], [], habit, always, 1);
    expect(take).toMatchObject({ slot: BOMB_SLOT, fire: false });
    const toss = createInput();
    useBombs(toss, me, [enemy], [], habit, always, 1);
    expect(toss).toMatchObject({ slot: BOMB_SLOT, fire: true });
    expect(toss.aimYaw).toBeCloseTo(0, 6);
    const after = createInput();
    after.fire = true;
    useBombs(after, me, [enemy], [], habit, always, 1);
    expect(after).toMatchObject({ slot: PRIMARY_SLOT, fire: false });
  });

  it("don't throw point-blank, and walk to a crate when out of bombs and nobody's around", () => {
    const close = createInput();
    useBombs(close, me, [{ x: 0, y: 0, z: -2 }], [], createBombHabit(), always, 1);
    expect(close.slot).toBe(PRIMARY_SLOT);
    const shopping = createInput();
    const crate = { x: 10, y: 0, z: 0 };
    useBombs(shopping, { ...me, bombs: 0 }, [], [crate], createBombHabit(), always, 1);
    expect(shopping.moveY).toBe(1);
    // Facing +X (yaw −π/2).
    expect(shopping.aimYaw).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('aim lobs that land at the distance asked', () => {
    const b = CONFIG.bomb;
    for (const distance of [5, 8, 11]) {
      const angle = lobPitch(distance) + b.throwLift;
      const range = (b.throwSpeed ** 2 * Math.sin(2 * angle)) / b.gravity;
      expect(range).toBeCloseTo(distance, 6);
    }
  });
});
