import type { BlockKind } from '@paint-rush/shared';

/** Paint color of each team: 0 = pink, 1 = cyan. */
export const TEAM_COLORS = [0xfd3fb4, 0x22d3ee];

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
