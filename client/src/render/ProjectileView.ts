import { Color, InstancedMesh, Matrix4, MeshBasicMaterial, SphereGeometry } from 'three';
import type { Projectile } from '@paint-rush/shared/sim';

const MAX_SHOTS = 256;

/** Draws every paint shot in flight as a small glossy ball, in one draw call. */
export class ProjectileView {
  readonly mesh: InstancedMesh;
  private readonly teamColors: Color[];
  private readonly matrix = new Matrix4();

  constructor(teamColors: number[]) {
    this.teamColors = teamColors.map((hex) => new Color(hex));
    this.mesh = new InstancedMesh(
      new SphereGeometry(0.11, 10, 8),
      new MeshBasicMaterial(),
      MAX_SHOTS,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  /** `alpha` blends between each shot's previous and current tick position (0–1). */
  update(projectiles: readonly Projectile[], alpha: number): void {
    const count = Math.min(projectiles.length, MAX_SHOTS);
    for (let i = 0; i < count; i++) {
      const p = projectiles[i];
      this.matrix.makeTranslation(
        p.px + (p.x - p.px) * alpha,
        p.py + (p.y - p.py) * alpha,
        p.pz + (p.z - p.pz) * alpha,
      );
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, this.teamColors[p.team]);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
