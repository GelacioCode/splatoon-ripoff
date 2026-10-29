import type { Vec3 } from '../math3d';
import type { PropInfo } from './props';

export type BlockKind = 'floor' | 'block' | 'wall' | 'ramp' | 'boundary';

/** One solid box. Every map is built from these. */
export interface BlockDef {
  kind: BlockKind;
  /** Center of the box (m). */
  center: Vec3;
  /** Full size of the box along its own axes (m). */
  size: Vec3;
  /** Euler rotation in radians, XYZ order. Only ramps are rotated. */
  rotation: Vec3;
  /** Whether paint sticks to it. Boundary walls stay clean so nobody can climb out. */
  paintable: boolean;
  /** A theme's object (a stump, a desk…): drawn as that object instead of a plain box. */
  prop?: PropInfo;
}

/** A box-shaped area, such as a team's base. */
export interface ZoneDef {
  center: Vec3;
  size: Vec3;
}

export interface MapDef {
  name: string;
  /** Inner edges of the playable area (m). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  blocks: BlockDef[];
  /** Feet positions where each team's players appear. Team 0 plays from −Z, team 1 from +Z. */
  spawns: [Vec3[], Vec3[]];
  /** Where each team brings the flag to score. */
  bases: [ZoneDef, ZoneDef];
  /** Where the neutral flag appears. */
  flagSpawn: Vec3;
}
