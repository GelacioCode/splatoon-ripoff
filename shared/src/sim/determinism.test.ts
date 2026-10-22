import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { ARENA } from '../maps/arena';
import { buildSurfaces } from '../maps/surfaces';
import { PaintGrid } from '../paint/paintGrid';
import { initPhysics } from './index';
import { createInput, type PlayerInput } from './input';
import { PhysicsWorld } from './physicsWorld';
import { createPlayerState, type PlayerState } from './playerState';
import { stepPlayer } from './stepPlayer';

const DT = 1 / CONFIG.net.tickRate;

/** A scripted two-second run: forward, strafing, a jump, a swim and some turning. */
function scriptedInput(tick: number): PlayerInput {
  return {
    ...createInput(),
    moveY: tick < 40 ? 1 : 0.5,
    moveX: tick > 20 && tick < 35 ? -1 : 0,
    jump: tick === 10,
    swim: tick > 45,
    aimYaw: Math.PI + tick * 0.02,
  };
}

/** Plays the script in a brand new world and returns the final state. */
function playScript(): PlayerState {
  const physics = new PhysicsWorld(ARENA.blocks);
  const paint = new PaintGrid(buildSurfaces(ARENA.blocks));
  paint.splat({ x: 0, y: 0, z: -24 }, 3, 0);
  const spawn = ARENA.spawns[0][0];
  const state = createPlayerState({ x: spawn.x, y: spawn.y + 0.05, z: spawn.z }, Math.PI, 0);
  const body = physics.createCharacter(state);
  for (let tick = 0; tick < 60; tick++) {
    stepPlayer(physics, body, state, scriptedInput(tick), DT, paint);
  }
  physics.dispose();
  return state;
}

beforeAll(async () => {
  await initPhysics();
});

describe('determinism', () => {
  it('gives exactly the same result for the same inputs (needed for client prediction)', () => {
    const first = playScript();
    const second = playScript();
    expect(second).toEqual(first);
    // Sanity check: the script actually moved the player.
    expect(
      Math.hypot(first.x - ARENA.spawns[0][0].x, first.z - ARENA.spawns[0][0].z),
    ).toBeGreaterThan(3);
  });
});
