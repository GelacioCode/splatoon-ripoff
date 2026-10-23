import {
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  type DataTexture,
  type Material,
  type Object3D,
} from 'three';

// The customizable parts of the blob (see LOOK_OPTIONS in shared/src/lobby/look.ts), built
// from simple meshes. Every list here has one entry per option, in the same order. All parts
// are placed in the body's space: feet at y = 0, facing −Z.

export const BODY_RADIUS = 0.45;
export const BODY_CENTER_Y = 0.56;
/** Where the eyes sit on the face (x is ± this for left/right). */
const EYE_X = 0.16;
const EYE_Y = BODY_CENTER_Y + 0.14;
const EYE_Z = -0.37;

/** Materials the parts share with the rest of the character. */
export interface PartMaterials {
  /** The team-colored body material (changes color with the team). */
  skin: Material;
  ink: Material;
  white: Material;
  toonRamp: DataTexture;
}

const toon = (color: number, m: PartMaterials) =>
  new MeshToonMaterial({ color, gradientMap: m.toonRamp });

/** Builds the same thing for the left (−1) and right (+1) side. */
function pair(build: (side: number) => Object3D): Group {
  const group = new Group();
  group.add(build(-1), build(1));
  return group;
}

/** Height above the body's center where a horizontal slice of the body has this radius. */
function heightAtRadius(radius: number): number {
  return Math.sqrt(BODY_RADIUS * BODY_RADIUS - radius * radius);
}

function starShape(outer: number, inner: number): Shape {
  const shape = new Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return shape;
}

// --- Eyes -----------------------------------------------------------------------------------

function whiteEye(m: PartMaterials, side: number): Mesh {
  const eye = new Mesh(new SphereGeometry(0.1, 14, 10), m.white);
  eye.position.set(EYE_X * side, EYE_Y, EYE_Z);
  return eye;
}

function roundEyes(m: PartMaterials): Object3D {
  return pair((side) => {
    const eye = whiteEye(m, side);
    const pupil = new Mesh(new SphereGeometry(0.05, 10, 8), m.ink);
    pupil.position.z = -0.07;
    eye.add(pupil);
    return eye;
  });
}

/** Half-closed: a skin-colored lid over the top half. */
function sleepyEyes(m: PartMaterials): Object3D {
  return pair((side) => {
    const eye = whiteEye(m, side);
    const pupil = new Mesh(new SphereGeometry(0.045, 10, 8), m.ink);
    pupil.position.set(0, -0.03, -0.07);
    const lid = new Mesh(new SphereGeometry(0.108, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.skin);
    lid.rotation.x = -0.35;
    eye.add(pupil, lid);
    return eye;
  });
}

/** Closed and smiling: two little arcs ("^ ^"). */
function happyEyes(m: PartMaterials): Object3D {
  return pair((side) => {
    const arc = new Mesh(new TorusGeometry(0.065, 0.022, 8, 16, Math.PI), m.ink);
    arc.position.set(EYE_X * side, EYE_Y - 0.02, EYE_Z - 0.04);
    return arc;
  });
}

/** Sparkly: white eyes with gold star pupils. */
function starEyes(m: PartMaterials): Object3D {
  const gold = new MeshBasicMaterial({ color: 0xffc23c, side: DoubleSide });
  const star = new ShapeGeometry(starShape(0.06, 0.026));
  return pair((side) => {
    const eye = whiteEye(m, side);
    const pupil = new Mesh(star, gold);
    pupil.position.z = -0.102;
    eye.add(pupil);
    return eye;
  });
}

export const EYE_PARTS: ((m: PartMaterials) => Object3D)[] = [
  roundEyes,
  sleepyEyes,
  happyEyes,
  starEyes,
];

// --- Hats -----------------------------------------------------------------------------------

function cap(m: PartMaterials): Object3D {
  const group = new Group();
  const color = toon(0xffd166, m);
  const radius = 0.33;
  const y = BODY_CENTER_Y + heightAtRadius(radius) - 0.02;
  const dome = new Mesh(new SphereGeometry(radius, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), color);
  dome.position.y = y;
  const brim = new Mesh(new CylinderGeometry(0.22, 0.22, 0.03, 20), color);
  brim.position.set(0, y + 0.01, -0.3);
  brim.scale.z = 0.9;
  group.add(dome, brim);
  return group;
}

function beanie(m: PartMaterials): Object3D {
  const group = new Group();
  const knit = toon(0x3a86ff, m);
  const radius = 0.36;
  const y = BODY_CENTER_Y + heightAtRadius(radius) - 0.02;
  const dome = new Mesh(new SphereGeometry(radius, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), knit);
  dome.position.y = y;
  const band = new Mesh(new TorusGeometry(radius, 0.045, 8, 28), knit);
  band.rotation.x = Math.PI / 2;
  band.position.y = y;
  const pompom = new Mesh(new SphereGeometry(0.08, 12, 8), toon(0xffffff, m));
  pompom.position.y = y + radius + 0.04;
  group.add(dome, band, pompom);
  return group;
}

function crown(m: PartMaterials): Object3D {
  const group = new Group();
  const gold = new MeshToonMaterial({ color: 0xffc23c, gradientMap: m.toonRamp, side: DoubleSide });
  const radius = 0.21;
  const y = BODY_CENTER_Y + heightAtRadius(radius) + 0.04;
  const ring = new Mesh(new CylinderGeometry(radius, radius + 0.02, 0.13, 16, 1, true), gold);
  ring.position.y = y;
  group.add(ring);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new Mesh(new ConeGeometry(0.045, 0.12, 8), gold);
    spike.position.set(Math.sin(a) * radius, y + 0.12, Math.cos(a) * radius);
    group.add(spike);
  }
  return group;
}

