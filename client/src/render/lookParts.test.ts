import { MeshBasicMaterial, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, LOOK_OPTIONS, LOOK_PARTS } from '@paint-rush/shared';
import { BlobCharacter } from './BlobCharacter';
import { BODY_SHAPES, EYE_PARTS, GOGGLE_PARTS, HAT_PARTS, SHOE_PARTS } from './lookParts';
import { createToonRamp } from './toon';

describe('look parts', () => {
  it('have a shape for every option, in the same order as LOOK_OPTIONS', () => {
    expect(EYE_PARTS).toHaveLength(LOOK_OPTIONS.eyes.length);
    expect(HAT_PARTS).toHaveLength(LOOK_OPTIONS.hat.length);
    expect(GOGGLE_PARTS).toHaveLength(LOOK_OPTIONS.goggles.length);
    expect(SHOE_PARTS).toHaveLength(LOOK_OPTIONS.shoes.length);
    expect(BODY_SHAPES).toHaveLength(LOOK_OPTIONS.body.length);
  });

  it('build real meshes, except "None" for hats and goggles', () => {
    const material = new MeshBasicMaterial();
    const m = { skin: material, ink: material, white: material, toonRamp: createToonRamp() };
    for (const build of [...EYE_PARTS, ...SHOE_PARTS]) expect(build(m)).toBeInstanceOf(Object3D);
    for (const parts of [HAT_PARTS, GOGGLE_PARTS]) {
      expect(parts[0](m)).toBeNull();
      for (const build of parts.slice(1)) expect(build(m)).toBeInstanceOf(Object3D);
    }
  });

  it('can be worn in any combination', () => {
    const character = new BlobCharacter(0xff00ff, createToonRamp());
    for (const part of LOOK_PARTS) {
      for (let option = 0; option < LOOK_OPTIONS[part].length; option++) {
        expect(() => character.setLook({ ...DEFAULT_LOOK, [part]: option })).not.toThrow();
      }
    }
  });
});
