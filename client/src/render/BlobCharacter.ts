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
  type Material,
  type Object3D,
} from 'three';
import { clamp, CONFIG, damp, dampAngle, DEFAULT_LOOK, lerp, type Look } from '@paint-rush/shared';
import {
  BODY_CENTER_Y,
  BODY_RADIUS,
  BODY_SHAPES,
  EYE_PARTS,
  GOGGLE_PARTS,
  HAT_PARTS,
  SHOE_PARTS,
  type PartMaterials,
} from './lookParts';
import { NameLabel } from './NameLabel';
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
  /** 0 = standing, 1 = melted into a puddle. */
  swimBlend: number;
  /** Hidden in own paint: the puddle sinks almost flat. */
  submerged: boolean;
  /** Swimming up a painted wall: the puddle stands up against it. */
  climbing: boolean;
}

/** Height of the name label above the feet (clears the tallest hat on the tallest body). */
const LABEL_HEIGHT = 1.62;
/** Puddle shape: height and width relative to the standing body. */
const PUDDLE_HEIGHT = 0.28;
const SUBMERGED_HEIGHT = 0.1;
const PUDDLE_WIDTH = 1.45;

/** All options of one part; only the chosen one is visible. */
interface PartSlot {
  group: Group;
  options: (Object3D | null)[];
}

function createSlot(options: (Object3D | null)[]): PartSlot {
  const group = new Group();
  for (const option of options) if (option) group.add(option);
  return { group, options };
}

function showOption(slot: PartSlot, index: number): void {
  const shown = slot.options[index] !== undefined ? index : 0;
  slot.options.forEach((option, i) => {
    if (option) option.visible = i === shown;
  });
}

/**
 * The paint-blob creature: a round gummy body with stubby hands and feet, googly eyes and a
 * little blaster, all built from simple meshes, plus the player's chosen eyes, hat, goggles,
 * shoes and body shape. It faces −Z, and melts into a puddle to swim.
 */
export class BlobCharacter {
  readonly root = new Group();
  /** Squashes, stretches and leans from the feet up. */
  private readonly body = new Group();
  private readonly leftFoot: Group;
  private readonly rightFoot: Group;
  private readonly skin: MeshToonMaterial;
  /** Eyes, hands, blaster, hat, goggles and feet: hidden while melted. */
  private readonly details: Object3D[] = [];
  private readonly blasters: Object3D[];
  private readonly eyes: PartSlot;
  private readonly hat: PartSlot;
  private readonly goggles: PartSlot;
  private readonly shoes: [PartSlot, PartSlot];
  private shape = BODY_SHAPES[0];
  private label: NameLabel | null = null;
  private walkPhase = 0;
  private squash = 0;
  private squashVelocity = 0;
  private wasGrounded = true;
  private lastVy = 0;
  private yaw = 0;
  private puddleHeight = PUDDLE_HEIGHT;
  private climbTilt = 0;

  constructor(color: number, toonRamp: DataTexture, weapon = 0, look: Look = DEFAULT_LOOK) {
    const skin = new MeshToonMaterial({ color, gradientMap: toonRamp });
    this.skin = skin;
    const ink = new MeshBasicMaterial({ color: OUTLINE_COLOR });
    const white = new MeshBasicMaterial({ color: 0xffffff });
    const parts: PartMaterials = { skin, ink, white, toonRamp };

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

    // Look parts sit on the body, so they squash, stretch and lean with it.
    this.eyes = createSlot(EYE_PARTS.map((build) => build(parts)));
    this.hat = createSlot(HAT_PARTS.map((build) => build(parts)));
    this.goggles = createSlot(GOGGLE_PARTS.map((build) => build(parts)));
    for (const slot of [this.eyes, this.hat, this.goggles]) {
      this.body.add(slot.group);
      this.details.push(slot.group);
    }

    const handGeometry = new SphereGeometry(0.1, 12, 8);
    for (const side of [-1, 1]) {
      const hand = new Mesh(handGeometry, skin);
      hand.position.set(0.44 * side, BODY_CENTER_Y - 0.1, -0.12);
      this.body.add(hand);
      this.details.push(hand);
    }
    // One blaster per role (see WEAPON_KINDS); only the current one is shown.
    const blaster = new Group();
    blaster.position.set(0.44, BODY_CENTER_Y - 0.06, -0.34);
    this.blasters = [createAssaultBlaster(ink), createSniperBlaster(ink), createMachineGun(ink)];
    blaster.add(...this.blasters);
    this.body.add(blaster);
    this.details.push(blaster);
    this.setWeapon(weapon);

    this.shoes = [
      createSlot(SHOE_PARTS.map((build) => build(parts))),
      createSlot(SHOE_PARTS.map((build) => build(parts))),
    ];
    this.leftFoot = this.shoes[0].group;
    this.rightFoot = this.shoes[1].group;
    this.details.push(this.leftFoot, this.rightFoot);

    this.root.add(this.body, this.leftFoot, this.rightFoot);
    this.setLook(look);
  }

