import { DataTexture, NearestFilter, RedFormat } from 'three';

/** Three-step lighting ramp that gives MeshToonMaterial its chunky cel-shaded bands. */
export function createToonRamp(): DataTexture {
  const ramp = new DataTexture(new Uint8Array([80, 170, 255]), 3, 1, RedFormat);
  ramp.minFilter = NearestFilter;
  ramp.magFilter = NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}
