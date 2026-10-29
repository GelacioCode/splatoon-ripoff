import {
  BackSide,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  type DataTexture,
} from 'three';
import { CONFIG, lerp } from '@paint-rush/shared';
import type { Bomb } from '@paint-rush/shared/sim';
import { OUTLINE_COLOR, TEAM_COLORS } from './palette';

/** The warning ring on the ground shows for this last part of the fuse (s). */
const WARNING_SECONDS = 1.5;

/** One drawn bomb: a dark ball with a team-colored band, a fuse spark and a warning ring. */
interface BombMesh {
  root: Group;
  band: MeshBasicMaterial;
  spark: Mesh;
  ring: Mesh;
  ringMaterial: MeshBasicMaterial;
}

/**
 * Draws the bombs in flight (ours and everyone's, from the same list the game steps). The
 * spark blinks faster as the fuse runs out, and a ring in the thrower's color shows on the
 * ground where it will go off, so you can get out of the way.
 */
export class BombView {
  readonly root = new Group();
  private readonly meshes: BombMesh[] = [];
  private readonly bodyGeometry = new SphereGeometry(CONFIG.bomb.radius, 14, 10);
  private readonly bandGeometry = new TorusGeometry(CONFIG.bomb.radius * 0.98, 0.04, 6, 20);
  private readonly fuseGeometry = new CylinderGeometry(0.05, 0.06, 0.12, 8);
  private readonly sparkGeometry = new SphereGeometry(0.07, 8, 6);
  private readonly ringGeometry = new RingGeometry(
    CONFIG.bomb.paintRadius - 0.25,
    CONFIG.bomb.paintRadius,
    40,
  );
  private readonly body: MeshToonMaterial;
  private readonly ink = new MeshBasicMaterial({ color: OUTLINE_COLOR, side: BackSide });
  private readonly sparkMaterial = new MeshBasicMaterial({ color: 0xffd23f });

  constructor(toonRamp: DataTexture) {
    this.body = new MeshToonMaterial({ color: 0x2b2140, gradientMap: toonRamp });
    this.ringGeometry.rotateX(-Math.PI / 2);
  }

  /** Puts a mesh on every bomb (between its last two positions by `alpha`), hides the rest. */
  update(bombs: readonly Bomb[], alpha: number, timeMs: number): void {
    while (this.meshes.length < bombs.length) this.meshes.push(this.createMesh());
    this.meshes.forEach((mesh, i) => {
      const bomb = bombs[i];
      mesh.root.visible = bomb !== undefined;
      mesh.ring.visible = false;
      if (!bomb) return;
      mesh.root.position.set(
        lerp(bomb.px, bomb.x, alpha),
        lerp(bomb.py, bomb.y, alpha),
        lerp(bomb.pz, bomb.z, alpha),
      );
      mesh.root.rotation.z = bomb.resting ? 0 : timeMs * 0.01;
      const color = TEAM_COLORS[bomb.team] ?? TEAM_COLORS[0];
      mesh.band.color.setHex(color);
      // Blinks every 0.5 s at first, about every 0.1 s at the end.
      const period = lerp(100, 500, Math.min(1, bomb.fuse / CONFIG.bomb.fuseSeconds));
      mesh.spark.visible = Math.floor(timeMs / period) % 2 === 0;
      if (bomb.fuse < WARNING_SECONDS) {
        mesh.ring.visible = true;
        mesh.ringMaterial.color.setHex(color);
        mesh.ringMaterial.opacity = 0.35 + 0.35 * Math.sin(timeMs * 0.02);
        // On the ground under the bomb (it lies on it once it's stopped).
        mesh.ring.position.set(
          mesh.root.position.x,
          mesh.root.position.y - CONFIG.bomb.radius + 0.04,
          mesh.root.position.z,
        );
      }
    });
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.band.dispose();
      mesh.ringMaterial.dispose();
    }
    for (const geometry of [
      this.bodyGeometry,
      this.bandGeometry,
      this.fuseGeometry,
      this.sparkGeometry,
      this.ringGeometry,
    ]) {
      geometry.dispose();
    }
    this.body.dispose();
    this.ink.dispose();
    this.sparkMaterial.dispose();
  }

  private createMesh(): BombMesh {
    const root = new Group();
    const band = new MeshBasicMaterial({ color: TEAM_COLORS[0] });
    const outline = new Mesh(this.bodyGeometry, this.ink);
    outline.scale.setScalar(1.14);
    const stripe = new Mesh(this.bandGeometry, band);
    stripe.rotation.x = Math.PI / 2;
    const fuse = new Mesh(this.fuseGeometry, this.body);
    fuse.position.y = CONFIG.bomb.radius + 0.04;
    const spark = new Mesh(this.sparkGeometry, this.sparkMaterial);
    spark.position.y = CONFIG.bomb.radius + 0.14;
    root.add(new Mesh(this.bodyGeometry, this.body), outline, stripe, fuse, spark);
    const ringMaterial = new MeshBasicMaterial({
      color: TEAM_COLORS[0],
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: DoubleSide,
    });
    const ring = new Mesh(this.ringGeometry, ringMaterial);
    this.root.add(root, ring);
    return { root, band, spark, ring, ringMaterial };
  }
}
