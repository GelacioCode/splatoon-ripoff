import { describe, expect, it } from 'vitest';
import { clamp, damp, dampAngle, lerp, wrapAngle } from './math';

describe('clamp', () => {
  it('keeps values inside the range', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  it('blends between the endpoints', () => {
    expect(lerp(2, 4, 0)).toBe(2);
    expect(lerp(2, 4, 0.5)).toBe(3);
    expect(lerp(2, 4, 1)).toBe(4);
  });
});

describe('damp', () => {
  it('gives the same result at 30 fps and 60 fps', () => {
    const oneBigStep = damp(0, 10, 8, 1 / 30);
    const twoSmallSteps = damp(damp(0, 10, 8, 1 / 60), 10, 8, 1 / 60);
    expect(twoSmallSteps).toBeCloseTo(oneBigStep, 10);
  });

  it('stays put when no time passes and settles on the target over time', () => {
    expect(damp(3, 10, 8, 0)).toBe(3);
    expect(damp(3, 10, 8, 5)).toBeCloseTo(10, 6);
  });
});

describe('wrapAngle', () => {
  it('folds any angle into −π…π', () => {
    expect(wrapAngle(Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2, 10);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2, 10);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5, 10);
  });
});

describe('dampAngle', () => {
  it('turns the short way across the ±π seam', () => {
    // From 3.0 to −3.0 rad is only 0.28 rad when going past π, not 6 rad backwards.
    const next = dampAngle(3, -3, 1000, 1);
    expect(next).toBeGreaterThan(3);
    expect(wrapAngle(next)).toBeCloseTo(-3, 6);
  });
});
