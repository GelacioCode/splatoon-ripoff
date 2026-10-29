import {
  BackSide,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type DataTexture,
  type Material,
  type Object3D,
} from 'three';
import { createRng, lerp, type MapDef, type MapTheme } from '@paint-rush/shared';
import { OUTLINE_COLOR } from './palette';
import { THEME_LOOKS } from './themes';

// Low-poly toon scenery around the arena, outside its walls: it never touches gameplay (no
// collision, no paint). Every kind of prop is drawn as instanced meshes, one per part (and
// one for its ink outline), so a whole forest is a couple dozen draw calls.

/** One piece of a prop, placed in the prop's own space (feet at y = 0). */
export interface Part {
  geometry: BufferGeometry;
  color: number;
  at?: [number, number, number];
  scale?: [number, number, number];
  rotation?: [number, number, number];
  /** Draw the chunky ink outline (default yes; off for long, stretched pieces). */
  outline?: boolean;
}

/** Where one copy of a prop stands. */
export interface Placement {
  x: number;
  z: number;
  y?: number;
  yaw: number;
  size: number;
  /** Extra stretch per axis (on top of `size`). */
  stretch?: [number, number, number];
}

/** How far the outline shell grows past the part (inverted hull, like the characters). */
const OUTLINE_GROW = 1.07;
const TAU = Math.PI * 2;

/** Shared toon materials per color, and the ink outline. */
export class Materials {
  private readonly toon = new Map<number, MeshToonMaterial>();
  readonly ink = new MeshBasicMaterial({ color: OUTLINE_COLOR, side: BackSide });
  private readonly ramp: DataTexture;

  constructor(ramp: DataTexture) {
    this.ramp = ramp;
  }

  of(color: number): MeshToonMaterial {
    let material = this.toon.get(color);
    if (!material) {
      material = new MeshToonMaterial({ color, gradientMap: this.ramp });
      this.toon.set(color, material);
    }
    return material;
  }
}

const place = new Matrix4();
const local = new Matrix4();
const matrix = new Matrix4();
const grow = new Matrix4().makeScale(OUTLINE_GROW, OUTLINE_GROW, OUTLINE_GROW);
const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();
const euler = new Euler();
const UP = new Vector3(0, 1, 0);
type Triple = [number, number, number];
const ZERO: Triple = [0, 0, 0];
const ONE: Triple = [1, 1, 1];

/** Adds every part of `prop` at all `placements`, as instanced meshes. */
export function addProps(
  group: Group,
  prop: Part[],
  placements: Placement[],
  materials: Materials,
): void {
  if (placements.length === 0) return;
  for (const part of prop) {
    const mesh = new InstancedMesh(part.geometry, materials.of(part.color), placements.length);
    const outline =
      part.outline === false
        ? null
        : new InstancedMesh(part.geometry, materials.ink, placements.length);
    local.compose(
      position.set(...(part.at ?? ZERO)),
      rotation.setFromEuler(euler.set(...(part.rotation ?? ZERO))),
      scale.set(...(part.scale ?? ONE)),
    );
    placements.forEach((p, i) => {
      const [sx, sy, sz] = p.stretch ?? ONE;
      place.compose(
        position.set(p.x, p.y ?? 0, p.z),
        rotation.setFromAxisAngle(UP, p.yaw),
        scale.set(p.size * sx, p.size * sy, p.size * sz),
      );
      matrix.multiplyMatrices(place, local);
      mesh.setMatrixAt(i, matrix);
      if (outline) outline.setMatrixAt(i, matrix.multiply(grow));
    });
    group.add(mesh);
    if (outline) group.add(outline);
  }
}

/**
 * Random spots in a band around the arena: at least `inner` and at most `outer` meters
 * outside its walls, at least `spacing` apart. Sizes between `minSize` and `maxSize`.
 */
function around(
  map: MapDef,
  random: () => number,
  count: number,
  {
    inner,
    outer,
    spacing = 0,
    minSize = 0.8,
    maxSize = 1.2,
  }: {
    inner: number;
    outer: number;
    spacing?: number;
    minSize?: number;
    maxSize?: number;
  },
): Placement[] {
  const b = map.bounds;
  const spots: Placement[] = [];
  const wanted = Math.round(count);
  for (let tries = 0; spots.length < wanted && tries < wanted * 40; tries++) {
    const x = lerp(b.minX - outer, b.maxX + outer, random());
    const z = lerp(b.minZ - outer, b.maxZ + outer, random());
    const outside = Math.max(b.minX - x, x - b.maxX, b.minZ - z, z - b.maxZ);
    if (outside < inner || outside > outer) continue;
    if (spacing > 0 && spots.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < spacing * spacing)) {
      continue;
    }
    spots.push({ x, z, yaw: random() * TAU, size: lerp(minSize, maxSize, random()) });
  }
  return spots;
}

