import type { BlockDef } from '../maps/types';

/** Test helper: an axis-aligned paintable box. */
export function testBox(
  kind: BlockDef['kind'],
  [cx, cy, cz]: number[],
  [sx, sy, sz]: number[],
): BlockDef {
  return {
    kind,
    center: { x: cx, y: cy, z: cz },
    size: { x: sx, y: sy, z: sz },
    rotation: { x: 0, y: 0, z: 0 },
    paintable: true,
  };
}

/** A 20 × 20 m floor (top at y = 0) with a 4 m wide, 3 m tall wall whose front face is at z = 4.5. */
export const TEST_BLOCKS: BlockDef[] = [
  testBox('floor', [0, -0.5, 0], [20, 1, 20]),
  testBox('wall', [0, 1.5, 5], [4, 3, 1]),
];
