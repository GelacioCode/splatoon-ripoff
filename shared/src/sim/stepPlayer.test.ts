import type { Collider } from '@dimforge/rapier3d-compat';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { buildSurfaces } from '../maps/surfaces';
import type { BlockDef } from '../maps/types';
import type { Vec3 } from '../math3d';
import { PaintGrid } from '../paint/paintGrid';
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

/**
 * A big floor (top at y = 0), a 1 m tall platform covering −3…3 on X and Z, and a 4 m tall
 * wall whose climbable face is at x = 14.5.
 */
const BLOCKS = [
  box([0, -0.5, 0], [40, 1, 40]),
  box([0, 0.5, 0], [6, 1, 6]),
  box([15, 2, 0], [1, 4, 6]),
];

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

function step(player: TestPlayer, input: Partial<PlayerInput> = {}, paint?: PaintGrid): void {
  stepPlayer(physics, player.body, player.state, { ...createInput(), ...input }, DT, paint);
}

/** A paint grid for the test map with some splats on it: [center, radius, team]. */
function paintedGrid(...splats: [Vec3, number, number][]): PaintGrid {
  const grid = new PaintGrid(buildSurfaces(BLOCKS));
  for (const [center, radius, team] of splats) grid.splat(center, radius, team);
  return grid;
}

function speed(player: TestPlayer): number {
  return Math.hypot(player.state.vx, player.state.vz);
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

describe('stepPlayer with paint', () => {
  const h = CONFIG.health;

  it('swims through its own paint faster than it can walk', () => {
    const paint = paintedGrid([{ x: -10, y: 0, z: 14 }, 6, 0]);
    const player = spawn(-10, 0.05, 16);
    for (let i = 0; i < 6; i++) step(player, { swim: true }, paint);
    for (let i = 0; i < 12; i++) step(player, { swim: true, moveY: 1 }, paint);
    expect(player.state.submerged).toBe(true);
    expect(speed(player)).toBeGreaterThan(CONFIG.movement.walkSpeed);
  });

  it('walks slower while aiming, and swimming cancels aim', () => {
    const player = spawn(-12, 0.05, -4);
    for (let i = 0; i < 3; i++) step(player);
    for (let i = 0; i < 15; i++) step(player, { aim: true, moveY: 1 });
    expect(player.state.aiming).toBe(true);
    const aimedSpeed = CONFIG.movement.walkSpeed * CONFIG.movement.aimSpeedMultiplier;
    expect(speed(player)).toBeCloseTo(aimedSpeed, 6);
    step(player, { aim: true, swim: true });
    expect(player.state.aiming).toBe(false);
  });

  it('is a slow puddle outside its own paint', () => {
    const paint = paintedGrid();
    const player = spawn(12, 0.05, -12);
    for (let i = 0; i < 6; i++) step(player, { swim: true }, paint);
    for (let i = 0; i < 15; i++) step(player, { swim: true, moveY: 1 }, paint);
    expect(player.state.submerged).toBe(false);
    expect(speed(player)).toBeLessThanOrEqual(CONFIG.swim.puddleSpeed + 1e-6);
  });

  it('is slowed and hurt by enemy paint, but never pushed below the HP floor', () => {
    const paint = paintedGrid([{ x: 8, y: 0, z: 14 }, 5, 1]);
    const player = spawn(8, 0.05, 14);
    for (let i = 0; i < 300; i++) step(player, {}, paint);
    expect(player.state.hp).toBe(h.enemyPaintMinHp);
    for (let i = 0; i < 15; i++) step(player, { moveY: 1 }, paint);
    const slowed = CONFIG.movement.walkSpeed * h.enemyPaintSpeedMultiplier;
    expect(speed(player)).toBeLessThanOrEqual(slowed + 1e-6);
  });

  it('regenerates health after a pause', () => {
    const paint = paintedGrid();
    const player = spawn(-12, 0.05, 4);
    player.state.hp = 50;
    for (let i = 0; i < Math.floor((h.regenDelay - 0.2) / DT); i++) step(player, {}, paint);
    expect(player.state.hp).toBe(50);
    for (let i = 0; i < Math.round(1.2 / DT); i++) step(player, {}, paint);
    expect(player.state.hp).toBeGreaterThan(50 + h.regenPerSecond * 0.8);
  });

  it('climbs a wall painted in its color, but not a bare one', () => {
    const climbHeight = (paint: PaintGrid) => {
      const player = spawn(13.4, 0.05, 0);
      for (let i = 0; i < 6; i++) step(player, { swim: true }, paint);
      let highest = player.state.y;
      for (let i = 0; i < 20; i++) {
        step(player, { swim: true, moveX: 1 }, paint);
        highest = Math.max(highest, player.state.y);
      }
      return highest;
    };
    expect(climbHeight(paintedGrid([{ x: 14.5, y: 1.5, z: 0 }, 3, 0]))).toBeGreaterThan(1.5);
    expect(climbHeight(paintedGrid())).toBeLessThan(0.3);
  });
});
