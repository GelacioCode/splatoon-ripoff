import RAPIER, {
  type Collider,
  type KinematicCharacterController,
  type World,
} from '@dimforge/rapier3d-compat';
import { CONFIG } from '../config';
import type { BlockDef } from '../maps/types';
import { quatFromEuler, type Vec3 } from '../math3d';

// Rapier collision groups: (16 bits "I am") << 16 | (16 bits "I collide with").
const GROUP_MAP = 0x0001;
const GROUP_CHARACTER = 0x0002;
const MAP_GROUPS = (GROUP_MAP << 16) | GROUP_MAP | GROUP_CHARACTER;
/** Characters (and map-only queries) touch the map but pass through each other. */
const CHARACTER_GROUPS = (GROUP_CHARACTER << 16) | GROUP_MAP;

const DEG_TO_RAD = Math.PI / 180;

/** Distance from a character's feet to the center of its capsule (m). */
export function characterCenterOffset(): number {
  return CONFIG.character.capsuleHalfHeight + CONFIG.character.radius;
}

export interface MoveResult {
  grounded: boolean;
  /** The move ran into something steep, like a wall. */
  hitWall: boolean;
  /** Horizontal direction pointing out of the wall (unit length when hitWall). */
  wallNormalX: number;
  wallNormalZ: number;
  /** The move ran into something overhead. */
  hitCeiling: boolean;
}

export interface RayHit {
  distance: number;
  point: Vec3;
  normal: Vec3;
  /** Index of the map block that was hit, or −1. */
  blockIndex: number;
}

/** The static map as Rapier colliders, plus helpers to move characters and cast rays. */
export class PhysicsWorld {
  private readonly world: World;
  private readonly controller: KinematicCharacterController;
  private readonly blockByCollider = new Map<number, number>();
  private readonly moveResult: MoveResult = {
    grounded: false,
    hitWall: false,
    wallNormalX: 0,
    wallNormalZ: 0,
    hitCeiling: false,
  };

  constructor(blocks: BlockDef[]) {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    blocks.forEach((block, index) => {
      const { center, size, rotation } = block;
      const desc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
        .setTranslation(center.x, center.y, center.z)
        .setRotation(quatFromEuler(rotation.x, rotation.y, rotation.z))
        .setCollisionGroups(MAP_GROUPS);
      this.blockByCollider.set(this.world.createCollider(desc).handle, index);
    });

    const c = CONFIG.character;
    this.controller = this.world.createCharacterController(c.skinWidth);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setSlideEnabled(true);
    this.controller.setMaxSlopeClimbAngle(c.maxSlopeDeg * DEG_TO_RAD);
    this.controller.setMinSlopeSlideAngle(c.minSlopeSlideDeg * DEG_TO_RAD);
    this.controller.enableAutostep(c.stepHeight, c.stepMinWidth, false);
    this.controller.enableSnapToGround(c.snapToGround);

    // Rapier only includes new colliders in queries after a step.
    this.world.step();
  }

  /** Creates the capsule for a character whose feet are at `feet`. */
  createCharacter(feet: Vec3): Collider {
    const c = CONFIG.character;
    const desc = RAPIER.ColliderDesc.capsule(c.capsuleHalfHeight, c.radius)
      .setTranslation(feet.x, feet.y + characterCenterOffset(), feet.z)
      .setCollisionGroups(CHARACTER_GROUPS);
    return this.world.createCollider(desc);
  }

  removeCharacter(collider: Collider): void {
    this.world.removeCollider(collider, false);
  }

  /**
   * Moves a character's capsule by `delta` (m), sliding along walls and slopes, and reports
   * what it touched. The returned object is reused by the next call.
   */
  moveCharacter(collider: Collider, delta: Vec3): MoveResult {
    this.controller.computeColliderMovement(collider, delta, undefined, CHARACTER_GROUPS);
    const moved = this.controller.computedMovement();
    const position = collider.translation();
    collider.setTranslation({
      x: position.x + moved.x,
      y: position.y + moved.y,
      z: position.z + moved.z,
    });

    const result = this.moveResult;
    result.grounded = this.controller.computedGrounded();
    result.hitWall = false;
    result.hitCeiling = false;
    result.wallNormalX = 0;
    result.wallNormalZ = 0;
    for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
      const hit = this.controller.computedCollision(i);
      if (!hit) continue;
      // normal1 points out of the obstacle, toward the character.
      const n = hit.normal1;
      if (n.y < -0.7) {
        result.hitCeiling = true;
      } else if (Math.abs(n.y) < 0.3) {
        const length = Math.hypot(n.x, n.z);
        result.hitWall = true;
        result.wallNormalX = n.x / length;
        result.wallNormalZ = n.z / length;
      }
    }
    return result;
  }

  /** Casts a ray against the map only (characters are ignored). `direction` must be unit length. */
  raycast(origin: Vec3, direction: Vec3, maxDistance: number): RayHit | null {
    const ray = new RAPIER.Ray(origin, direction);
    const hit = this.world.castRayAndGetNormal(ray, maxDistance, true, undefined, CHARACTER_GROUPS);
    if (!hit) return null;
    return {
      distance: hit.timeOfImpact,
      point: ray.pointAt(hit.timeOfImpact),
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
      blockIndex: this.blockByCollider.get(hit.collider.handle) ?? -1,
    };
  }

  /** Refreshes Rapier's spatial index after characters moved. Call once per tick. */
  step(): void {
    this.world.step();
  }

  dispose(): void {
    this.world.free();
  }
}
