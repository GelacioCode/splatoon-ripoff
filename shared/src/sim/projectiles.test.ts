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
    const splats = hits.filter((hit) => !hit.drip);
    expect(splats).toHaveLength(1);
    expect(splats[0].team).toBe(1);
    expect(splats[0].blockIndex).toBe(0);
    expect(splats[0].point.y).toBeCloseTo(0, 3);
    expect(splats[0].point.z).toBeCloseTo(-1, 1);
    // Its trail line runs from under where it was fired to the splat.
    const line = hits.find((hit) => hit.drip);
    expect(line?.trail).toBeCloseTo(1, 1);
  });

  it('leaves one straight trail line on the floor, its pieces joined end to end', () => {
    // Fired level from 1 m up, beside the wall, toward −Z.
    const origin = { x: 5, y: 1, z: 8 };
    const shots = [createProjectile(origin, 0, 0, 0)];
    const hits: ProjectileHit[] = [];
    for (let tick = 0; tick < 60 && shots.length > 0; tick++) {
      stepProjectiles(physics, shots, 1 / 30, (hit) => hits.push(hit));
    }
    const pieces = hits.filter((hit) => hit.drip);
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    expect(hits[hits.length - 1].drip).toBe(false);
    // The first piece starts under the muzzle; each next one starts where the last ended.
    let from = { x: origin.x, z: origin.z };
    for (const piece of pieces) {
      expect(piece.point.y).toBeCloseTo(0, 3);
      expect(piece.trail).toBeGreaterThan(0);
      const startX = piece.point.x - piece.direction.x * piece.trail;
      const startZ = piece.point.z - piece.direction.z * piece.trail;
      expect(startX).toBeCloseTo(from.x, 3);
      expect(startZ).toBeCloseTo(from.z, 3);
      // Straight: it runs along the shot (toward −Z), not sideways.
      expect(piece.point.x).toBeCloseTo(origin.x, 3);
      from = { x: piece.point.x, z: piece.point.z };
    }
  });

  it('drops out of the list when it flies off into nothing', () => {
    const shots = [createProjectile({ x: 0, y: 5, z: 0 }, 0, 0.8, 0)];
    for (let tick = 0; tick < 120; tick++) stepProjectiles(physics, shots, 1 / 30, () => {});
    expect(shots).toHaveLength(0);
  });
});
