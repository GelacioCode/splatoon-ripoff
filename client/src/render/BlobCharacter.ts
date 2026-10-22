import {
  BackSide,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  SphereGeometry,
  type DataTexture,
} from 'three';
import { clamp, CONFIG, dampAngle } from '@paint-rush/shared';
import { OUTLINE_COLOR } from './palette';

/** The parts of a player's state the animation needs, already interpolated for this frame. */
export interface CharacterPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
}

const BODY_RADIUS = 0.45;
const BODY_CENTER_Y = 0.56;

/**
 * The paint-blob creature: a round gummy body with stubby hands and feet, googly eyes and a
 * little blaster, all built from simple meshes. It faces −Z.
 */
export class BlobCharacter {
  readonly root = new Group();
  /** Squashes, stretches and leans from the feet up. */
  private readonly body = new Group();
  private readonly leftFoot: Mesh;
  private readonly rightFoot: Mesh;
  private walkPhase = 0;
  private squash = 0;
  private squashVelocity = 0;
  private wasGrounded = true;
  private lastVy = 0;
  private yaw = 0;

  constructor(color: number, toonRamp: DataTexture) {
    const skin = new MeshToonMaterial({ color, gradientMap: toonRamp });
    const ink = new MeshBasicMaterial({ color: OUTLINE_COLOR });
    const white = new MeshBasicMaterial({ color: 0xffffff });

    const bodyGeometry = new IcosahedronGeometry(BODY_RADIUS, 4);
    const bodyMesh = new Mesh(bodyGeometry, skin);
    const outline = new Mesh(
      bodyGeometry,
      new MeshBasicMaterial({ color: OUTLINE_COLOR, side: BackSide }),
    );
    outline.scale.setScalar(1.07);
    bodyMesh.position.y = BODY_CENTER_Y;
    outline.position.y = BODY_CENTER_Y;
    this.body.add(bodyMesh, outline);

    const eyeGeometry = new SphereGeometry(0.1, 14, 10);
    const pupilGeometry = new SphereGeometry(0.05, 10, 8);
    for (const side of [-1, 1]) {
      const eye = new Mesh(eyeGeometry, white);
      eye.position.set(0.16 * side, BODY_CENTER_Y + 0.14, -0.37);
      const pupil = new Mesh(pupilGeometry, ink);
      pupil.position.z = -0.07;
      eye.add(pupil);
      this.body.add(eye);
    }

    const handGeometry = new SphereGeometry(0.1, 12, 8);
    for (const side of [-1, 1]) {
      const hand = new Mesh(handGeometry, skin);
      hand.position.set(0.44 * side, BODY_CENTER_Y - 0.1, -0.12);
      this.body.add(hand);
    }
    const blaster = new Mesh(new CylinderGeometry(0.06, 0.08, 0.44, 12), ink);
    blaster.rotation.x = Math.PI / 2;
    blaster.position.set(0.44, BODY_CENTER_Y - 0.06, -0.34);
    this.body.add(blaster);

    const footGeometry = new SphereGeometry(0.12, 12, 8);
    this.leftFoot = new Mesh(footGeometry, skin);
    this.rightFoot = new Mesh(footGeometry, skin);
    for (const foot of [this.leftFoot, this.rightFoot]) foot.scale.set(1, 0.6, 1.3);

    this.root.add(this.body, this.leftFoot, this.rightFoot);
  }

  /** Call every rendered frame with the interpolated pose. */
  update(dt: number, pose: CharacterPose): void {
    // Big frame gaps (e.g. a background tab) would make the springs explode.
    const t = Math.min(dt, 0.05);
    this.root.position.set(pose.x, pose.y - CONFIG.character.skinWidth, pose.z);
    this.yaw = dampAngle(this.yaw, pose.yaw, 25, t);
    this.root.rotation.y = this.yaw;

    // Landing kicks a springy squash, harder after longer falls.
    if (pose.grounded && !this.wasGrounded) {
      this.squashVelocity += clamp(-this.lastVy, 0, 20) * 0.3;
    }
    this.wasGrounded = pose.grounded;
    this.lastVy = pose.vy;
    this.squashVelocity += (-180 * this.squash - 12 * this.squashVelocity) * t;
    this.squash += this.squashVelocity * t;

    // Stretch tall while rising, squash wide on landing; keep the volume roughly constant.
    const stretch = pose.grounded ? 0 : clamp(pose.vy * 0.02, -0.12, 0.18);
    const scaleY = clamp(1 + stretch - this.squash, 0.6, 1.4);
    const scaleXZ = 1 / Math.sqrt(scaleY);
    this.body.scale.set(scaleXZ, scaleY, scaleXZ);

    // Velocity in the character's own frame (−Z is forward) drives the walk cycle and lean.
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const localX = pose.vx * cos - pose.vz * sin;
    const localZ = pose.vx * sin + pose.vz * cos;
    const speed = Math.hypot(pose.vx, pose.vz);
    const stride = clamp(speed / CONFIG.movement.walkSpeed, 0, 1);

    // Walk cycle: the feet swing and lift in turn and the body bobs.
    if (pose.grounded) this.walkPhase += speed * t * 2.6;
    const swing = Math.sin(this.walkPhase) * 0.22 * stride;
    const step = Math.cos(this.walkPhase) * 0.1 * stride;
    const leftLift = pose.grounded ? Math.max(0, step) : 0.05;
    const rightLift = pose.grounded ? Math.max(0, -step) : 0.05;
    this.leftFoot.position.set(-0.2, 0.07 + leftLift, swing);
    this.rightFoot.position.set(0.2, 0.07 + rightLift, -swing);
    this.body.position.y = pose.grounded ? Math.abs(Math.sin(this.walkPhase)) * 0.05 * stride : 0;

    // Lean into the direction of travel.
    this.body.rotation.x = clamp(localZ * 0.03, -0.2, 0.2);
    this.body.rotation.z = clamp(-localX * 0.03, -0.2, 0.2);
  }
}
