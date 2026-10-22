import { PerspectiveCamera, Vector3 } from 'three';
import { clamp, CONFIG, damp, lerp, type Vec3 } from '@paint-rush/shared';

const DEG_TO_RAD = Math.PI / 180;
/** Orbit point height above the feet when melted into a puddle (m). */
const PUDDLE_PIVOT_HEIGHT = 0.8;

/** Casts a ray against the map and returns the hit distance, or null when nothing is hit. */
export type RaycastDistance = (origin: Vec3, direction: Vec3, maxDistance: number) => number | null;

/**
 * Over-the-shoulder camera. Aim (yaw/pitch) changes instantly; the follow position is lightly
 * smoothed, and the camera pulls in when a wall gets between it and the player.
 */
export class ThirdPersonCamera {
  readonly camera: PerspectiveCamera;
  /** Look direction in radians; yaw 0 looks toward −Z, positive pitch looks up. */
  yaw = 0;
  pitch = -0.2;
  private readonly pivot = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly desired = new Vector3();
  private readonly toCamera = new Vector3();
  private boom = CONFIG.camera.distance;
  private hasPivot = false;

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(CONFIG.camera.fov, aspect, 0.1, 250);
    this.camera.rotation.order = 'YXZ';
  }

  /** Turns the view by a mouse or touch drag, in pixels. */
  look(dx: number, dy: number, sensitivity: number): void {
    const c = CONFIG.camera;
    this.yaw -= dx * sensitivity;
    this.pitch = clamp(
      this.pitch - dy * sensitivity,
      c.minPitchDeg * DEG_TO_RAD,
      c.maxPitchDeg * DEG_TO_RAD,
    );
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Places the camera behind the player's (interpolated) feet position. `swimBlend` (0–1)
   * lowers the view for the puddle form; `fovBoost` widens the view (degrees), e.g. at speed.
   */
  update(
    feet: Vector3,
    dt: number,
    raycast: RaycastDistance,
    swimBlend = 0,
    fovBoost = 0,
    aimBlend = 0,
  ): void {
    const c = CONFIG.camera;
    // Aim mode (aimBlend 0–1): zoom in, move closer and further over the shoulder.
    const distance = lerp(c.distance, c.aimDistance, aimBlend);
    const shoulderOffset = lerp(c.shoulderOffset, c.aimShoulderOffset, aimBlend);
    const baseFov = lerp(c.fov, c.aimFov, aimBlend);

    // Orbit a point above the feet, smoothed a little so landings don't jolt the view.
    const pivotY = feet.y + lerp(c.pivotHeight, PUDDLE_PIVOT_HEIGHT, swimBlend);
    if (this.hasPivot) {
      this.pivot.set(
        damp(this.pivot.x, feet.x, c.followSharpness, dt),
        damp(this.pivot.y, pivotY, c.followSharpness, dt),
        damp(this.pivot.z, feet.z, c.followSharpness, dt),
      );
    } else {
      this.pivot.set(feet.x, pivotY, feet.z);
      this.hasPivot = true;
    }

    const cosPitch = Math.cos(this.pitch);
    this.forward.set(
      -Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cosPitch,
    );
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // Over the shoulder: step right, then back along the view direction.
    this.desired
      .copy(this.pivot)
      .addScaledVector(this.right, shoulderOffset)
      .addScaledVector(this.forward, -distance);
    this.toCamera.subVectors(this.desired, this.pivot);
    const length = this.toCamera.length();
    this.toCamera.divideScalar(length);

    // Pull in at once when a wall is in the way; ease back out once it clears.
    const hit = raycast(this.pivot, this.toCamera, length + c.collisionPadding);
    const allowed = hit === null ? length : Math.max(0.3, hit - c.collisionPadding);
    this.boom = allowed < this.boom ? allowed : damp(this.boom, allowed, 6, dt);

    this.camera.position.copy(this.pivot).addScaledVector(this.toCamera, this.boom);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    const fov = damp(this.camera.fov, baseFov + fovBoost, 8, dt);
    if (Math.abs(fov - this.camera.fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
