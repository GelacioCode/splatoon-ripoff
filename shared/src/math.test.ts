import { describe, expect, it } from 'vitest';
import { clamp, damp, lerp } from './math';

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
