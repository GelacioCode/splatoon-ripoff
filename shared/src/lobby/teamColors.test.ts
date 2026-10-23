import { describe, expect, it } from 'vitest';
import { isTeamPalette, TEAM_PALETTES, teamPaletteAt } from './teamColors';

describe('team color pairs', () => {
  it('offers Pink vs Cyan first, and the CGI Red vs Violet', () => {
    expect(teamPaletteAt(0).teams.map((t) => t.name)).toEqual(['Pink', 'Cyan']);
    expect(teamPaletteAt(1).teams.map((t) => t.color)).toEqual([0xe31937, 0x5236ab]);
  });

  it('falls back to the first pair for anything unknown', () => {
    expect(teamPaletteAt(99)).toBe(TEAM_PALETTES[0]);
    expect(teamPaletteAt(-1)).toBe(TEAM_PALETTES[0]);
    expect(isTeamPalette(1)).toBe(true);
    expect(isTeamPalette(1.5)).toBe(false);
    expect(isTeamPalette('1')).toBe(false);
  });

  it('gives the two teams of every pair clearly different colors and names', () => {
    for (const palette of TEAM_PALETTES) {
      const [a, b] = palette.teams;
      expect(a.name).not.toBe(b.name);
      const channels = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
      const ca = channels(a.color);
      const cb = channels(b.color);
      const distance = Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]);
      expect(distance).toBeGreaterThan(100);
    }
  });
});
