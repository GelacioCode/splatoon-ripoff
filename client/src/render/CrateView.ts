import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  type DataTexture,
} from 'three';
import { OUTLINE_COLOR } from './palette';

/** The crate's size (m), and how far its logo floats above it. */
const SIZE = 0.9;
const LOGO_HEIGHT = 1.45;

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** The bomb logo: a round black bomb with a lit fuse, on a gold badge with an ink ring. */
function bombLogo(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const ink = cssColor(OUTLINE_COLOR);
    ctx.translate(64, 64);
    ctx.beginPath();
    ctx.arc(0, 0, 54, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.lineWidth = 9;
    ctx.strokeStyle = ink;
    ctx.stroke();
    // The bomb.
    ctx.beginPath();
    ctx.arc(-4, 8, 28, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-14, -2, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgb(255 255 255 / 55%)';
    ctx.fill();
    // Its cap and fuse, with a spark.
    ctx.fillStyle = ink;
    ctx.fillRect(6, -26, 14, 12);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(14, -26);
    ctx.quadraticCurveTo(22, -40, 32, -36);
    ctx.stroke();
    ctx.fillStyle = '#ff5a5f';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? 11 : 4;
      const a = (i / 8) * Math.PI * 2;
      ctx.lineTo(34 + Math.cos(a) * r, -38 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** One drawn crate: the wooden box, and the logo floating over it. */
interface CrateMesh {
  root: Group;
  box: Group;
  logo: Sprite;
}

/**
 * Draws the bomb crates lying in the arena (from the synced state): a chunky wooden crate
 * that bobs and turns, with a bomb logo floating above it so it's easy to spot.
 */
export class CrateView {
  readonly root = new Group();
  private readonly meshes = new Map<string, CrateMesh>();
  private readonly geometry = new BoxGeometry(SIZE, SIZE, SIZE);
  private readonly plankGeometry = new BoxGeometry(SIZE * 1.02, SIZE * 0.16, SIZE * 1.02);
  private readonly wood: MeshToonMaterial;
  private readonly plank: MeshToonMaterial;
  private readonly ink = new MeshBasicMaterial({ color: OUTLINE_COLOR, side: BackSide });
  private readonly logoMaterial = new SpriteMaterial({ map: bombLogo(), depthTest: true });

  constructor(toonRamp: DataTexture) {
    this.wood = new MeshToonMaterial({ color: 0xd9a35f, gradientMap: toonRamp });
    this.plank = new MeshToonMaterial({ color: 0xa8743c, gradientMap: toonRamp });
  }

  /** Shows exactly these crates (by id), each bobbing and turning. */
  update(crates: Iterable<[string, { x: number; y: number; z: number }]>, timeMs: number): void {
    const seen = new Set<string>();
    for (const [id, crate] of crates) {
      seen.add(id);
      let mesh = this.meshes.get(id);
      if (!mesh) {
        mesh = this.createMesh();
        this.meshes.set(id, mesh);
      }
      const phase = timeMs * 0.003 + id.length;
      mesh.root.position.set(crate.x, crate.y, crate.z);
      mesh.box.position.y = SIZE / 2 + 0.12 + Math.sin(phase) * 0.08;
      mesh.box.rotation.y = timeMs * 0.0012;
      mesh.logo.position.y = LOGO_HEIGHT + Math.sin(phase + 1) * 0.1;
    }
    for (const [id, mesh] of this.meshes) {
      if (seen.has(id)) continue;
      this.root.remove(mesh.root);
      this.meshes.delete(id);
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.plankGeometry.dispose();
    this.wood.dispose();
    this.plank.dispose();
    this.ink.dispose();
    this.logoMaterial.map?.dispose();
    this.logoMaterial.dispose();
  }

  private createMesh(): CrateMesh {
    const root = new Group();
    const box = new Group();
    const outline = new Mesh(this.geometry, this.ink);
    outline.scale.setScalar(1.1);
    const top = new Mesh(this.plankGeometry, this.plank);
    top.position.y = SIZE * 0.3;
    const bottom = new Mesh(this.plankGeometry, this.plank);
    bottom.position.y = -SIZE * 0.3;
    box.add(new Mesh(this.geometry, this.wood), outline, top, bottom);
    const logo = new Sprite(this.logoMaterial);
    logo.scale.setScalar(0.75);
    root.add(box, logo);
    this.root.add(root);
    return { root, box, logo };
  }
}
