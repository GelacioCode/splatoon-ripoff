import { createInput, type PlayerInput } from '@paint-rush/shared/sim';

// Bots: simple players for "Play with bots" lobbies and the load test. They move, shoot,
// swim and play the objective. They react a little late and their aim wobbles, so they can
// be beaten.

export interface Point {
  x: number;
  y: number;
  z: number;
}

/** What a bot looks at to decide its next input. */
export interface BotView {
  me: Point & { team: number; carrying: boolean; splatted: boolean };
  /** Enemies in the arena that are alive. */
  enemies: Point[];
  /** Where the flag is, and who has it: 'none', 'mine' (my team) or 'theirs'. */
  flag: (Point & { holder: 'none' | 'mine' | 'theirs' }) | null;
  /** My team's base, in front of my spawn (defended when the enemy has the flag). */
  base: Point;
  /** The enemy team's base (where a carrier scores). */
  enemyBase: Point;
  /** King of the Hill stages: the circle to stand in (null in Capture the Flag). */
  hill: (Point & { radius: number }) | null;
  /** The arena's half extents, for picking spots to wander to. */
  halfWidth: number;
  halfLength: number;
}

/** A bot's state between ticks. */
export interface BotMind {
  /** Chasers go for the flag; the others roam and fight. */
  chaser: boolean;
  wander: { x: number; z: number };
  /** Seconds until each little habit changes. */
  nextWander: number;
  strafe: number;
  nextStrafe: number;
  nextJump: number;
  swimFor: number;
  last: { x: number; z: number };
  stuckFor: number;
  /** Seconds an enemy has been in range; it fires once this reaches `reaction`. */
  seenFor: number;
  reaction: number;
  /** How far off its aim is right now (rad), and when that changes. */
  aimError: { yaw: number; pitch: number };
  nextAimError: number;
  /** Where in the hill it likes to stand: a direction and a share of the radius, so bots spread out. */
  hillSpot: { angle: number; reach: number };
  /** The way it faced last tick. */
  yaw: number;
}

/** Enemies closer than this get shot at (m). */
const SHOOT_RANGE = 18;
/** Close enough to a spot to pick a new one (m). */
const ARRIVED = 2;
/** Closer than this to where it's going, it stops walking on (m). */
const HOLD_SPOT = 0.8;
/** Delay before the first shot at an enemy that came into range (s): this, plus up to SPREAD. */
const REACTION_SECONDS = 0.35;
const REACTION_SPREAD = 0.35;
/** Most the aim is off, sideways (rad, about 3.5°); half that up and down. */
const AIM_WOBBLE = 0.06;

type Random = () => number;

function newReaction(random: Random): number {
  return REACTION_SECONDS + random() * REACTION_SPREAD;
}

export function createBotMind(random: Random): BotMind {
  return {
    chaser: random() < 0.6,
    wander: { x: 0, z: 0 },
    nextWander: 0,
    strafe: 0,
    nextStrafe: 0,
    nextJump: 1 + random() * 3,
    swimFor: 0,
    last: { x: 0, z: 0 },
    stuckFor: 0,
    seenFor: 0,
    reaction: newReaction(random),
    aimError: { yaw: 0, pitch: 0 },
    nextAimError: 0,
    hillSpot: { angle: random() * Math.PI * 2, reach: random() * 0.6 },
    yaw: 0,
  };
}

