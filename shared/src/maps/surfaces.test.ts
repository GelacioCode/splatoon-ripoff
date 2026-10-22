import { describe, expect, it } from 'vitest';
import { cross, dot, type Vec3 } from '../math3d';
import { blockFaces, buildSurfaces, FACE_TOP } from './surfaces';
import type { BlockDef } from './types';

function block(kind: BlockDef['kind'], rotationX = 0): BlockDef {
  return {
    kind,
    center: { x: 0, y: 0, z: 0 },
    size: { x: 2, y: 2, z: 2 },
    rotation: { x: rotationX, y: 0, z: 0 },
    paintable: true,
  };
}

function expectVec(actual: Vec3, x: number, y: number, z: number): void {
  expect(actual.x).toBeCloseTo(x, 9);
  expect(actual.y).toBeCloseTo(y, 9);
  expect(actual.z).toBeCloseTo(z, 9);
}

describe('blockFaces', () => {
  it('describes the top face of an unrotated block', () => {
    const top = blockFaces(block('block'), 0)[FACE_TOP];
    expectVec(top.normal, 0, 1, 0);
    expectVec(top.origin, -1, 1, 1);
    expect(top.width).toBeCloseTo(2, 9);
    expect(top.height).toBeCloseTo(2, 9);
  });

  it('keeps every face axis unit length with u × v pointing outward, even when tilted', () => {
    for (const face of blockFaces(block('ramp', 0.4), 0)) {
      expect(dot(face.uAxis, face.uAxis)).toBeCloseTo(1, 9);
      expect(dot(face.vAxis, face.vAxis)).toBeCloseTo(1, 9);
      const n = cross(face.uAxis, face.vAxis);
      expectVec(n, face.normal.x, face.normal.y, face.normal.z);
    }
  });
});

describe('buildSurfaces', () => {
  it('skips block bottoms and keeps only the top of the floor', () => {
    const surfaces = buildSurfaces([block('floor'), block('block')]);
    expect(surfaces).toHaveLength(1 + 5);
    expect(surfaces.map((s) => s.id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(surfaces[0].face).toBe(FACE_TOP);
  });
});
