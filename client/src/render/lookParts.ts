import {
  BoxGeometry,
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

/** A heart, point down, about `size` tall from its middle (flat, in the XY plane). */
function heartShape(size: number): Shape {
  const shape = new Shape();
  shape.moveTo(0, -size);
  shape.bezierCurveTo(size * 1.25, -size * 0.15, size * 0.8, size * 1.05, 0, size * 0.4);
  shape.bezierCurveTo(-size * 0.8, size * 1.05, -size * 1.25, -size * 0.15, 0, -size);
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

/** One closed eye ("^") and one open (the left one winks). */
function winkEyes(m: PartMaterials): Object3D {
  const group = new Group();
  const open = whiteEye(m, 1);
  const pupil = new Mesh(new SphereGeometry(0.05, 10, 8), m.ink);
  pupil.position.z = -0.07;
  open.add(pupil);
  const closed = new Mesh(new TorusGeometry(0.065, 0.022, 8, 16, Math.PI), m.ink);
  closed.position.set(-EYE_X, EYE_Y - 0.02, EYE_Z - 0.04);
  group.add(open, closed);
  return group;
}

/** Fierce: small pupils under brows slanting down toward the middle. */
function angryEyes(m: PartMaterials): Object3D {
  const brow = new BoxGeometry(0.15, 0.035, 0.04);
  return pair((side) => {
    const eye = whiteEye(m, side);
    const pupil = new Mesh(new SphereGeometry(0.042, 10, 8), m.ink);
    pupil.position.set(-side * 0.015, -0.01, -0.075);
    const lid = new Mesh(brow, m.ink);
    // The end toward the middle of the face sits lower.
    lid.rotation.z = side * 0.45;
    lid.position.set(0, 0.1, -0.06);
    eye.add(pupil, lid);
    return eye;
  });
}

/** Smitten: white eyes with pink heart pupils. */
function heartEyes(m: PartMaterials): Object3D {
  const pink = new MeshBasicMaterial({ color: 0xff4f9a, side: DoubleSide });
  const heart = new ShapeGeometry(heartShape(0.055));
  return pair((side) => {
    const eye = whiteEye(m, side);
    const pupil = new Mesh(heart, pink);
    pupil.position.z = -0.102;
    eye.add(pupil);
    return eye;
  });
}

/** Little beady dots with a shine, no whites. */
function dotEyes(m: PartMaterials): Object3D {
  return pair((side) => {
    const dot = new Mesh(new SphereGeometry(0.055, 12, 8), m.ink);
    dot.scale.y = 1.25;
    dot.position.set(EYE_X * side * 0.9, EYE_Y, EYE_Z - 0.03);
    const shine = new Mesh(new SphereGeometry(0.016, 8, 6), m.white);
    shine.position.set(0.018, 0.022, -0.045);
    dot.add(shine);
    return dot;
  });
}

export const EYE_PARTS: ((m: PartMaterials) => Object3D)[] = [
  roundEyes,
  sleepyEyes,
  happyEyes,
  starEyes,
  winkEyes,
  angryEyes,
  heartEyes,
  dotEyes,
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

/** A tall dark top hat with a red band, worn a little tilted. */
function topHat(m: PartMaterials): Object3D {
  const group = new Group();
  const felt = toon(0x2b2140, m);
  const radius = 0.2;
  const y = BODY_CENTER_Y + heightAtRadius(0.27) - 0.02;
  const brim = new Mesh(new CylinderGeometry(0.31, 0.31, 0.035, 22), felt);
  brim.position.y = y;
  const crownPart = new Mesh(new CylinderGeometry(radius, radius * 0.95, 0.32, 20), felt);
  crownPart.position.y = y + 0.17;
  const band = new Mesh(
    new CylinderGeometry(radius * 0.97, radius * 0.97, 0.06, 20),
    toon(0xe63946, m),
  );
  band.position.y = y + 0.05;
  group.add(brim, crownPart, band);
  group.rotation.z = -0.12;
  return group;
}

/** A beanie cap with a little two-bladed propeller on top. */
function propeller(m: PartMaterials): Object3D {
  const group = new Group();
  const radius = 0.32;
  const y = BODY_CENTER_Y + heightAtRadius(radius) - 0.02;
  const dome = new Mesh(
    new SphereGeometry(radius, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    toon(0x06d6a0, m),
  );
  dome.position.y = y;
  const stem = new Mesh(new CylinderGeometry(0.018, 0.018, 0.12, 8), m.ink);
  stem.position.y = y + radius + 0.04;
  const blades = new Group();
  blades.position.y = y + radius + 0.1;
  blades.rotation.y = 0.5;
  for (const [side, color] of [
    [-1, 0xff5964],
    [1, 0xffd166],
  ] as const) {
    const blade = new Mesh(new BoxGeometry(0.17, 0.015, 0.06), toon(color, m));
    blade.position.x = side * 0.09;
    blade.rotation.x = side * 0.3;
    blades.add(blade);
  }
  group.add(dome, stem, blades);
  return group;
}

/** A striped-pink party cone with a pompom, tipped to one side. */
function partyCone(m: PartMaterials): Object3D {
  const group = new Group();
  const cone = new Mesh(new ConeGeometry(0.15, 0.38, 18), toon(0xff5fa2, m));
  cone.position.y = 0.19;
  const pompom = new Mesh(new SphereGeometry(0.06, 10, 8), toon(0xffffff, m));
  pompom.position.y = 0.4;
  const trim = new Mesh(new TorusGeometry(0.145, 0.025, 8, 20), toon(0xffd166, m));
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.02;
  group.add(cone, pompom, trim);
  group.position.set(0.06, BODY_CENTER_Y + BODY_RADIUS - 0.06, 0);
  group.rotation.z = -0.22;
  return group;
}

/** A little green sprout growing out of the top of the head. */
function sprout(m: PartMaterials): Object3D {
  const group = new Group();
  const green = toon(0x52b947, m);
  const stem = new Mesh(new CylinderGeometry(0.018, 0.022, 0.16, 8), green);
  stem.position.y = 0.08;
  group.add(stem);
  for (const side of [-1, 1]) {
    const leaf = new Mesh(new SphereGeometry(0.1, 12, 8), green);
    leaf.scale.set(1, 0.22, 0.55);
    leaf.position.set(side * 0.09, 0.17, 0);
    leaf.rotation.z = side * 0.45;
    group.add(leaf);
  }
  group.position.y = BODY_CENTER_Y + BODY_RADIUS - 0.03;
  return group;
}

/** Big comfy headphones: a band over the head and a cup on each side. */
function headphones(m: PartMaterials): Object3D {
  const group = new Group();
  const shell = toon(0xf7f5ff, m);
  const band = new Mesh(new TorusGeometry(BODY_RADIUS + 0.04, 0.03, 8, 28, Math.PI), m.ink);
  band.position.y = BODY_CENTER_Y + 0.02;
  group.add(band);
  for (const side of [-1, 1]) {
    const cup = new Mesh(new CylinderGeometry(0.12, 0.12, 0.09, 18), shell);
    cup.rotation.z = Math.PI / 2;
    cup.position.set(side * (BODY_RADIUS + 0.02), BODY_CENTER_Y + 0.02, 0);
    const pad = new Mesh(new CylinderGeometry(0.08, 0.08, 0.1, 14), toon(0xff5964, m));
    pad.rotation.z = Math.PI / 2;
    pad.position.copy(cup.position);
    pad.position.x += side * 0.012;
    group.add(cup, pad);
  }
  return group;
}

/** Index 0 is "None". */
export const HAT_PARTS: ((m: PartMaterials) => Object3D | null)[] = [
  () => null,
  cap,
  beanie,
  crown,
  bow,
  topHat,
  propeller,
  partyCone,
  sprout,
  headphones,
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

/** Star-shaped pink party shades. */
function starShades(): Object3D {
  const frame = new MeshBasicMaterial({ color: 0xff4f9a, side: DoubleSide });
  const lens = new MeshBasicMaterial({
    color: 0x1d1135,
    transparent: true,
    opacity: 0.75,
    side: DoubleSide,
  });
  const outer = new ShapeGeometry(starShape(0.15, 0.075));
  const inner = new ShapeGeometry(starShape(0.11, 0.055));
  const group = pair((side) => {
    const star = new Group();
    const rim = new Mesh(outer, frame);
    const glass = new Mesh(inner, lens);
    glass.position.z = -0.004;
    star.add(rim, glass);
    star.position.set(EYE_X * side * 1.1, EYE_Y, EYE_Z - 0.09);
    return star;
  });
  const bridge = new Mesh(new BoxGeometry(0.1, 0.025, 0.02), frame);
  bridge.position.set(0, EYE_Y + 0.02, EYE_Z - 0.09);
  group.add(bridge);
  return group;
}

/** A fancy gold monocle over one eye, with a little chain. */
function monocle(m: PartMaterials): Object3D {
  const group = new Group();
  const gold = toon(0xffc23c, m);
  const rim = new Mesh(new TorusGeometry(0.1, 0.02, 8, 20), gold);
  rim.position.set(EYE_X, EYE_Y, EYE_Z - 0.07);
  const glass = new Mesh(
    new CircleGeometry(0.09, 20),
    new MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.3 }),
  );
  glass.rotation.y = Math.PI;
  glass.position.copy(rim.position);
  const chain = new Mesh(new CylinderGeometry(0.008, 0.008, 0.24, 6), gold);
  chain.position.set(EYE_X + 0.07, EYE_Y - 0.17, EYE_Z + 0.01);
  chain.rotation.z = 0.35;
  group.add(rim, glass, chain);
  return group;
}

/** Wide ski goggles: a white frame around an orange mirrored lens. */
function skiGoggles(m: PartMaterials): Object3D {
  const group = new Group();
  // Cylinder angles start at +Z; the front of the face is −Z (angle π).
  const frame = new Mesh(
    new CylinderGeometry(0.5, 0.5, 0.21, 28, 1, true, Math.PI - 1.05, 2.1),
    new MeshToonMaterial({ color: 0xffffff, gradientMap: m.toonRamp, side: DoubleSide }),
  );
  frame.position.y = EYE_Y;
  const lens = new Mesh(
    new CylinderGeometry(0.515, 0.515, 0.15, 28, 1, true, Math.PI - 0.92, 1.84),
    new MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.85, side: DoubleSide }),
  );
  lens.position.y = EYE_Y;
  group.add(strap(m), frame, lens);
  return group;
}

/** Index 0 is "None". */
export const GOGGLE_PARTS: ((m: PartMaterials) => Object3D | null)[] = [
  () => null,
  roundGoggles,
  visor,
  starShades,
  monocle,
  skiGoggles,
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

/** A red skate boot on a plate with two yellow wheels. */
function rollerSkate(m: PartMaterials): Object3D {
  const group = new Group();
  const toe = footBall(toon(0xe63946, m));
  toe.position.y = 0.02;
  const plate = new Mesh(new BoxGeometry(0.14, 0.025, 0.3), m.ink);
  plate.position.y = -0.04;
  group.add(toe, plate);
  const wheel = new CylinderGeometry(0.045, 0.045, 0.1, 12);
  const rubber = toon(0xffd166, m);
  for (const z of [-0.1, 0.1]) {
    const w = new Mesh(wheel, rubber);
    w.rotation.z = Math.PI / 2;
    w.position.set(0, -0.08, z);
    group.add(w);
  }
  return group;
}

/** Tall shiny yellow rain boots. */
function rainBoot(m: PartMaterials): Object3D {
  const group = new Group();
  const rubber = toon(0xffd23f, m);
  const shaft = new Mesh(new CylinderGeometry(0.11, 0.115, 0.3, 14), rubber);
  shaft.position.y = 0.1;
  const toe = footBall(rubber);
  toe.position.set(0, -0.01, -0.05);
  const sole = new Mesh(new CylinderGeometry(0.125, 0.125, 0.03, 14), m.ink);
  sole.scale.z = 1.35;
  sole.position.set(0, -0.06, -0.03);
  group.add(shaft, toe, sole);
  return group;
}

/** Fluffy pink slippers with a pompom on top. */
function slipper(m: PartMaterials): Object3D {
  const group = new Group();
  const fluff = footBall(toon(0xffb3d1, m));
  fluff.scale.multiplyScalar(1.15);
  const pompom = new Mesh(new SphereGeometry(0.05, 10, 8), toon(0xffffff, m));
  pompom.position.set(0, 0.07, -0.08);
  group.add(fluff, pompom);
  return group;
}

export const SHOE_PARTS: ((m: PartMaterials) => Object3D)[] = [
  sneaker,
  boot,
  flipper,
  sandal,
  rollerSkate,
  rainBoot,
  slipper,
];

// --- Body shape -----------------------------------------------------------------------------

/** Proportions of the body (and how far apart the feet are), in LOOK_OPTIONS.body order. */
export const BODY_SHAPES: { width: number; height: number }[] = [
  { width: 1, height: 1 }, // round
  { width: 0.9, height: 1.15 }, // tall
  { width: 1.14, height: 0.88 }, // wide
  { width: 0.8, height: 1.28 }, // bean
  { width: 1.28, height: 0.76 }, // chunky
  { width: 0.84, height: 0.84 }, // tiny
];
