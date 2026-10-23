import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Shape,
  ShapeGeometry,
  type DataTexture,
} from 'three';
import { OUTLINE_COLOR } from './palette';

/** Neutral color while nobody holds it. */
const NEUTRAL = 0xffffff;
const POLE_HEIGHT = 1.8;
/** How far behind (and how high up) the carrier's feet it rides (m). */
const ON_BACK = { back: 0.42, up: 0.35, scale: 0.75 };

/** The banner: a fat paint drop lying on its side, point away from the pole. */
function dropShape(): Shape {
  const shape = new Shape();
  shape.moveTo(0, 0.32);
  shape.bezierCurveTo(0.35, 0.34, 0.8, 0.12, 0.95, 0);
  shape.bezierCurveTo(0.8, -0.12, 0.35, -0.34, 0, -0.32);
  shape.lineTo(0, 0.32);
  return shape;
}

/**
 * The neutral flag (an original design: a pole with a paint-drop banner) plus a tall light
 * beam above it, so it can be found from anywhere. Carried, it rides on the carrier's back in
 * their team color, and the beam marks the carrier.
 */
export class FlagView {
  readonly root = new Group();
  private readonly flag = new Group();
  private readonly banner: Mesh;
  private readonly cloth: MeshToonMaterial;
  private readonly beamMaterial: MeshBasicMaterial;
  private wave = 0;

  constructor(toonRamp: DataTexture) {
    this.cloth = new MeshToonMaterial({ color: NEUTRAL, gradientMap: toonRamp, side: DoubleSide });
    const ink = new MeshBasicMaterial({ color: OUTLINE_COLOR });

    const pole = new Mesh(new CylinderGeometry(0.04, 0.05, POLE_HEIGHT, 10), ink);
    pole.position.y = POLE_HEIGHT / 2;
    const knob = new Mesh(new CylinderGeometry(0.08, 0.08, 0.08, 12), this.cloth);
    knob.position.y = POLE_HEIGHT + 0.04;
    const foot = new Mesh(new CylinderGeometry(0.28, 0.32, 0.08, 20), ink);
    foot.position.y = 0.04;
    this.banner = new Mesh(new ShapeGeometry(dropShape()), this.cloth);
    this.banner.position.set(0.04, POLE_HEIGHT - 0.4, 0);
    this.flag.add(pole, knob, foot, this.banner);

    this.beamMaterial = new MeshBasicMaterial({
      color: NEUTRAL,
      transparent: true,
      opacity: 0.22,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    const beam = new Mesh(new CylinderGeometry(0.22, 0.22, 14, 16, 1, true), this.beamMaterial);
    beam.position.y = 7;
    this.root.add(this.flag, beam);
    this.root.visible = false;
  }

  /**
   * Shows the flag standing at a spot (home or dropped), or on a carrier's back (`yaw` is
   * the carrier's facing). `color` is the carrier's team color, or null for neutral.
   */
  update(
    dt: number,
    visible: boolean,
    x: number,
    y: number,
    z: number,
    carried: boolean,
    yaw: number,
    color: number | null,
  ): void {
    this.root.visible = visible;
    if (!visible) return;
    this.root.position.set(x, y, z);
    if (carried) {
      // Behind the carrier: they face −Z, so "back" is +Z turned by their yaw.
      this.flag.position.set(
        Math.sin(yaw) * ON_BACK.back,
        ON_BACK.up,
        Math.cos(yaw) * ON_BACK.back,
      );
      this.flag.rotation.y = yaw;
      this.flag.scale.setScalar(ON_BACK.scale);
    } else {
      this.flag.position.set(0, 0, 0);
      this.flag.scale.setScalar(1);
    }
    // A gentle flutter.
    this.wave += dt;
    this.banner.rotation.y = Math.sin(this.wave * 3) * 0.25;
    if (!carried) this.flag.rotation.y += dt * 0.6;
    const hex = color ?? NEUTRAL;
    this.cloth.color.setHex(hex);
    this.beamMaterial.color.setHex(hex);
  }
}