function bow(m: PartMaterials): Object3D {
  const group = new Group();
  const ribbon = toon(0x9b5de5, m);
  for (const side of [-1, 1]) {
    const loop = new Mesh(new ConeGeometry(0.09, 0.18, 12), ribbon);
    loop.rotation.z = (side * Math.PI) / 2;
    loop.position.x = side * 0.09;
    group.add(loop);
  }
  group.add(new Mesh(new SphereGeometry(0.05, 10, 8), ribbon));
  // Perched on one side of the head, tilted.
  group.position.set(0.2, BODY_CENTER_Y + 0.37, 0);
  group.rotation.z = -0.45;
  return group;
}

/** Index 0 is "None". */
export const HAT_PARTS: ((m: PartMaterials) => Object3D | null)[] = [
  () => null,
  cap,
  beanie,
  crown,
  bow,
];

// --- Goggles --------------------------------------------------------------------------------

/** The elastic band around the head at eye height. */
function strap(m: PartMaterials): Mesh {
  const band = new Mesh(
    new TorusGeometry(Math.sqrt(BODY_RADIUS ** 2 - 0.14 ** 2) + 0.008, 0.02, 6, 36),
    m.ink,
  );
  band.rotation.x = Math.PI / 2;
  band.position.y = EYE_Y;
  return band;
}

function roundGoggles(m: PartMaterials): Object3D {
  const group = new Group();
  const lens = new MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.35 });
  group.add(
    strap(m),
    pair((side) => {
      const rim = new Mesh(new TorusGeometry(0.11, 0.026, 8, 20), m.ink);
      rim.position.set(EYE_X * side, EYE_Y, EYE_Z - 0.06);
      const glass = new Mesh(new CircleGeometry(0.1, 20), lens);
      glass.rotation.y = Math.PI;
      glass.position.copy(rim.position);
      glass.position.z -= 0.005;
      const both = new Group();
      both.add(rim, glass);
      return both;
    }),
  );
  return group;
}

/** A dark curved shield across the eyes. */
function visor(m: PartMaterials): Object3D {
  const group = new Group();
  const shade = new MeshBasicMaterial({
    color: 0x1d1135,
    transparent: true,
    opacity: 0.8,
    side: DoubleSide,
  });
  // Cylinder angles start at +Z; the front of the face is −Z (angle π).
  const shield = new Mesh(
    new CylinderGeometry(0.52, 0.52, 0.17, 28, 1, true, Math.PI - 0.95, 1.9),
    shade,
  );
  shield.position.y = EYE_Y;
  group.add(strap(m), shield);
  return group;
}

/** Index 0 is "None". */
export const GOGGLE_PARTS: ((m: PartMaterials) => Object3D | null)[] = [
  () => null,
  roundGoggles,
  visor,
];

// --- Shoes (one foot; the character has two) -----------------------------------------------

function footBall(material: Material): Mesh {
  const foot = new Mesh(new SphereGeometry(0.12, 12, 8), material);
  foot.scale.set(1, 0.6, 1.3);
  return foot;
}

function sneaker(m: PartMaterials): Object3D {
  const group = new Group();
  const sole = new Mesh(new CylinderGeometry(0.12, 0.12, 0.03, 14), m.ink);
  sole.scale.z = 1.3;
  sole.position.y = -0.05;
  group.add(footBall(toon(0xffffff, m)), sole);
  return group;
}

function boot(m: PartMaterials): Object3D {
  const group = new Group();
  const leather = toon(0x8d5524, m);
  const shaft = new Mesh(new CylinderGeometry(0.1, 0.11, 0.2, 12), leather);
  shaft.position.y = 0.06;
  const toe = footBall(leather);
  toe.position.set(0, -0.01, -0.04);
  group.add(shaft, toe);
  return group;
}

function flipper(m: PartMaterials): Object3D {
  const group = new Group();
  const fin = new Mesh(new CylinderGeometry(0.13, 0.13, 0.025, 3), toon(0xff9f1c, m));
  // A flat triangle pointing forward, under and ahead of the foot.
  fin.rotation.y = Math.PI;
  fin.scale.set(1.1, 1, 1.9);
  fin.position.set(0, -0.055, -0.12);
  group.add(footBall(m.skin), fin);
  return group;
}

function sandal(m: PartMaterials): Object3D {
  const group = new Group();
  const sole = new Mesh(new CylinderGeometry(0.13, 0.13, 0.025, 14), toon(0x6b4226, m));
  sole.scale.z = 1.35;
  sole.position.y = -0.06;
  const strapBand = new Mesh(new TorusGeometry(0.1, 0.018, 6, 16, Math.PI), toon(0x6b4226, m));
  strapBand.position.set(0, -0.05, -0.04);
  group.add(footBall(m.skin), sole, strapBand);
  return group;
}

export const SHOE_PARTS: ((m: PartMaterials) => Object3D)[] = [sneaker, boot, flipper, sandal];

// --- Body shape -----------------------------------------------------------------------------

/** Proportions of the body (and how far apart the feet are): round, tall, wide. */
export const BODY_SHAPES: { width: number; height: number }[] = [
  { width: 1, height: 1 },
  { width: 0.9, height: 1.15 },
  { width: 1.14, height: 0.88 },
];
