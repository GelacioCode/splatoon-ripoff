import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from './settings';

describe('parseSettings', () => {
  it('uses the defaults when nothing is saved or the data is corrupted', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid saved values and repairs invalid ones', () => {
    const settings = parseSettings(
      JSON.stringify({ mouseSensitivity: 2, quality: 'ultra', volume: 7, invertY: true }),
    );
    expect(settings.mouseSensitivity).toBe(2);
    expect(settings.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(settings.volume).toBe(1);
    expect(settings.invertY).toBe(true);
  });
});
