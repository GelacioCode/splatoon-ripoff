import { isTeamPalette, teamPaletteAt, type BlockKind } from '@paint-rush/shared';

/**
 * Paint color of each team (team 0 first), from the lobby's color pair (see setTeamPalette).
 * Changed in place, so code that reads it when drawing always gets the current pair.
 */
export const TEAM_COLORS: number[] = teamPaletteAt(0).teams.map((t) => t.color);

let activePalette = 0;
let paletteVersion = 0;

/**
 * Switches to the color pair at `index` (TEAM_PALETTES). Returns true if it changed, so the
 * caller can recolor whatever doesn't read TEAM_COLORS every frame.
 */
export function setTeamPalette(index: number): boolean {
  const safe = isTeamPalette(index) ? index : 0;
  const palette = teamPaletteAt(safe);
  if (safe === activePalette && TEAM_COLORS[0] === palette.teams[0].color) return false;
  activePalette = safe;
  TEAM_COLORS[0] = palette.teams[0].color;
  TEAM_COLORS[1] = palette.teams[1].color;
  paletteVersion++;
  return true;
}

/** Goes up every time the colors change (for things that cache them). */
export function teamPaletteVersion(): number {
  return paletteVersion;
}

/** "Pink", "Cyan", "Red" or "Violet". */
export function teamName(team: number): string {
  return teamPaletteAt(activePalette).teams[team === 1 ? 1 : 0].name;
}

/** How bright a color looks (relative luminance, 0 black … 1 white). */
export function luminance(hex: number): number {
  const channel = (shift: number) => {
    const c = ((hex >> shift) & 255) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/**
 * A team's color for text and outlines over the dark game and HUD: very dark team colors
 * (violet) are lifted toward white so names stay readable.
 */
export function teamTextColor(team: number): number {
  const hex = TEAM_COLORS[team === 1 ? 1 : 0];
  if (luminance(hex) >= 0.12) return hex;
  const lift = (shift: number) => {
    const value = (hex >> shift) & 255;
    return Math.round(value + (255 - value) * 0.45) << shift;
  };
  return lift(16) | lift(8) | lift(0);
}

/** Ink or white: whichever reads better on top of a team-colored background (CSS). */
export function textOnTeam(team: number): string {
  return luminance(TEAM_COLORS[team === 1 ? 1 : 0]) >= 0.19 ? '#1d1135' : '#ffffff';
}

export const SKY_COLOR = 0x9ad8ff;
export const HEMISPHERE_GROUND_COLOR = 0x8a7cc4;
export const OUTLINE_COLOR = 0x1d1135;

/** Direction toward the sun (not normalized). Shared by the map shader and the scene lights. */
export const SUN_DIRECTION: [number, number, number] = [0.45, 0.8, 0.35];

/** Base color of each kind of map block, before any paint. */
export const BLOCK_COLORS: Record<BlockKind, number> = {
  floor: 0xebe7f5,
  block: 0xf7f5ff,
  wall: 0xdcd5ef,
  ramp: 0xeeeaf9,
  boundary: 0x6a6188,
};
