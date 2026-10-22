import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_BLOCKS } from '../paint/testMap';
import { initPhysics } from './index';
import { PhysicsWorld } from './physicsWorld';
import { createProjectile, stepProjectiles, type ProjectileHit } from './projectiles';

let physics: PhysicsWorld;

beforeAll(async () => {
  await initPhysics();
  physics = new PhysicsWorld(TEST_BLOCKS);
});

afterAll(() => {
  physics.dispose();
});

describe('stepProjectiles', () => {
  it('flies until it hits the floor, reports where, and removes the shot', () => {
    // Fired from 1 m up, 45° down toward −Z: it should land about 1 m ahead.
    const shots = [createProjectile({ x: 0, y: 1, z: 0 }, 0, -Math.PI / 4, 1)];
    const hits: ProjectileHit[] = [];
    for (let tick = 0; tick < 30 && shots.length > 0; tick++) {
      stepProjectiles(physics, shots, 1 / 30, (hit) => hits.push(hit));
    }
    expect(shots).toHaveLength(0);
    expect(hits).toHaveLength(1);
    expect(hits[0].team).toBe(1);
    expect(hits[0].blockIndex).toBe(0);
    expect(hits[0].point.y).toBeCloseTo(0, 3);
    expect(hits[0].point.z).toBeCloseTo(-1, 1);
  });

  it('drips small paint spots onto the floor along its path before landing', () => {
    // Fired level from 1 m up, beside the wall, toward −Z.
    const shots = [createProjectile({ x: 5, y: 1, z: 8 }, 0, 0, 0)];
    const hits: ProjectileHit[] = [];
    for (let tick = 0; tick < 60 && shots.length > 0; tick++) {
      stepProjectiles(physics, shots, 1 / 30, (hit) => hits.push(hit));
    }
    const drips = hits.filter((hit) => hit.drip);
    expect(drips.length).toBeGreaterThanOrEqual(2);
    expect(drips.every((drip) => drip.point.y < 0.01 && drip.point.z < 8)).toBe(true);
    expect(hits[hits.length - 1].drip).toBe(false);
  });

  it('drops out of the list when it flies off into nothing', () => {
    const shots = [createProjectile({ x: 0, y: 5, z: 0 }, 0, 0.8, 0)];
    for (let tick = 0; tick < 120; tick++) stepProjectiles(physics, shots, 1 / 30, () => {});
    expect(shots).toHaveLength(0);
  });
});
