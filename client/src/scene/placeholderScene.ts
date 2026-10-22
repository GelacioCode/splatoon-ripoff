import {
  BackSide,
  CircleGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  PerspectiveCamera,
  RedFormat,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from 'three';

const SKY_COLOR = 0x9ad8ff;
const FLOOR_COLOR = 0xf3efff;
const OUTLINE_COLOR = 0x1d1135;

/** Static paint splats on the floor: [x, z, radius, color]. */
const FLOOR_SPLATS: [number, number, number, number][] = [
  [-1.9, 0.6, 0.9, 0xff3fa4],
  [-2.6, -1.2, 0.5, 0xff3fa4],
  [2.1, -0.4, 1.0, 0x22d3ee],
  [1.4, 1.7, 0.45, 0x22d3ee],
];

/** Three-step lighting ramp that gives MeshToonMaterial its chunky cel-shaded bands. */
function createToonRamp(): DataTexture {
  const ramp = new DataTexture(new Uint8Array([80, 170, 255]), 3, 1, RedFormat);
  ramp.minFilter = NearestFilter;
  ramp.magFilter = NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}

/**
 * Phase 0 placeholder: a toon-shaded paint-blob creature hopping on a small floor.
 * The real sandbox replaces it in Phase 1.
 */
export function startPlaceholderScene(container: HTMLElement, blobColor: number): void {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(SKY_COLOR);

  const camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 2.4, 6);
  camera.lookAt(0, 0.9, 0);

  scene.add(new HemisphereLight(0xffffff, 0x8a7cc4, 1.5));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 6, 4);
  scene.add(sun);

  const ramp = createToonRamp();

  const floor = new Mesh(
    new CircleGeometry(5, 64),
    new MeshToonMaterial({ color: FLOOR_COLOR, gradientMap: ramp }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  FLOOR_SPLATS.forEach(([x, z, radius, color], i) => {
    const splat = new Mesh(
      new CircleGeometry(radius, 24),
      new MeshToonMaterial({ color, gradientMap: ramp }),
    );
    splat.rotation.x = -Math.PI / 2;
    splat.position.set(x, 0.002 * (i + 1), z);
    scene.add(splat);
  });

  const shadow = new Mesh(
    new CircleGeometry(0.9, 32),
    new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  scene.add(shadow);

  // Paint-blob creature: gummy body, inverted-hull outline, two eyes.
  const blob = new Group();
  const bodyGeometry = new IcosahedronGeometry(1, 5);
  const body = new Mesh(
    bodyGeometry,
    new MeshToonMaterial({ color: blobColor, gradientMap: ramp }),
  );
  const outline = new Mesh(
    bodyGeometry,
    new MeshBasicMaterial({ color: OUTLINE_COLOR, side: BackSide }),
  );
  outline.scale.setScalar(1.06);
  blob.add(body, outline);

  const eyeGeometry = new SphereGeometry(0.17, 16, 12);
  const pupilGeometry = new SphereGeometry(0.08, 12, 8);
  const eyeMaterial = new MeshBasicMaterial({ color: 0xffffff });
  const pupilMaterial = new MeshBasicMaterial({ color: OUTLINE_COLOR });
  for (const side of [-1, 1]) {
    const eye = new Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0.32 * side, 0.25, 0.86);
    const pupil = new Mesh(pupilGeometry, pupilMaterial);
    pupil.position.z = 0.12;
    eye.add(pupil);
    blob.add(eye);
  }
  scene.add(blob);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  renderer.setAnimationLoop((timeMs: number) => {
    const t = timeMs / 1000;
    const hop = Math.abs(Math.sin(t * 2.4)); // bouncing-ball curve: 0 = touching the floor
    const squash = 1 - 0.22 * Math.max(0, 1 - hop * 4); // squish only right around landing
    const widen = 1 / Math.sqrt(squash); // keep the volume constant
    blob.scale.set(widen, squash, widen);
    blob.position.y = squash + hop * 0.9;
    blob.rotation.y = Math.sin(t * 0.7) * 0.5;
    shadow.scale.setScalar(1.1 - hop * 0.4);
    renderer.render(scene, camera);
  });
}