/** A plain box with its feet at y = 0 (stretched by the placement). */
const unitBox = () => new BoxGeometry(1, 1, 1);

// --- Forest ---------------------------------------------------------------------------------

function forest(group: Group, map: MapDef, random: () => number, m: Materials, n: number) {
  const trunk = 0x8b5a3c;
  const roundTree: Part[] = [
    { geometry: new CylinderGeometry(0.25, 0.36, 2.2, 8), color: trunk, at: [0, 1.1, 0] },
    { geometry: new SphereGeometry(1.6, 10, 8), color: 0x4fb35a, at: [0, 3.3, 0] },
    { geometry: new SphereGeometry(1.1, 10, 8), color: 0x66c76c, at: [0.7, 4.3, 0.3] },
  ];
  const pine: Part[] = [
    { geometry: new CylinderGeometry(0.2, 0.3, 1.4, 8), color: trunk, at: [0, 0.7, 0] },
    { geometry: new ConeGeometry(1.7, 2.4, 8), color: 0x2f9b5e, at: [0, 2.4, 0] },
    { geometry: new ConeGeometry(1.25, 2, 8), color: 0x37ad68, at: [0, 3.7, 0] },
    { geometry: new ConeGeometry(0.8, 1.6, 8), color: 0x41bd72, at: [0, 4.8, 0] },
  ];
  const bush: Part[] = [
    {
      geometry: new SphereGeometry(0.9, 9, 7),
      color: 0x5cc26a,
      at: [0, 0.4, 0],
      scale: [1, 0.7, 1],
    },
  ];
  const rock: Part[] = [
    {
      geometry: new DodecahedronGeometry(0.8),
      color: 0xb1adc0,
      at: [0, 0.3, 0],
      scale: [1.25, 0.7, 1],
    },
  ];
  const log: Part[] = [
    {
      geometry: new CylinderGeometry(0.36, 0.36, 2.6, 10),
      color: 0x9a6b45,
      at: [0, 0.36, 0],
      rotation: [0, 0, Math.PI / 2],
    },
  ];
  const mushroom: Part[] = [
    { geometry: new CylinderGeometry(0.12, 0.16, 0.5, 8), color: 0xfff3e0, at: [0, 0.25, 0] },
    {
      geometry: new SphereGeometry(0.42, 12, 8, 0, TAU, 0, Math.PI / 2),
      color: 0xff5a5f,
      at: [0, 0.45, 0],
    },
  ];
  const near = { inner: 3.5, outer: 30 };
  addProps(
    group,
    roundTree,
    around(map, random, 55 * n, { ...near, spacing: 3.2, minSize: 0.8, maxSize: 1.5 }),
    m,
  );
  addProps(
    group,
    pine,
    around(map, random, 40 * n, { ...near, spacing: 3, minSize: 0.9, maxSize: 1.7 }),
    m,
  );
  addProps(group, bush, around(map, random, 40 * n, { inner: 2.5, outer: 24 }), m);
  addProps(
    group,
    rock,
    around(map, random, 20 * n, { inner: 2.5, outer: 26, minSize: 0.6, maxSize: 1.6 }),
    m,
  );
  addProps(group, log, around(map, random, 10 * n, { inner: 3, outer: 18 }), m);
  addProps(
    group,
    mushroom,
    around(map, random, 24 * n, { inner: 2.2, outer: 16, minSize: 0.7, maxSize: 1.6 }),
    m,
  );
}

// --- Desert ---------------------------------------------------------------------------------

