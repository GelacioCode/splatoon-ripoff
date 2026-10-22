import {
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  type DataTexture,
  MeshToonMaterial,
} from 'three';
import type { Vec3 } from '@paint-rush/shared';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  life: number;
  maxLife: number;
  color: Color;
}

const GRAVITY = 18;

/**
 * Paint droplets: one instanced mesh, so hundreds of them cost a single draw call. The count is
 * capped; when full, the oldest droplet is reused.
 */
export class Particles {
  readonly mesh: InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly capacity: number;
  private next = 0;
  private readonly matrix = new Matrix4();

  constructor(capacity: number, toonRamp?: DataTexture) {
    this.capacity = capacity;
    const material = toonRamp
      ? new MeshToonMaterial({ gradientMap: toonRamp })
      : new MeshBasicMaterial();
    this.mesh = new InstancedMesh(new IcosahedronGeometry(1, 1), material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  /** Throws `count` droplets out of a surface (along its normal), in `color`. */
  burst(point: Vec3, normal: Vec3, color: number, count: number, speed = 4): void {
    for (let i = 0; i < count; i++) {
      const particle = this.claim();
      const spread = speed * 0.6;
      particle.x = point.x + normal.x * 0.05;
      particle.y = point.y + normal.y * 0.05;
      particle.z = point.z + normal.z * 0.05;
      particle.vx = normal.x * speed * (0.5 + Math.random()) + (Math.random() - 0.5) * spread;
      particle.vy = normal.y * speed * (0.5 + Math.random()) + (Math.random() - 0.5) * spread;
      particle.vz = normal.z * speed * (0.5 + Math.random()) + (Math.random() - 0.5) * spread;
      particle.size = 0.05 + Math.random() * 0.07;
      particle.maxLife = 0.35 + Math.random() * 0.35;
      particle.life = particle.maxLife;
      particle.color.setHex(color);
    }
  }

  update(dt: number): void {
    let visible = 0;
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy -= GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const scale = p.size * Math.max(0, p.life / p.maxLife);
      this.matrix.makeScale(scale, scale, scale).setPosition(p.x, p.y, p.z);
      this.mesh.setMatrixAt(visible, this.matrix);
      this.mesh.setColorAt(visible, p.color);
      visible++;
    }
    this.mesh.count = visible;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private claim(): Particle {
    if (this.particles.length < this.capacity) {
      const particle: Particle = {
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 0,
        life: 0,
        maxLife: 1,
        color: new Color(),
      };
      this.particles.push(particle);
      return particle;
    }
    const particle = this.particles[this.next];
    this.next = (this.next + 1) % this.capacity;
    return particle;
  }
}
