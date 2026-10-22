import type { Collider } from '@dimforge/rapier3d-compat';
import { CONFIG } from '../config';
import type { PlayerInput } from './input';
import { characterCenterOffset, type PhysicsWorld } from './physicsWorld';
import type { PlayerState } from './playerState';

/**
 * Advances one player by one fixed tick. These are the game rules: the client runs them to
 * predict, the server runs them to decide. The state is the source of truth; `body` is only a
 * capsule used to probe the map.
 */
export function stepPlayer(
  physics: PhysicsWorld,
  body: Collider,
  s: PlayerState,
  input: PlayerInput,
  dt: number,
): void {
  const m = CONFIG.movement;
  s.yaw = input.aimYaw;

  // Horizontal: speed up toward the requested direction, relative to where the player aims.
  let moveX = input.moveX;
  let moveY = input.moveY;
  const amount = Math.hypot(moveX, moveY);
  if (amount > 1) {
    moveX /= amount;
    moveY /= amount;
  }
  const sin = Math.sin(s.yaw);
  const cos = Math.cos(s.yaw);
  const targetVx = (cos * moveX - sin * moveY) * m.walkSpeed;
  const targetVz = (-sin * moveX - cos * moveY) * m.walkSpeed;
  const hasInput = amount > 0.001;
  if (s.grounded) {
    approachVelocity(s, targetVx, targetVz, (hasInput ? m.groundAccel : m.groundDecel) * dt);
  } else if (hasInput) {
    approachVelocity(s, targetVx, targetVz, m.groundAccel * m.airControl * dt);
  }

  // Jump: a press is remembered briefly (buffer), and still works just after leaving a ledge
  // (coyote time).
  s.jumpBuffer = input.jump && !s.jumpHeld ? m.jumpBuffer : Math.max(0, s.jumpBuffer - dt);
  s.jumpHeld = input.jump;
  const canJump = s.grounded || (!s.jumped && s.airTime <= m.coyoteTime);
  if (s.jumpBuffer > 0 && canJump) {
    s.vy = m.jumpSpeed;
    s.jumpBuffer = 0;
    s.jumped = true;
  } else {
    s.vy = Math.max(s.vy - m.gravity * dt, -m.maxFallSpeed);
  }

  // Move through the map, starting from the state's position.
  const centerOffset = characterCenterOffset();
  body.setTranslation({ x: s.x, y: s.y + centerOffset, z: s.z });
  const hit = physics.moveCharacter(body, { x: s.vx * dt, y: s.vy * dt, z: s.vz * dt });
  const position = body.translation();
  s.x = position.x;
  s.y = position.y - centerOffset;
  s.z = position.z;

  // React to what the move ran into.
  s.grounded = hit.grounded && s.vy <= 0;
  if (s.grounded) {
    s.vy = 0;
    s.airTime = 0;
    s.jumped = false;
  } else {
    s.airTime += dt;
    if (hit.hitCeiling && s.vy > 0) s.vy = 0;
  }
  if (hit.hitWall) {
    // Drop the part of the velocity that points into the wall, so it doesn't pile up.
    const into = s.vx * hit.wallNormalX + s.vz * hit.wallNormalZ;
    if (into < 0) {
      s.vx -= into * hit.wallNormalX;
      s.vz -= into * hit.wallNormalZ;
    }
  }
}

/** Moves the horizontal velocity toward a target by at most `maxDelta` (m/s). */
function approachVelocity(s: PlayerState, targetVx: number, targetVz: number, maxDelta: number) {
  const dx = targetVx - s.vx;
  const dz = targetVz - s.vz;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta) {
    s.vx = targetVx;
    s.vz = targetVz;
  } else {
    s.vx += (dx / distance) * maxDelta;
    s.vz += (dz / distance) * maxDelta;
  }
}
