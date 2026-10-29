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

  it('remembers the name and look, repairing a damaged look', () => {
    const look = { eyes: 2, hat: 3, goggles: 1, shoes: 2, body: 1 };
    const settings = parseSettings(JSON.stringify({ name: 'Sam', look }));
    expect(settings.name).toBe('Sam');
    expect(settings.look).toEqual(look);
    const damaged = parseSettings(JSON.stringify({ look: { ...look, hat: 99 } }));
    expect(damaged.look).toEqual({ ...look, hat: DEFAULT_SETTINGS.look.hat });
  });

  it('remembers the controls choice, falling back to auto for an unknown one', () => {
    expect(parseSettings(JSON.stringify({ controls: 'touch' })).controls).toBe('touch');
    expect(parseSettings(JSON.stringify({ controls: 'joystick' })).controls).toBe('auto');
  });

  it('keeps an older save’s volume as the master, with the new volumes at their defaults', () => {
    const settings = parseSettings(JSON.stringify({ volume: 0.4 }));
    expect(settings.volume).toBe(0.4);
    expect(settings.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    expect(settings.effectsVolume).toBe(DEFAULT_SETTINGS.effectsVolume);
    expect(settings.announcerVolume).toBe(DEFAULT_SETTINGS.announcerVolume);
    expect(parseSettings(JSON.stringify({ musicVolume: 3 })).musicVolume).toBe(1);
  });

  it('remembers the chosen role, falling back to assault for an unknown one', () => {
    expect(parseSettings(JSON.stringify({ weapon: 2 })).weapon).toBe(2);
    expect(parseSettings(JSON.stringify({ weapon: 9 })).weapon).toBe(DEFAULT_SETTINGS.weapon);
  });
});
