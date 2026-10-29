import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { DEFAULT_LOOK, LOOK_OPTIONS, LOOK_PARTS, parseLook, randomLook } from './look';

describe('looks', () => {
  it('keep valid choices', () => {
    const look = { eyes: 3, hat: 4, goggles: 2, shoes: 1, body: 2 };
    expect(parseLook(look)).toEqual(look);
  });

  it('keep the newest options (the last of each part)', () => {
    const last = { eyes: 7, hat: 9, goggles: 5, shoes: 6, body: 5 };
    expect(parseLook(last)).toEqual(last);
    for (const part of LOOK_PARTS) expect(last[part]).toBe(LOOK_OPTIONS[part].length - 1);
  });

  it('replace anything invalid with the default, part by part', () => {
    expect(parseLook({ eyes: 9, hat: -1, goggles: 1.5, shoes: '2', body: 1 })).toEqual({
      ...DEFAULT_LOOK,
      body: 1,
    });
    expect(parseLook(null)).toEqual(DEFAULT_LOOK);
    expect(parseLook('crown')).toEqual(DEFAULT_LOOK);
  });

  it('roll random looks that are always valid', () => {
    const random = createRng(5);
    for (let i = 0; i < 50; i++) {
      const look = randomLook(random);
      expect(parseLook(look)).toEqual(look);
      for (const part of LOOK_PARTS) expect(look[part]).toBeLessThan(LOOK_OPTIONS[part].length);
    }
  });
});