function desert(group: Group, map: MapDef, random: () => number, m: Materials, n: number) {
  const mesa: Part[] = [
    { geometry: new CylinderGeometry(6, 7.5, 6, 7), color: 0xd9824f, at: [0, 3, 0] },
    { geometry: new CylinderGeometry(5.4, 6, 2.4, 7), color: 0xeaa56b, at: [0, 7.2, 0] },
  ];
  const green = 0x5aa84f;
  const cactus: Part[] = [
    { geometry: new CylinderGeometry(0.34, 0.4, 2.6, 8), color: green, at: [0, 1.3, 0] },
    { geometry: new SphereGeometry(0.34, 8, 6), color: green, at: [0, 2.6, 0] },
    {
      geometry: new CylinderGeometry(0.2, 0.2, 0.6, 8),
      color: green,
      at: [-0.4, 1.15, 0],
      rotation: [0, 0, Math.PI / 2],
    },
    { geometry: new CylinderGeometry(0.21, 0.21, 1, 8), color: green, at: [-0.68, 1.6, 0] },
    {
      geometry: new CylinderGeometry(0.2, 0.2, 0.55, 8),
      color: green,
      at: [0.38, 1.5, 0],
      rotation: [0, 0, Math.PI / 2],
    },
    { geometry: new CylinderGeometry(0.21, 0.21, 0.8, 8), color: green, at: [0.64, 1.85, 0] },
  ];
  const rock: Part[] = [
    {
      geometry: new DodecahedronGeometry(0.8),
      color: 0xc98d62,
      at: [0, 0.3, 0],
      scale: [1.3, 0.65, 1],
    },
  ];
  const crate: Part[] = [
    { geometry: new BoxGeometry(1.2, 1.2, 1.2), color: 0xc99a5b, at: [0, 0.6, 0] },
  ];
  const dune: Part[] = [
    {
      geometry: new SphereGeometry(4, 14, 8),
      color: 0xf2cf8f,
      at: [0, 0, 0],
      scale: [1, 0.22, 0.6],
      outline: false,
    },
  ];
  addProps(
    group,
    mesa,
    around(map, random, 12 * n, { inner: 16, outer: 48, spacing: 14, minSize: 0.7, maxSize: 1.5 }),
    m,
  );
  addProps(
    group,
    cactus,
    around(map, random, 34 * n, { inner: 3, outer: 28, spacing: 2.5, minSize: 0.8, maxSize: 1.4 }),
    m,
  );
  addProps(
    group,
    rock,
    around(map, random, 26 * n, { inner: 2.5, outer: 30, minSize: 0.6, maxSize: 1.8 }),
    m,
  );
  addProps(
    group,
    crate,
    around(map, random, 14 * n, { inner: 2.5, outer: 14, minSize: 0.7, maxSize: 1.1 }),
    m,
  );
  addProps(
    group,
    dune,
    around(map, random, 18 * n, { inner: 6, outer: 40, minSize: 0.8, maxSize: 1.8 }),
    m,
  );
}

// --- Office ---------------------------------------------------------------------------------

