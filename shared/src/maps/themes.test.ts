import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { isMapChoice, MAP_THEMES, parseMapChoice, parseMapTheme, pickStageTheme } from './themes';

describe('map themes', () => {
  it('keep a chosen theme for every round', () => {
    const random = createRng(3);
    for (const theme of MAP_THEMES) {
      for (let i = 0; i < 5; i++) expect(pickStageTheme(theme, random, 'yard')).toBe(theme);
    }
  });

  it('pick a different theme every round on random, and use them all', () => {
    const random = createRng(9);
    const seen = new Set<string>();
    let previous = pickStageTheme('random', random);
    for (let i = 0; i < 40; i++) {
      const next = pickStageTheme('random', random, previous);
      expect(MAP_THEMES).toContain(next);
      expect(next).not.toBe(previous);
      seen.add(next);
      previous = next;
    }
    expect(seen.size).toBe(MAP_THEMES.length);
  });

  it('read unknown synced values as Drip Yard', () => {
    expect(parseMapChoice('moon')).toBe('yard');
    expect(parseMapChoice('random')).toBe('random');
    expect(parseMapTheme('random')).toBe('yard');
    expect(parseMapTheme('desert')).toBe('desert');
    expect(isMapChoice('office')).toBe(true);
    expect(isMapChoice(3)).toBe(false);
  });
});
