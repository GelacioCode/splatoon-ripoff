import {
  BackSide,
  CanvasTexture,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Shape,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  type DataTexture,
} from 'three';
import { wrapAngle, type Vec3 } from '@paint-rush/shared';
import type { ObjectiveIcon } from '../game/objective';
import { drawObjectiveIcon, OBJECTIVE_YELLOW } from './objectiveIcons';
import { OUTLINE_COLOR } from './palette';

/** Height of the arrow above your feet (m): just over your head and hat. */
const HEIGHT = 2.05;
/** It points at this height above the target's feet / floor spot (m). */
const TARGET_LIFT = 0.8;
/** Size of the icon badge above the arrow (m). */
const BADGE_SIZE = 0.46;
const BADGE_ABOVE = 0.5;
const ICON_PIXELS = 128;
/** How quickly it turns toward the target, and pops in or out (per second). */
const TURN_RATE = 10;
const FADE_RATE = 9;
/** Pointing down at most this steeply, and up at most this much (rad). */
const PITCH_DOWN = -1.35;
const PITCH_UP = 0.7;

/** A chunky arrow lying flat, pointing toward −Z. */
function arrowGeometry(): ExtrudeGeometry {
  const shape = new Shape();
  shape.moveTo(0, 0.46);
  shape.lineTo(0.38, 0.04);
  shape.lineTo(0.15, 0.04);
  shape.lineTo(0.15, -0.4);
  shape.lineTo(-0.15, -0.4);
  shape.lineTo(-0.15, 0.04);
  shape.lineTo(-0.38, 0.04);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  geometry.center();
  // Drawn pointing up (+Y): lay it down so it points forward (−Z).
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * Your objective, over your own head: a bobbing yellow arrow that turns toward where you
 * should go (the flag, the enemy base, your own base), with a badge showing why (flag,
 * attack, defend). Only you see your arrow.
 */
export class ObjectiveArrow {
  readonly root = new Group();
  /** Turns toward the target. */
  private readonly pointer = new Group();
  /** Nudges forward and back inside `pointer`: the "this way!" motion. */
  private readonly nudge = new Group();
  private readonly badge: Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private readonly materials: { dispose(): void }[] = [];
  private readonly geometry = arrowGeometry();
  private icon: ObjectiveIcon | null = null;
  private yaw = 0;
  private pitch = 0;
  private time = 0;
  /** 0 hidden … 1 fully shown (it pops in and out by scaling). */
  private shown = 0;
  /** Bounce of the badge when the icon changes. */
  private pop = 0;

  constructor(toonRamp: DataTexture) {
    const paint = new MeshToonMaterial({
      color: OBJECTIVE_YELLOW,
      gradientMap: toonRamp,
      emissive: 0x5c4300,
    });
    const ink = new MeshBasicMaterial({ color: OUTLINE_COLOR, side: BackSide });
    const arrow = new Mesh(this.geometry, paint);
    const outline = new Mesh(this.geometry, ink);
    outline.scale.set(1.12, 1.5, 1.1);
    this.nudge.add(arrow, outline);
    this.pointer.add(this.nudge);
    this.pointer.rotation.order = 'YXZ';

    this.canvas.width = ICON_PIXELS;
    this.canvas.height = ICON_PIXELS;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const badgeMaterial = new SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
    });
    this.badge = new Sprite(badgeMaterial);
    this.badge.position.y = BADGE_ABOVE;
    this.badge.renderOrder = 10;
    this.materials.push(paint, ink, badgeMaterial);

    this.root.add(this.pointer, this.badge);
    this.root.visible = false;
  }

  /**
   * `feet`: where you are; `target`: where to go (null hides the arrow). `quiet` shrinks it
   * away while you aim, so it never covers what you're aiming at.
   */
  update(dt: number, feet: Vec3, target: Vec3 | null, icon: ObjectiveIcon, quiet: boolean): void {
    const want = target && !quiet ? 1 : 0;
    this.shown += (want - this.shown) * (1 - Math.exp(-FADE_RATE * dt));
    if (want === 0 && this.shown < 0.02) this.shown = 0;
    this.root.visible = this.shown > 0;
    if (!this.root.visible) return;
    this.time += dt;

    if (icon !== this.icon) {
      this.icon = icon;
      drawObjectiveIcon(this.canvas, icon);
      this.texture.needsUpdate = true;
      this.pop = 1;
    }
    this.pop = Math.max(0, this.pop - dt * 3);

    const bob = Math.sin(this.time * 3) * 0.1;
    this.root.position.set(feet.x, feet.y + HEIGHT + bob, feet.z);
    this.root.scale.setScalar(this.shown);

    if (target) {
      const dx = target.x - feet.x;
      const dz = target.z - feet.z;
      const flat = Math.hypot(dx, dz);
      const dy = target.y + TARGET_LIFT - (feet.y + HEIGHT);
      const wantYaw = flat > 0.05 ? Math.atan2(-dx, -dz) : this.yaw;
      const wantPitch = Math.min(PITCH_UP, Math.max(PITCH_DOWN, Math.atan2(dy, flat)));
      const turn = 1 - Math.exp(-TURN_RATE * dt);
      this.yaw = wrapAngle(this.yaw + wrapAngle(wantYaw - this.yaw) * turn);
      this.pitch += (wantPitch - this.pitch) * turn;
    }
    this.pointer.rotation.y = this.yaw;
    this.pointer.rotation.x = this.pitch;
    // Pulses and pokes the way to go.
    this.pointer.scale.setScalar(1 + Math.sin(this.time * 6) * 0.06);
    this.nudge.position.z = -Math.max(0, Math.sin(this.time * 5)) * 0.14;
    this.badge.scale.setScalar(BADGE_SIZE * (1 + this.pop * 0.5));
  }

  dispose(): void {
    this.geometry.dispose();
    this.texture.dispose();
    for (const material of this.materials) material.dispose();
  }
}
