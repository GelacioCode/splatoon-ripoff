import { describe, expect, it } from 'vitest';
import { joystickVector, lookDelta } from './touchMath';

describe('joystickVector', () => {
  it('ignores tiny movements inside the dead zone', () => {
    expect(joystickVector(5, 0, 60)).toEqual({ x: 0, y: 0 });
  });

  it('points forward when the thumb pushes up, at full strength past the edge', () => {
    const v = joystickVector(0, -120, 60);
    expect(v.x).toBeCloseTo(0, 9);
    expect(v.y).toBeCloseTo(1, 9);
  });

  it('grows smoothly from zero right after the dead zone', () => {
    const halfway = joystickVector(33, 0, 60);
    expect(halfway.x).toBeGreaterThan(0.4);
    expect(halfway.x).toBeLessThan(0.6);
  });
});

describe('lookDelta', () => {
  it('scales drags and can flip the vertical direction', () => {
    expect(lookDelta(10, 4, 0.5, false)).toEqual({ x: 5, y: 2 });
    expect(lookDelta(10, 4, 0.5, true)).toEqual({ x: 5, y: -2 });
  });
});
