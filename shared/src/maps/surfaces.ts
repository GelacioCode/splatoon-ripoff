import { quatFromEuler, rotate, type Vec3 } from '../math3d';
import type { BlockDef } from './types';

/** One flat rectangular face of a block: what the renderer draws and where paint lands. */
export interface Surface {
  id: number;
  blockIndex: number;
  /** Which face, in the block's own axes: 0 +X, 1 −X, 2 +Y (top), 3 −Y, 4 +Z, 5 −Z. */
  face: number;
  paintable: boolean;
  /** World position of the corner where u = 0 and v = 0. */
  origin: Vec3;
  /** Unit direction along the face's width. */
  uAxis: Vec3;
  /** Unit direction along the face's height. */
  vAxis: Vec3;
  /** Outward unit normal (equal to uAxis × vAxis). */
  normal: Vec3;
  /** Length along uAxis (m). */
  width: number;
  /** Length along vAxis (m). */
  height: number;
}

export type BlockFace = Omit<Surface, 'id' | 'paintable'>;

export const FACE_TOP = 2;
export const FACE_BOTTOM = 3;

/** Each face's normal and u/v axes in the block's own frame, chosen so that u × v = normal. */
const FACES: { normal: Vec3; u: Vec3; v: Vec3 }[] = [
  { normal: { x: 1, y: 0, z: 0 }, u: { x: 0, y: 0, z: -1 }, v: { x: 0, y: 1, z: 0 } },
  { normal: { x: -1, y: 0, z: 0 }, u: { x: 0, y: 0, z: 1 }, v: { x: 0, y: 1, z: 0 } },
  { normal: { x: 0, y: 1, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: -1 } },
  { normal: { x: 0, y: -1, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 } },
  { normal: { x: 0, y: 0, z: 1 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 } },
  { normal: { x: 0, y: 0, z: -1 }, u: { x: -1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 } },
];

/** Half the box's extent along one of its own axes. */
function halfExtent(axis: Vec3, half: Vec3): number {
  return Math.abs(axis.x) * half.x + Math.abs(axis.y) * half.y + Math.abs(axis.z) * half.z;
}

/** All six faces of a block, in world space. */
export function blockFaces(block: BlockDef, blockIndex: number): BlockFace[] {
  const half = { x: block.size.x / 2, y: block.size.y / 2, z: block.size.z / 2 };
  const q = quatFromEuler(block.rotation.x, block.rotation.y, block.rotation.z);
  return FACES.map(({ normal, u, v }, face) => {
    const depth = halfExtent(normal, half);
    const halfWidth = halfExtent(u, half);
    const halfHeight = halfExtent(v, half);
    const corner = rotate(
      {
        x: normal.x * depth - u.x * halfWidth - v.x * halfHeight,
        y: normal.y * depth - u.y * halfWidth - v.y * halfHeight,
        z: normal.z * depth - u.z * halfWidth - v.z * halfHeight,
      },
      q,
    );
    return {
      blockIndex,
      face,
      origin: {
        x: block.center.x + corner.x,
        y: block.center.y + corner.y,
        z: block.center.z + corner.z,
      },
      uAxis: rotate(u, q),
      vAxis: rotate(v, q),
      normal: rotate(normal, q),
      width: halfWidth * 2,
      height: halfHeight * 2,
    };
  });
}

/**
 * The faces players can see: everything except block bottoms, and only the top of the floor.
 * Faces of paintable blocks can be painted.
 */
export function buildSurfaces(blocks: BlockDef[]): Surface[] {
  const surfaces: Surface[] = [];
  blocks.forEach((block, blockIndex) => {
    for (const face of blockFaces(block, blockIndex)) {
      if (face.face === FACE_BOTTOM) continue;
      if (block.kind === 'floor' && face.face !== FACE_TOP) continue;
      surfaces.push({ ...face, id: surfaces.length, paintable: block.paintable });
    }
  });
  return surfaces;
}