  /** Shows the chosen eyes, hat, goggles, shoes and body shape (see LOOK_OPTIONS). */
  setLook(look: Look): void {
    showOption(this.eyes, look.eyes);
    showOption(this.hat, look.hat);
    showOption(this.goggles, look.goggles);
    for (const shoe of this.shoes) showOption(shoe, look.shoes);
    this.shape = BODY_SHAPES[look.body] ?? BODY_SHAPES[0];
  }

  /** Floats a name over the head, in the given color (e.g. the team's). Empty removes it. */
  setName(name: string, color: number): void {
    this.removeLabel();
    if (!name) return;
    this.label = new NameLabel(name, color);
    this.label.sprite.position.y = LABEL_HEIGHT;
    this.root.add(this.label.sprite);
  }

  /** Frees the GPU resources that aren't shared (call when removing the character). */
  dispose(): void {
    this.removeLabel();
  }

  private removeLabel(): void {
    if (!this.label) return;
    this.root.remove(this.label.sprite);
    this.label.dispose();
    this.label = null;
  }

  /** Repaints the body, hands and feet (e.g. after switching team). */
  setColor(color: number): void {
    this.skin.color.setHex(color);
  }

  /** Shows the blaster of a role (index in WEAPON_KINDS). Cheap to call every frame. */
  setWeapon(weapon: number): void {
    const shown = this.blasters[weapon] ? weapon : 0;
    this.blasters.forEach((blaster, i) => (blaster.visible = i === shown));
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

    // Standing shape: stretch tall while rising, squash wide on landing (volume stays similar).
    const stretch = pose.grounded ? 0 : clamp(pose.vy * 0.02, -0.12, 0.18);
    const standY = clamp(1 + stretch - this.squash, 0.6, 1.4);
    const standXZ = 1 / Math.sqrt(standY);
    // Puddle shape: flat and wide; nearly flat when hidden in own paint.
    this.puddleHeight = damp(
      this.puddleHeight,
      pose.submerged ? SUBMERGED_HEIGHT : PUDDLE_HEIGHT,
      14,
      t,
    );
    const melt = pose.swimBlend;
    // The chosen body shape (tall, wide) applies standing; every puddle looks the same.
    const scaleY = lerp(standY * this.shape.height, this.puddleHeight, melt);
    const scaleXZ = lerp(standXZ * this.shape.width, PUDDLE_WIDTH, melt);
    this.body.scale.set(scaleXZ, scaleY, scaleXZ);
    for (const part of this.details) part.visible = melt < 0.5;
    // No name over a puddle: hiding in paint has to actually hide you.
    if (this.label) this.label.sprite.visible = melt < 0.5;

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
    const footX = 0.2 * this.shape.width;
    this.leftFoot.position.set(-footX, 0.07 + leftLift, swing);
    this.rightFoot.position.set(footX, 0.07 + rightLift, -swing);
    const bob = pose.grounded ? Math.abs(Math.sin(this.walkPhase)) * 0.05 * stride : 0;

    // Climbing: the puddle stands up flat against the wall in front.
    this.climbTilt = damp(this.climbTilt, pose.climbing ? 1 : 0, 18, t);
    this.body.position.set(0, lerp(bob * (1 - melt), 0.45, this.climbTilt), -0.3 * this.climbTilt);

    // Lean into the direction of travel (not while melted).
    const lean = 1 - melt;
    this.body.rotation.x = lerp(
      clamp(localZ * 0.03, -0.2, 0.2) * lean,
      Math.PI / 2,
      this.climbTilt,
    );
    this.body.rotation.z = clamp(-localX * 0.03, -0.2, 0.2) * lean;
  }
}

/** A barrel along −Z (forward), starting at the hand and `length` long. */
function barrel(radiusTip: number, radiusBase: number, length: number, material: Material): Mesh {
  const mesh = new Mesh(new CylinderGeometry(radiusTip, radiusBase, length, 12), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = 0.22 - length / 2;
  return mesh;
}

/** Assault: the original short, slightly tapered blaster. */
function createAssaultBlaster(material: Material): Object3D {
  return barrel(0.06, 0.08, 0.44, material);
}

/** Sniper: a long thin barrel with a scope on top. */
function createSniperBlaster(material: Material): Object3D {
  const group = new Group();
  const scope = barrel(0.035, 0.035, 0.2, material);
  scope.position.set(0, 0.08, -0.05);
  group.add(barrel(0.035, 0.055, 0.78, material), scope);
  return group;
}

/** Machine gun: a chunky barrel with an ink drum underneath. */
function createMachineGun(material: Material): Object3D {
  const group = new Group();
  const drum = new Mesh(new CylinderGeometry(0.11, 0.11, 0.09, 16), material);
  drum.rotation.z = Math.PI / 2;
  drum.position.set(0, -0.1, 0.04);
  group.add(barrel(0.09, 0.1, 0.42, material), drum);
  return group;
}
