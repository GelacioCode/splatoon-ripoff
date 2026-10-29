import type { MapTheme } from './themes';

/**
 * Objects that belong to a map theme, standing in the arena as real cover (user decision):
 * each is one solid, unpaintable box you bump into and that stops shots, drawn as the object
 * (a stump, a barrel, a desk…). Paint doesn't stick, so they read as objects, not walls.
 */
export type PropKind =
  | 'stump'
  | 'boulder'
  | 'logPile'
  | 'bigTree'
  | 'barrel'
  | 'crate'
  | 'cactus'
  | 'sandstone'
  | 'desk'
  | 'cabinet'
  | 'cooler'
  | 'plant'
  | 'printer';

/** Which object a block is, and whether it's turned 90° (its x and z sizes swapped). */
export interface PropInfo {
  kind: PropKind;
  turned: boolean;
}

/** Each object's collision box (x, y, z) in m, before turning; its drawing fills the box. */
export const PROP_SIZES: Record<PropKind, [number, number, number]> = {
  stump: [1.2, 0.8, 1.2],
  boulder: [1.8, 1.3, 1.5],
  logPile: [2.6, 1, 1.3],
  // Only the trunk is solid; the leaves sit high overhead.
  bigTree: [1, 3.4, 1],
  barrel: [0.9, 1.2, 0.9],
  crate: [1.3, 1.3, 1.3],
  cactus: [0.8, 2.4, 0.8],
  sandstone: [2.2, 1.5, 1.7],
  desk: [2.2, 0.8, 1.1],
  cabinet: [0.8, 1.4, 0.8],
  cooler: [0.6, 1.6, 0.6],
  plant: [0.9, 1.6, 0.9],
  printer: [1.2, 1, 0.9],
};

/**
 * Each theme's objects (a kind listed twice comes up twice as often) and how many go in one
 * team's half of a normal-size arena (more in bigger ones). Drip Yard has none.
 */
export const THEME_PROPS: Record<MapTheme, { kinds: PropKind[]; perHalf: [number, number] }> = {
  yard: { kinds: [], perHalf: [0, 0] },
  forest: { kinds: ['stump', 'boulder', 'logPile', 'bigTree', 'bigTree'], perHalf: [5, 8] },
  desert: { kinds: ['barrel', 'barrel', 'crate', 'cactus', 'sandstone'], perHalf: [5, 8] },
  office: {
    kinds: ['desk', 'desk', 'cabinet', 'cooler', 'plant', 'printer'],
    perHalf: [6, 9],
  },
};
