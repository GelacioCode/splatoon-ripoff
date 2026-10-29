import type { BlockKind, MapTheme } from '@paint-rush/shared';
import { BLOCK_COLORS, HEMISPHERE_GROUND_COLOR, SKY_COLOR } from './palette';

/** Ground patterns the map shader can draw on bare surfaces (see mapMesh). */
export const PATTERN = { grid: 0, grass: 1, sand: 2, carpet: 3 } as const;

/** How one map theme looks: colors, light, sky and the bare-ground pattern. */
export interface ThemeLook {
  sky: number;
  /** Distant scenery fades into this (null: no fog, like the original yard). */
  fog: { color: number; near: number; far: number } | null;
  sunColor: number;
  /** The hemisphere light's ground color (bounce light from below). */
  groundLight: number;
  /** Base color of each kind of map block, before any paint. */
  blocks: Record<BlockKind, number>;
  /** One of PATTERN. */
  pattern: number;
  /** The ground outside the arena, under the scenery (null: none, open sky below). */
  outerGround: number | null;
}

/**
 * Every theme keeps the bare arena light and fairly soft in color, so both teams' paint
 * (pink, cyan, red, violet) stands out on it.
 */
export const THEME_LOOKS: Record<MapTheme, ThemeLook> = {
  // The original look: lavender blocks under a clear blue sky.
  yard: {
    sky: SKY_COLOR,
    fog: null,
    sunColor: 0xffffff,
    groundLight: HEMISPHERE_GROUND_COLOR,
    blocks: BLOCK_COLORS,
    pattern: PATTERN.grid,
    outerGround: null,
  },
  // A sunny clearing: grass, mossy stone cover, wooden ramps, log walls.
  forest: {
    sky: 0xbdeedd,
    fog: { color: 0xbdeedd, near: 55, far: 150 },
    sunColor: 0xfff6dc,
    groundLight: 0x5f8a45,
    blocks: {
      floor: 0xb4e08c,
      block: 0xd9d4c3,
      wall: 0xcdbf9f,
      ramp: 0xd3ad7c,
      boundary: 0x6b4f35,
    },
    pattern: PATTERN.grass,
    outerGround: 0x8fcf62,
  },
  // Warm sand, sandstone cover and mesas under a peach sky.
  desert: {
    sky: 0xffd8a8,
    fog: { color: 0xffdcb0, near: 60, far: 170 },
    sunColor: 0xfff0d2,
    groundLight: 0xc78a5c,
    blocks: {
      floor: 0xf6dcaa,
      block: 0xefc28f,
      wall: 0xe4ac7a,
      ramp: 0xf3cf9a,
      boundary: 0xa9663f,
    },
    pattern: PATTERN.sand,
    outerGround: 0xf0cf92,
  },
  // A big open-plan office: carpet tiles, desk-white cover, cubicle-grey walls.
  office: {
    sky: 0xd6e8f5,
    fog: { color: 0xd6e8f5, near: 70, far: 190 },
    sunColor: 0xffffff,
    groundLight: 0x8e93ad,
    blocks: {
      floor: 0xc3c8d8,
      block: 0xf6f3ec,
      wall: 0xdfe3ea,
      ramp: 0xd8c3a2,
      boundary: 0x5f6680,
    },
    pattern: PATTERN.carpet,
    outerGround: 0xb5bbcc,
  },
};
