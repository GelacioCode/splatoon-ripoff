import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Projectile } from '@paint-rush/shared/sim';

const MAX_SHOTS = 256;
/** How much a shot stretches into a streak per m/s of speed. */
const STREAK_PER_SPEED = 0.05;
const UP = new Vector3(0, 1, 0);

/**
 * Draws every paint shot in flight as a glossy ball stretched into a short streak along its
 * flight direction, all in one draw call.
 */
export class ProjectileView {
  readonly mesh: InstancedMesh;
  private readonly teamColors: Color[];
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly direction = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();

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
      this.position.set(
        p.px + (p.x - p.px) * alpha,
        p.py + (p.y - p.py) * alpha,
        p.pz + (p.z - p.pz) * alpha,
      );
      // Stretch the ball along its velocity: faster shots make longer streaks.
      this.direction.set(p.vx, p.vy, p.vz);
      const speed = this.direction.length();
      if (speed > 0) this.rotation.setFromUnitVectors(UP, this.direction.divideScalar(speed));
      this.scale.set(1, 1 + speed * STREAK_PER_SPEED, 1);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, this.teamColors[p.team]);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
