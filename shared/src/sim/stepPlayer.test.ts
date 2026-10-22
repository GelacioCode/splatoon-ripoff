import type { Collider } from '@dimforge/rapier3d-compat';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import type { BlockDef } from '../maps/types';
import { initPhysics } from './index';
import { createInput, type PlayerInput } from './input';
import { PhysicsWorld } from './physicsWorld';
import { createPlayerState, type PlayerState } from './playerState';
import { stepPlayer } from './stepPlayer';

const DT = 1 / CONFIG.net.tickRate;

function box([cx, cy, cz]: number[], [sx, sy, sz]: number[]): BlockDef {
  return {
    kind: 'block',
    center: { x: cx, y: cy, z: cz },
    size: { x: sx, y: sy, z: sz },
    rotation: { x: 0, y: 0, z: 0 },
    paintable: true,
  };
}

/** A big floor (top at y = 0) and a 1 m tall platform covering −3…3 on X and Z. */
const BLOCKS = [box([0, -0.5, 0], [40, 1, 40]), box([0, 0.5, 0], [6, 1, 6])];

let physics: PhysicsWorld;

beforeAll(async () => {
  await initPhysics();
  physics = new PhysicsWorld(BLOCKS);
});

afterAll(() => {
  physics.dispose();
});

interface TestPlayer {
  state: PlayerState;
  body: Collider;
}

function spawn(x: number, y: number, z: number): TestPlayer {
  const state = createPlayerState({ x, y, z });
  return { state, body: physics.createCharacter(state) };
}

function step(player: TestPlayer, input: Partial<PlayerInput> = {}): void {
  stepPlayer(physics, player.body, player.state, { ...createInput(), ...input }, DT);
}

/** Puts a player on the platform and walks it off the +X edge; returns it on its first tick in the air. */
function runOffPlatform(): TestPlayer {
  const player = spawn(2, 1.05, 0);
  for (let i = 0; i < 3; i++) step(player);
  expect(player.state.grounded).toBe(true);
  for (let i = 0; i < 60 && player.state.grounded; i++) step(player, { moveX: 1 });
  expect(player.state.grounded).toBe(false);
  return player;
}

/** The tick on which a player dropped from 2 m first touches the floor. */
function landingTick(): number {
  const player = spawn(-10, 2, -10);
  for (let tick = 0; tick < 120; tick++) {
    step(player);
    if (player.state.grounded) return tick;
  }
  throw new Error('The test player never landed');
}

describe('stepPlayer', () => {
  it('stands still on the floor', () => {
    const player = spawn(10, 0.05, 10);
    for (let i = 0; i < 30; i++) step(player);
    expect(player.state.grounded).toBe(true);
    expect(player.state.y).toBeGreaterThan(-0.01);
    expect(player.state.y).toBeLessThan(0.06);
    expect(player.state.x).toBeCloseTo(10, 3);
    expect(player.state.z).toBeCloseTo(10, 3);
  });

  it('reaches walking speed within a few ticks', () => {
    const player = spawn(10, 0.05, 10);
    for (let i = 0; i < 3; i++) step(player);
    for (let i = 0; i < 6; i++) step(player, { moveY: 1 });
    const speed = Math.hypot(player.state.vx, player.state.vz);
    expect(speed).toBeGreaterThan(CONFIG.movement.walkSpeed * 0.95);
  });

  it('still jumps right after running off a ledge (coyote time)', () => {
    const player = runOffPlatform();
    step(player, { moveX: 1, jump: true });
    expect(player.state.vy).toBeGreaterThan(0);
  });

  it('refuses that jump once coyote time is over', () => {
    const player = runOffPlatform();
    const lateTicks = Math.ceil(CONFIG.movement.coyoteTime / DT) + 1;
    for (let i = 0; i < lateTicks; i++) step(player, { moveX: 1 });
    step(player, { moveX: 1, jump: true });
    expect(player.state.vy).toBeLessThan(0);
  });

  it('jumps on landing when jump was pressed just before touching down (buffer)', () => {
    const land = landingTick();
    const player = spawn(-10, 2, -10);
    let jumpedAfterLanding = false;
    for (let tick = 0; tick < land + 4; tick++) {
      step(player, { jump: tick === land - 1 });
      if (tick >= land && player.state.vy > 0) jumpedAfterLanding = true;
    }
    expect(jumpedAfterLanding).toBe(true);
  });

  it('forgets a jump pressed too long before landing', () => {
    const land = landingTick();
    const early = Math.ceil(CONFIG.movement.jumpBuffer / DT) + 2;
    const player = spawn(-10, 2, -10);
    let jumped = false;
    for (let tick = 0; tick < land + 4; tick++) {
      step(player, { jump: tick === land - early });
      if (player.state.vy > 0) jumped = true;
    }
    expect(jumped).toBe(false);
  });
});
