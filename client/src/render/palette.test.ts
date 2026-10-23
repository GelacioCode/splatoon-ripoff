import { afterEach, describe, expect, it } from 'vitest';
import {
  luminance,
  setTeamPalette,
  TEAM_COLORS,
  teamName,
  teamPaletteVersion,
  teamTextColor,
  textOnTeam,
} from './palette';

afterEach(() => {
  setTeamPalette(0);
});

describe('team palette', () => {
  it('starts as Pink vs Cyan', () => {
    expect(TEAM_COLORS).toEqual([0xfd3fb4, 0x22d3ee]);
    expect([teamName(0), teamName(1)]).toEqual(['Pink', 'Cyan']);
  });

  it('switches to Red vs Violet in place, and says when it changed', () => {
    const before = teamPaletteVersion();
    expect(setTeamPalette(1)).toBe(true);
    expect(TEAM_COLORS).toEqual([0xe31937, 0x5236ab]);
    expect([teamName(0), teamName(1)]).toEqual(['Red', 'Violet']);
    expect(teamPaletteVersion()).toBe(before + 1);
    // The same pair again changes nothing; an unknown one means the first pair.
    expect(setTeamPalette(1)).toBe(false);
    expect(setTeamPalette(42)).toBe(true);
    expect(TEAM_COLORS[0]).toBe(0xfd3fb4);
  });

  it('keeps team text readable: dark violet is lifted, the rest stay as they are', () => {
    setTeamPalette(1);
    expect(teamTextColor(0)).toBe(0xe31937);
    expect(teamTextColor(1)).not.toBe(0x5236ab);
    expect(luminance(teamTextColor(1))).toBeGreaterThan(luminance(0x5236ab));
    // White text on red and violet, ink on pink and cyan.
    expect([textOnTeam(0), textOnTeam(1)]).toEqual(['#ffffff', '#ffffff']);
    setTeamPalette(0);
    expect([textOnTeam(0), textOnTeam(1)]).toEqual(['#1d1135', '#1d1135']);
  });
});
