import { describe, expect, it } from 'vitest';
import { createRng, seedFromString } from './rng';

describe('createRng', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it('gives different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const same = Array.from({ length: 10 }, () => a() === b()).every(Boolean);
    expect(same).toBe(false);
  });

  it('stays within 0 (inclusive) to 1 (exclusive)', () => {
    const next = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('seedFromString', () => {
  it('gives the same seed for the same text and different seeds for different text', () => {
    expect(seedFromString('aB3dE')).toBe(seedFromString('aB3dE'));
    expect(seedFromString('aB3dE')).not.toBe(seedFromString('aB3dF'));
    expect(Number.isInteger(seedFromString('x'))).toBe(true);
    expect(seedFromString('x')).toBeGreaterThanOrEqual(0);
  });
});
