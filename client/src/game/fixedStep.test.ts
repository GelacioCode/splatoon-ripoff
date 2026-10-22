import { describe, expect, it } from 'vitest';
import { FixedStep } from './fixedStep';

describe('FixedStep', () => {
  it('runs one step for each step-length of elapsed time', () => {
    const loop = new FixedStep(1 / 30);
    expect(loop.advance(1 / 30)).toBe(1);
    expect(loop.advance(1 / 60)).toBe(0);
    expect(loop.advance(1 / 60)).toBe(1);
  });

  it('reports how far it is between two steps', () => {
    const loop = new FixedStep(0.1);
    expect(loop.advance(0.05)).toBe(0);
    expect(loop.alpha).toBeCloseTo(0.5, 9);
  });

  it('caps long frames so a stalled tab cannot cause a huge catch-up burst', () => {
    const loop = new FixedStep(0.1, 0.25);
    expect(loop.advance(5)).toBe(2);
    expect(loop.alpha).toBeCloseTo(0.5, 9);
  });
});
