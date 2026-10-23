import type { Collider } from '@dimforge/rapier3d-compat';
import { CONFIG } from '../config';
import type { Vec3 } from '../math3d';
import { NO_TEAM, type PaintGrid } from '../paint/paintGrid';
import { weaponStats } from '../weapons';
import type { PlayerInput } from './input';
import { characterCenterOffset, type PhysicsWorld, type RayHit } from './physicsWorld';
import type { PlayerState } from './playerState';

const DOWN: Vec3 = { x: 0, y: -1, z: 0 };

/**
 * Advances one player by one fixed tick. These are the game rules: the client runs them to
 * predict, the server runs them to decide. The state is the source of truth; `body` is only a
 * capsule used to probe the map. Without a paint grid, paint has no effect (used by tests).
 */
export function stepPlayer(
  physics: PhysicsWorld,
  body: Collider,
  s: PlayerState,
  input: PlayerInput,
  dt: number,
  paint?: PaintGrid,
): void {
  const m = CONFIG.movement;
  const sw = CONFIG.swim;
  const h = CONFIG.health;
  s.yaw = input.aimYaw;
  // Splatted: nothing to move until the respawn.
  if (s.respawnTimer > 0) {
    s.vx = 0;
    s.vy = 0;
    s.vz = 0;
    return;
  }

  // Melt into a puddle while swim is held; pop back out when it's released.
  // The flag carrier can't swim.
  const wantsSwim = input.swim && !s.carrying;
  const blendStep = dt / Math.max(sw.transformTime, 1e-3);
  s.swimBlend = wantsSwim
    ? Math.min(1, s.swimBlend + blendStep)
    : Math.max(0, s.swimBlend - blendStep);
  const swimming = s.swimBlend >= 0.5;
  // Aim mode only while standing; holding swim cancels it.
  s.aiming = input.aim && !wantsSwim && s.swimBlend === 0;

  // Requested direction on the ground, relative to where the player aims.
  let moveX = input.moveX;
  let moveY = input.moveY;
  const amount = Math.hypot(moveX, moveY);
  if (amount > 1) {
    moveX /= amount;
    moveY /= amount;
  }
  const sin = Math.sin(s.yaw);
  const cos = Math.cos(s.yaw);
  const wishX = cos * moveX - sin * moveY;
  const wishZ = -sin * moveX - cos * moveY;
  const hasInput = amount > 0.001;

  // What's painted under the feet, and on a wall right ahead?
  s.groundTeam = paint && s.grounded ? paintBelow(physics, paint, s) : NO_TEAM;
  const onOwnPaint = s.groundTeam === s.team;
  const onEnemyPaint = s.groundTeam !== NO_TEAM && !onOwnPaint;
  const wall = paint && swimming && hasInput ? wallAhead(physics, s, wishX, wishZ) : null;
  const wallIsOwn = wall !== null && paint !== undefined && paintAt(paint, wall) === s.team;
  const wasClimbing = s.climbing;
  s.climbing = wallIsOwn;
  s.submerged = (swimming && s.grounded && onOwnPaint) || s.climbing;

  // Horizontal: speed up toward the requested velocity.
  let maxSpeed = swimming ? (s.submerged ? sw.swimSpeed : sw.puddleSpeed) : m.walkSpeed;
  if (onEnemyPaint) maxSpeed *= h.enemyPaintSpeedMultiplier;
  if (s.aiming) maxSpeed *= m.aimSpeedMultiplier;
  // Heavier weapons slow you down (sniper fastest, machine gun slowest).
  maxSpeed *= weaponStats(s.weapon).moveSpeedMultiplier;
  // Carrying the flag slows you, so teammates have to escort you and paint a path.
  if (s.carrying) maxSpeed *= CONFIG.match.flagCarrierSpeedMultiplier;
  const accel = s.submerged ? sw.swimAccel : m.groundAccel;
  if (s.grounded || s.climbing) {
    approachVelocity(
      s,
      wishX * maxSpeed,
      wishZ * maxSpeed,
      (hasInput ? accel : m.groundDecel) * dt,
    );
  } else if (hasInput) {
    approachVelocity(s, wishX * maxSpeed, wishZ * maxSpeed, accel * m.airControl * dt);
  }

  // Vertical: climbing, jumping (buffered, with coyote time), or falling.
  s.jumpBuffer = input.jump && !s.jumpHeld ? m.jumpBuffer : Math.max(0, s.jumpBuffer - dt);
  s.jumpHeld = input.jump;
  const canJump = s.grounded || (!s.jumped && s.airTime <= m.coyoteTime);
  if (s.climbing) {
    s.vy = sw.climbSpeed;
  } else if (s.jumpBuffer > 0 && canJump) {
    let jump = s.submerged ? sw.swimJumpSpeed : m.jumpSpeed;
    if (onEnemyPaint) jump *= h.enemyPaintJumpMultiplier;
    s.vy = jump;
    s.jumpBuffer = 0;
    s.jumped = true;
  } else {
    if (wasClimbing && swimming && hasInput && wall === null) {
      // Ran out of wall at the top: pop up and over the edge.
      s.vy = Math.max(s.vy, sw.climbTopPop);
    }
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

  // Health: enemy paint hurts (but can't finish you off); otherwise regenerate after a pause.
  if (onEnemyPaint && s.grounded) {
    if (s.hp > h.enemyPaintMinHp) {
      s.hp = Math.max(h.enemyPaintMinHp, s.hp - h.enemyPaintDamagePerSecond * dt);
    }
    s.sinceDamage = 0;
  } else {
    s.sinceDamage += dt;
    if (s.sinceDamage >= h.regenDelay) {
      s.hp = Math.min(CONFIG.player.maxHp, s.hp + h.regenPerSecond * dt);
    }
  }
}

/** Team owning the paint directly under the player's feet, or NO_TEAM. */
function paintBelow(physics: PhysicsWorld, paint: PaintGrid, s: PlayerState): number {
  const hit = physics.raycast({ x: s.x, y: s.y + 0.25, z: s.z }, DOWN, 0.6);
  return hit ? paintAt(paint, hit) : NO_TEAM;
}

/** A steep surface right in front of the player (at about knee height), or null. */
function wallAhead(physics: PhysicsWorld, s: PlayerState, dirX: number, dirZ: number) {
  const length = Math.hypot(dirX, dirZ);
  const reach = CONFIG.character.radius + 0.25;
  const hit = physics.raycast(
    { x: s.x, y: s.y + 0.3, z: s.z },
    { x: dirX / length, y: 0, z: dirZ / length },
    reach,
  );
  return hit && Math.abs(hit.normal.y) < 0.3 ? hit : null;
}

/** Team owning the paint where a ray hit the map, or NO_TEAM. */
function paintAt(paint: PaintGrid, hit: RayHit): number {
  const surface = paint.surfaceAt(hit.blockIndex, hit.normal);
  return surface < 0 ? NO_TEAM : paint.teamAt(surface, hit.point);
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
