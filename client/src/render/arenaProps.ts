import {
  BoxGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  SphereGeometry,
  type DataTexture,
} from 'three';
import type { MapDef, PropKind } from '@paint-rush/shared';
import { addProps, Materials, type Part, type Placement } from './scenery';

// The theme's objects standing in the arena (see THEME_PROPS in shared/src/maps/props.ts).
// Each is a solid box in the game; here it's drawn as the object, built to fill that box
// (PROP_SIZES, feet at y = 0, x across and z deep before turning). Instanced per kind.

const WOOD = 0x9a6b45;
const BARK = 0x8b5a3c;
const CACTUS = 0x5aa84f;
const LEAVES = 0x4fb35a;
const LEAVES_LIGHT = 0x66c76c;
const PANEL = 0xb8bfcc;
const DARK = 0x2b2f3f;

const DESIGNS: Record<PropKind, () => Part[]> = {
  stump: () => [
    { geometry: new CylinderGeometry(0.56, 0.6, 0.8, 12), color: WOOD, at: [0, 0.4, 0] },
    {
      geometry: new CylinderGeometry(0.48, 0.48, 0.02, 12),
      color: 0xe8c48f,
      at: [0, 0.81, 0],
      outline: false,
    },
  ],
  boulder: () => [
    {
      geometry: new DodecahedronGeometry(0.8),
      color: 0xb1adc0,
      at: [0, 0.62, 0],
      scale: [1.1, 0.8, 0.92],
    },
    {
      geometry: new SphereGeometry(0.5, 10, 6),
      color: 0x6fbf5a,
      at: [0.1, 1.12, 0],
      scale: [1.2, 0.32, 1],
    },
  ],
  logPile: () => {
    const log = new CylinderGeometry(0.3, 0.3, 2.5, 10);
    const lying: [number, number, number] = [0, 0, Math.PI / 2];
    return [
      { geometry: log, color: WOOD, at: [0, 0.3, -0.32], rotation: lying },
      { geometry: log, color: WOOD, at: [0, 0.3, 0.32], rotation: lying },
      { geometry: log, color: 0xa87a52, at: [0, 0.82, 0], rotation: lying },
    ];
  },
  bigTree: () => [
    { geometry: new CylinderGeometry(0.4, 0.5, 3.4, 10), color: BARK, at: [0, 1.7, 0] },
    // Leaves high overhead (no collision up there).
    { geometry: new SphereGeometry(2, 12, 9), color: LEAVES, at: [0, 4.7, 0] },
    { geometry: new SphereGeometry(1.4, 10, 8), color: LEAVES_LIGHT, at: [0.9, 5.7, 0.4] },
    { geometry: new SphereGeometry(1.2, 10, 8), color: 0x5cb862, at: [-1, 5.3, -0.5] },
  ],
  barrel: () => {
    const band = new CylinderGeometry(0.465, 0.465, 0.07, 14);
    return [
      { geometry: new CylinderGeometry(0.45, 0.45, 1.2, 14), color: 0xc0623a, at: [0, 0.6, 0] },
      { geometry: band, color: 0x5d4037, at: [0, 0.25, 0], outline: false },
      { geometry: band, color: 0x5d4037, at: [0, 0.95, 0], outline: false },
    ];
  },
  crate: () => {
    // A box with a diagonal plank across each side.
    const plank = new BoxGeometry(1.72, 0.14, 0.05);
    const brace = (at: [number, number, number], yaw: number): Part => ({
      geometry: plank,
      color: 0x9c6f3c,
      at,
      rotation: [0, yaw, Math.PI / 4],
      outline: false,
    });
    return [
      { geometry: new BoxGeometry(1.3, 1.3, 1.3), color: 0xc99a5b, at: [0, 0.65, 0] },
      brace([0, 0.65, -0.66], 0),
      brace([0, 0.65, 0.66], 0),
      brace([-0.66, 0.65, 0], Math.PI / 2),
      brace([0.66, 0.65, 0], Math.PI / 2),
    ];
  },
  cactus: () => {
    const sideways: [number, number, number] = [0, 0, Math.PI / 2];
    return [
      { geometry: new CylinderGeometry(0.36, 0.4, 2.2, 10), color: CACTUS, at: [0, 1.1, 0] },
      { geometry: new SphereGeometry(0.36, 10, 8), color: CACTUS, at: [0, 2.2, 0] },
      {
        geometry: new CylinderGeometry(0.17, 0.17, 0.45, 8),
        color: CACTUS,
        at: [-0.45, 1.2, 0],
        rotation: sideways,
      },
      { geometry: new CylinderGeometry(0.18, 0.18, 0.7, 8), color: CACTUS, at: [-0.62, 1.5, 0] },
      {
        geometry: new CylinderGeometry(0.16, 0.16, 0.4, 8),
        color: CACTUS,
        at: [0.42, 1.5, 0],
        rotation: sideways,
      },
      { geometry: new CylinderGeometry(0.17, 0.17, 0.6, 8), color: CACTUS, at: [0.58, 1.8, 0] },
    ];
  },
  sandstone: () => [
    { geometry: new BoxGeometry(2.2, 1, 1.7), color: 0xe0a06a, at: [0, 0.5, 0] },
    { geometry: new BoxGeometry(1.8, 0.5, 1.4), color: 0xeab27c, at: [0, 1.25, 0] },
  ],
  desk: () => [
    { geometry: new BoxGeometry(2.2, 0.1, 1.1), color: 0xf4efe6, at: [0, 0.75, 0] },
    { geometry: new BoxGeometry(0.08, 0.7, 1), color: PANEL, at: [-1.05, 0.35, 0] },
    { geometry: new BoxGeometry(0.08, 0.7, 1), color: PANEL, at: [1.05, 0.35, 0] },
    { geometry: new BoxGeometry(2, 0.5, 0.06), color: PANEL, at: [0, 0.45, 0.48] },
    // A laptop on top.
    {
      geometry: new BoxGeometry(0.5, 0.03, 0.35),
      color: DARK,
      at: [0, 0.815, -0.1],
      outline: false,
    },
    {
      geometry: new BoxGeometry(0.5, 0.32, 0.03),
      color: DARK,
      at: [0, 0.97, 0.08],
      rotation: [-0.25, 0, 0],
    },
  ],
  cabinet: () => {
    const drawer = new BoxGeometry(0.66, 0.03, 0.02);
    const line = (y: number): Part => ({
      geometry: drawer,
      color: 0x5f6680,
      at: [0, y, -0.41],
      outline: false,
    });
    return [
      { geometry: new BoxGeometry(0.8, 1.4, 0.8), color: 0x9aa3b8, at: [0, 0.7, 0] },
      line(0.47),
      line(0.93),
    ];
  },
  cooler: () => [
    { geometry: new BoxGeometry(0.6, 1, 0.6), color: 0xf6f3ec, at: [0, 0.5, 0] },
    { geometry: new CylinderGeometry(0.26, 0.26, 0.6, 14), color: 0x8fd6ff, at: [0, 1.3, 0] },
  ],
  plant: () => [
    { geometry: new CylinderGeometry(0.4, 0.32, 0.6, 12), color: 0xf28c28, at: [0, 0.3, 0] },
    { geometry: new SphereGeometry(0.55, 10, 8), color: LEAVES, at: [0, 1.05, 0] },
    { geometry: new SphereGeometry(0.38, 10, 8), color: LEAVES_LIGHT, at: [0.15, 1.4, 0.1] },
  ],
  printer: () => [
    { geometry: new BoxGeometry(1.2, 0.8, 0.9), color: 0xdfe3ea, at: [0, 0.4, 0] },
    { geometry: new BoxGeometry(1, 0.12, 0.7), color: 0x9aa3b8, at: [0, 0.86, 0] },
    {
      geometry: new BoxGeometry(0.5, 0.02, 0.35),
      color: 0xffffff,
      at: [0, 0.93, -0.05],
      outline: false,
    },
  ],
};

/**
 * The theme's objects in `map` (its `prop` blocks), drawn as toon objects with ink outlines.
 * Team 1's copies face the other way, like the rest of their half.
 */
export function createArenaProps(map: MapDef, toonRamp: DataTexture): Group {
  const group = new Group();
  group.name = 'arena-props';
  const byKind = new Map<PropKind, Placement[]>();
  for (const block of map.blocks) {
    if (!block.prop) continue;
    const turn = (block.prop.turned ? Math.PI / 2 : 0) + (block.center.z > 0 ? Math.PI : 0);
    const placement: Placement = {
      x: block.center.x,
      y: block.center.y - block.size.y / 2,
      z: block.center.z,
      yaw: turn,
      size: 1,
    };
    const list = byKind.get(block.prop.kind) ?? [];
    list.push(placement);
    byKind.set(block.prop.kind, list);
  }
  if (byKind.size === 0) return group;
  const materials = new Materials(toonRamp);
  for (const [kind, placements] of byKind) addProps(group, DESIGNS[kind](), placements, materials);
  return group;
}
