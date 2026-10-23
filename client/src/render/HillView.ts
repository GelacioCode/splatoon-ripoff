import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from 'three';
import { CONFIG, HILL_CONTESTED } from '@paint-rush/shared';
import { drawObjectiveIcon } from './objectiveIcons';
import { TEAM_COLORS } from './palette';

/** Color while nobody holds it. */
const NEUTRAL = 0xffffff;
const WALL_HEIGHT = 2.6;
const BEAM_HEIGHT = 14;
const ICON_SIZE = 0.9;
const ICON_PIXELS = 128;

/**
 * King of the Hill's circle: a glowing ring on the ground with a see-through wall around it,
 * a light beam and a crown over the middle, so it can be found from anywhere. White while
 * free, in the holder's color while held, and flashing both colors while contested.
 */
export class HillView {
  readonly root = new Group();
  private readonly ring: Mesh;
  private readonly materials: MeshBasicMaterial[];
  private readonly crown: Sprite;
  private readonly crownTexture: CanvasTexture;
  private readonly crownMaterial: SpriteMaterial;
  private time = 0;

  constructor() {
    const radius = CONFIG.koth.hillRadius;
    const glow = (opacity: number, additive = false) =>
      new MeshBasicMaterial({
        color: NEUTRAL,
        transparent: true,
        opacity,
        depthWrite: false,
        side: DoubleSide,
        blending: additive ? AdditiveBlending : undefined,
      });
    const floorMaterial = glow(0.16);
    const ringMaterial = glow(0.9);
    const wallMaterial = glow(0.12, true);
    const beamMaterial = glow(0.2, true);
    this.materials = [floorMaterial, ringMaterial, wallMaterial, beamMaterial];

    const floor = new Mesh(new CircleGeometry(radius, 64), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.04;
    this.ring = new Mesh(new RingGeometry(radius - 0.25, radius, 64), ringMaterial);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    const wall = new Mesh(
      new CylinderGeometry(radius, radius, WALL_HEIGHT, 64, 1, true),
      wallMaterial,
    );
    wall.position.y = WALL_HEIGHT / 2 - 0.3;
    const beam = new Mesh(new CylinderGeometry(0.3, 0.3, BEAM_HEIGHT, 16, 1, true), beamMaterial);
    beam.position.y = BEAM_HEIGHT / 2;

    const canvas = document.createElement('canvas');
    canvas.width = ICON_PIXELS;
    canvas.height = ICON_PIXELS;
    drawObjectiveIcon(canvas, 'crown');
    this.crownTexture = new CanvasTexture(canvas);
    this.crownTexture.colorSpace = SRGBColorSpace;
    this.crownMaterial = new SpriteMaterial({ map: this.crownTexture, depthWrite: false });
    this.crown = new Sprite(this.crownMaterial);
    this.crown.scale.setScalar(ICON_SIZE);

    this.root.add(floor, this.ring, wall, beam, this.crown);
    this.root.visible = false;
  }

  /** Shows the hill at its spot (`visible` false hides it); `holder` a team, −1 or contested. */
  update(dt: number, visible: boolean, x: number, y: number, z: number, holder: number): void {
    this.root.visible = visible;
    if (!visible) return;
    this.time += dt;
    this.root.position.set(x, y, z);
    let color = NEUTRAL;
    if (holder === 0 || holder === 1) color = TEAM_COLORS[holder];
    else if (holder === HILL_CONTESTED) color = TEAM_COLORS[Math.floor(this.time * 4) % 2];
    for (const material of this.materials) material.color.setHex(color);
    // The ring breathes; the crown bobs and turns.
    this.ring.scale.setScalar(1 + Math.sin(this.time * 3) * 0.015);
    this.crown.position.y = 3.2 + Math.sin(this.time * 2) * 0.15;
  }

  dispose(): void {
    for (const material of this.materials) material.dispose();
    this.crownTexture.dispose();
    this.crownMaterial.dispose();
    this.root.traverse((object) => {
      if (object instanceof Mesh) object.geometry.dispose();
    });
  }
}