function office(group: Group, map: MapDef, random: () => number, m: Materials, n: number) {
  const desk: Part[] = [
    { geometry: new BoxGeometry(2.4, 0.12, 1.2), color: 0xf4efe6, at: [0, 0.76, 0] },
    { geometry: new BoxGeometry(0.1, 0.72, 1.1), color: 0xb8bfcc, at: [-1.1, 0.36, 0] },
    { geometry: new BoxGeometry(0.1, 0.72, 1.1), color: 0xb8bfcc, at: [1.1, 0.36, 0] },
    { geometry: new BoxGeometry(0.75, 0.48, 0.06), color: 0x2b2f3f, at: [0, 1.12, 0.25] },
  ];
  const chair: Part[] = [
    { geometry: new CylinderGeometry(0.32, 0.32, 0.1, 12), color: 0xe63946, at: [0, 0.5, 0] },
    { geometry: new BoxGeometry(0.6, 0.6, 0.1), color: 0xe63946, at: [0, 0.86, 0.3] },
    { geometry: new CylinderGeometry(0.05, 0.05, 0.45, 6), color: 0x2b2f3f, at: [0, 0.24, 0] },
  ];
  const plant: Part[] = [
    { geometry: new CylinderGeometry(0.35, 0.27, 0.6, 10), color: 0xf28c28, at: [0, 0.3, 0] },
    { geometry: new SphereGeometry(0.7, 9, 7), color: 0x4fb35a, at: [0, 1.15, 0] },
  ];
  const cooler: Part[] = [
    { geometry: new BoxGeometry(0.5, 1, 0.5), color: 0xf6f3ec, at: [0, 0.5, 0] },
    { geometry: new CylinderGeometry(0.22, 0.22, 0.6, 12), color: 0x8fd6ff, at: [0, 1.3, 0] },
  ];
  const cabinet: Part[] = [
    { geometry: new BoxGeometry(0.6, 1.3, 0.7), color: 0x9aa3b8, at: [0, 0.65, 0] },
  ];
  addProps(group, desk, around(map, random, 26 * n, { inner: 3, outer: 18, spacing: 3 }), m);
  addProps(group, chair, around(map, random, 24 * n, { inner: 2.5, outer: 18, spacing: 1.5 }), m);
  addProps(
    group,
    plant,
    around(map, random, 16 * n, { inner: 2.5, outer: 19, minSize: 0.8, maxSize: 1.3 }),
    m,
  );
  addProps(group, cooler, around(map, random, 6 * n, { inner: 3, outer: 16 }), m);
  addProps(group, cabinet, around(map, random, 12 * n, { inner: 3, outer: 19 }), m);

  // The office's outer walls: a window sill, a beam on top and pillars, with the city
  // skyline showing through the big windows in between.
  const b = map.bounds;
  const gap = 22;
  const minX = b.minX - gap;
  const maxX = b.maxX + gap;
  const minZ = b.minZ - gap;
  const maxZ = b.maxZ + gap;
  const width = maxX - minX;
  const length = maxZ - minZ;
  const wall = 0xe9e6ef;
  const box: Part[] = [{ geometry: unitBox(), color: wall, at: [0, 0.5, 0], outline: false }];
  const pieces: Placement[] = [];
  const side = (x: number, z: number, along: 'x' | 'z', span: number) => {
    const stretch = (sx: number, sy: number, sz: number): [number, number, number] =>
      along === 'x' ? [sx, sy, sz] : [sz, sy, sx];
    pieces.push({ x, z, yaw: 0, size: 1, stretch: stretch(span, 1.2, 0.8) });
    pieces.push({ x, z, y: 7, yaw: 0, size: 1, stretch: stretch(span, 1.6, 0.8) });
    for (let t = -span / 2; t <= span / 2 + 0.01; t += 6) {
      const px = along === 'x' ? x + t : x;
      const pz = along === 'x' ? z : z + t;
      pieces.push({ x: px, z: pz, yaw: 0, size: 1, stretch: [0.9, 8.6, 0.9] });
    }
  };
  side((minX + maxX) / 2, minZ, 'x', width);
  side((minX + maxX) / 2, maxZ, 'x', width);
  side(minX, (minZ + maxZ) / 2, 'z', length);
  side(maxX, (minZ + maxZ) / 2, 'z', length);
  addProps(group, box, pieces, m);

  const towers = around(map, random, 44 * n, { inner: gap + 14, outer: gap + 46, spacing: 7 });
  for (const tower of towers) {
    tower.yaw = Math.round(tower.yaw / (Math.PI / 2)) * (Math.PI / 2);
    tower.stretch = [lerp(6, 12, random()), lerp(12, 42, random()), lerp(6, 12, random())];
    tower.size = 1;
  }
  const half = Math.floor(towers.length / 2);
  addProps(
    group,
    [{ geometry: unitBox(), color: 0x9fb3cc, at: [0, 0.5, 0], outline: false }],
    towers.slice(0, half),
    m,
  );
  addProps(
    group,
    [{ geometry: unitBox(), color: 0x8799b8, at: [0, 0.5, 0], outline: false }],
    towers.slice(half),
    m,
  );
}

const BUILDERS: Partial<
  Record<
    MapTheme,
    (group: Group, map: MapDef, random: () => number, m: Materials, n: number) => void
  >
> = { forest, desert, office };

/**
 * The scenery for a theme around `map` (nothing for the original yard), with its ground. The
 * same `seed` gives the same scenery. `density` (0–1) thins it out on low quality.
 */
export function createScenery(
  theme: MapTheme,
  map: MapDef,
  toonRamp: DataTexture,
  seed: number,
  density = 1,
): Group {
  const group = new Group();
  group.name = `scenery:${theme}`;
  const look = THEME_LOOKS[theme];
  const build = BUILDERS[theme];
  if (!build) return group;
  const materials = new Materials(toonRamp);
  if (look.outerGround !== null) {
    const b = map.bounds;
    const ground = new Mesh(
      new PlaneGeometry(b.maxX - b.minX + 260, b.maxZ - b.minZ + 260),
      materials.of(look.outerGround),
    );
    ground.rotation.x = -Math.PI / 2;
    // Just under the arena floor, so it only shows outside the walls.
    ground.position.set((b.minX + b.maxX) / 2, -0.04, (b.minZ + b.maxZ) / 2);
    group.add(ground);
  }
  build(group, map, createRng(seed), materials, density);
  return group;
}

/** Frees everything a scenery group made (geometries are shared, so each is freed once). */
export function disposeScenery(group: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  group.traverse((object) => {
    if (object instanceof Mesh) {
      geometries.add(object.geometry as BufferGeometry);
      materials.add(object.material as Material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
