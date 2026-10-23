/** One team's look within a color pair. */
export interface TeamLook {
  name: string;
  /** Paint and body color (0xRRGGBB). */
  color: number;
}

/** A pair of team colors the host can pick in the lobby (team 0's first). */
export interface TeamPalette {
  name: string;
  teams: readonly [TeamLook, TeamLook];
}

/**
 * The color pairs (user decision: preset pairs). Index = MatchState.teamColors. The paint
 * grid and the paint texture store the team *number*, so switching pairs recolors
 * everything without repainting.
 */
export const TEAM_PALETTES: readonly TeamPalette[] = [
  {
    name: 'Pink vs Cyan',
    teams: [
      { name: 'Pink', color: 0xfd3fb4 },
      { name: 'Cyan', color: 0x22d3ee },
    ],
  },
  {
    // The user's CGI brand colors.
    name: 'Red vs Violet',
    teams: [
      { name: 'Red', color: 0xe31937 },
      { name: 'Violet', color: 0x5236ab },
    ],
  },
];

export function isTeamPalette(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < TEAM_PALETTES.length
  );
}

/** The pair at `index` (the first pair for anything unknown). */
export function teamPaletteAt(index: number): TeamPalette {
  return TEAM_PALETTES[isTeamPalette(index) ? index : 0] ?? TEAM_PALETTES[0];
}