/** The yaw that faces from `from` toward `to` (yaw 0 looks toward −Z). */
export function yawToward(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

/**
 * The stick input that walks in world direction (dx, dz) while facing `yaw`. This is the
 * inverse of how stepPlayer turns the stick into a direction (that rotation is its own inverse).
 */
export function moveInput(yaw: number, dx: number, dz: number): { moveX: number; moveY: number } {
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return { moveX: 0, moveY: 0 };
  const x = dx / length;
  const z = dz / length;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return { moveX: cos * x - sin * z, moveY: -sin * x - cos * z };
}

function nearest(from: Point, points: readonly Point[]): Point | null {
  let best: Point | null = null;
  let bestDistance = Infinity;
  for (const p of points) {
    const d = Math.hypot(p.x - from.x, p.z - from.z);
    if (d < bestDistance) {
      bestDistance = d;
      best = p;
    }
  }
  return best;
}

/**
 * Where to head. King of the Hill: into the hill. Capture the Flag: the enemy base with the
 * flag; otherwise chasers go after the flag (or escort our carrier to the enemy base), and
 * the others roam, or fall back to defend our base while an enemy has the flag.
 */
function goalFor(view: BotView, mind: BotMind): { x: number; z: number } {
  const { me, flag, hill } = view;
  // King of the Hill: everyone heads into the circle, each to their own spot in it.
  if (hill) {
    const r = hill.radius * mind.hillSpot.reach;
    return {
      x: hill.x + Math.cos(mind.hillSpot.angle) * r,
      z: hill.z + Math.sin(mind.hillSpot.angle) * r,
    };
  }
  if (me.carrying) return view.enemyBase;
  if (flag && mind.chaser) return flag.holder === 'mine' ? view.enemyBase : flag;
  if (flag?.holder === 'theirs') return view.base;
  return mind.wander;
}

/** One tick of a bot's thinking: the input to send, given what it sees. */
export function think(view: BotView, mind: BotMind, dt: number, random: Random): PlayerInput {
  const input = createInput();
  const { me } = view;
  if (me.splatted) return input;

  // Habits: a new spot to roam to now and then, a strafe wobble, the odd jump and swim.
  mind.nextWander -= dt;
  const atSpot = Math.hypot(mind.wander.x - me.x, mind.wander.z - me.z) < ARRIVED;
  if (mind.nextWander <= 0 || atSpot) {
    mind.wander = {
      x: (random() * 2 - 1) * view.halfWidth * 0.8,
      z: (random() * 2 - 1) * view.halfLength * 0.8,
    };
    mind.nextWander = 4 + random() * 6;
  }
  mind.nextStrafe -= dt;
  if (mind.nextStrafe <= 0) {
    mind.strafe = (random() * 2 - 1) * 0.6;
    mind.nextStrafe = 0.5 + random() * 1.5;
  }
  // Stuck against something: jump and pick another spot.
  const moved = Math.hypot(me.x - mind.last.x, me.z - mind.last.z);
  mind.stuckFor = moved < 0.02 ? mind.stuckFor + dt : 0;
  mind.last = { x: me.x, z: me.z };
  mind.nextJump -= dt;
  if (mind.nextJump <= 0 || mind.stuckFor > 0.6) {
    input.jump = true;
    mind.nextJump = 2 + random() * 4;
    if (mind.stuckFor > 1.5) mind.nextWander = 0;
  }

  const goal = goalFor(view, mind);
  const target = nearest(me, view.enemies);
  const targetDistance = target ? Math.hypot(target.x - me.x, target.z - me.z) : Infinity;
  const fighting = target !== null && targetDistance < SHOOT_RANGE;

  // Like a person: a moment to react to a new enemy, and an aim that's never quite exact.
  if (fighting) mind.seenFor += dt;
  else if (mind.seenFor > 0) {
    mind.seenFor = 0;
    mind.reaction = newReaction(random);
  }
  mind.nextAimError -= dt;
  if (mind.nextAimError <= 0) {
    mind.aimError = {
      yaw: (random() * 2 - 1) * AIM_WOBBLE,
      pitch: (random() * 2 - 1) * AIM_WOBBLE * 0.5,
    };
    mind.nextAimError = 0.3 + random() * 0.4;
  }

  // Face the enemy while fighting (and shoot); otherwise face where we're going (or keep
  // facing the same way once there, e.g. on its spot in the hill).
  const toGoal = Math.hypot(goal.x - me.x, goal.z - me.z);
  const there = toGoal < HOLD_SPOT;
  const aimAt = fighting && target ? target : goal;
  input.aimYaw = fighting || !there ? yawToward(me, aimAt) : mind.yaw;
  mind.yaw = input.aimYaw;
  if (fighting && target) {
    input.aimYaw += mind.aimError.yaw;
    input.aimPitch =
      Math.atan2(target.y + 0.5 - (me.y + 0.5), targetDistance) + mind.aimError.pitch;
    input.fire = mind.seenFor >= mind.reaction;
  }

  // There: no walking on, just the strafe shuffle.
  const move = there
    ? { moveX: 0, moveY: 0 }
    : moveInput(input.aimYaw, goal.x - me.x, goal.z - me.z);
  input.moveX = Math.max(-1, Math.min(1, move.moveX + mind.strafe));
  input.moveY = move.moveY;

  // Now and then swim for a bit when nobody is around (never with the flag).
  mind.swimFor -= dt;
  if (!fighting && !me.carrying && mind.swimFor <= 0 && random() < dt * 0.15) {
    mind.swimFor = 1 + random() * 1.5;
  }
  input.swim = mind.swimFor > 0 && !fighting && !me.carrying;
  return input;
}
