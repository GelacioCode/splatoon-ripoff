import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { weaponStats } from '../weapons';
import { applyShotDamage, playerHitSphere, segmentHitsSphere, stepLife } from './health';
import { createPlayerState } from './playerState';

const ASSAULT = 0;
const SNIPER = 1;
const MACHINE_GUN = 2;
const FORWARD = { x: 0, y: 0, z: -1 };

function enemy() {
  return createPlayerState({ x: 0, y: 0, z: -5 }, 0, 1);
}

/** Hits from team 0 until splatted; returns how many it took. */
function hitsToSplat(damage: number): number {
  const target = enemy();
  let hits = 0;
  while (applyShotDamage(target, 0, damage) !== 'splatted') hits++;
  return hits + 1;
}

describe('shot hits', () => {
  it('touch a player when the path passes through their body', () => {
    const { center, radius } = playerHitSphere(0, 0, -5, 0);
    // Straight at their middle, and grazing the side.
    expect(segmentHitsSphere({ x: 0, y: center.y, z: 0 }, FORWARD, 10, center, radius)).toBe(true);
    expect(segmentHitsSphere({ x: 0.5, y: center.y, z: 0 }, FORWARD, 10, center, radius)).toBe(
      true,
    );
  });

  it('miss when passing beside them, or stopping short', () => {
    const { center, radius } = playerHitSphere(0, 0, -5, 0);
    expect(segmentHitsSphere({ x: 1, y: center.y, z: 0 }, FORWARD, 10, center, radius)).toBe(false);
    expect(segmentHitsSphere({ x: 0, y: center.y, z: 0 }, FORWARD, 3, center, radius)).toBe(false);
    // Moving away from them.
    const back = { x: 0, y: 0, z: 1 };
    expect(segmentHitsSphere({ x: 0, y: center.y, z: -3 }, back, 10, center, radius)).toBe(false);
  });

  it('sit lower on a puddle, so shots over it miss', () => {
    const standing = playerHitSphere(0, 0, -5, 0);
    const puddle = playerHitSphere(0, 0, -5, 1);
    expect(puddle.center.y).toBeLessThan(standing.center.y);
    const chestHigh = { x: 0, y: 1, z: 0 };
    expect(segmentHitsSphere(chestHigh, FORWARD, 10, standing.center, standing.radius)).toBe(true);
    expect(segmentHitsSphere(chestHigh, FORWARD, 10, puddle.center, puddle.radius)).toBe(false);
  });
});

describe('damage', () => {
  it('splats in 2 sniper hits, 3 assault hits and 3 machine gun hits', () => {
    expect(hitsToSplat(weaponStats(SNIPER).damage)).toBe(2);
    expect(hitsToSplat(weaponStats(ASSAULT).damage)).toBe(3);
    expect(hitsToSplat(weaponStats(MACHINE_GUN).damage)).toBe(3);
  });

  it('never hurts teammates, splatted players or anyone under spawn protection', () => {
    const target = enemy();
    expect(applyShotDamage(target, 1, 50)).toBe('ignored');
    target.protectTimer = 1;
    expect(applyShotDamage(target, 0, 50)).toBe('ignored');
    target.protectTimer = 0;
    target.respawnTimer = 3;
    expect(applyShotDamage(target, 0, 50)).toBe('ignored');
    expect(target.hp).toBe(CONFIG.player.maxHp);
  });

  it('puts a splatted player out until the respawn, and pauses health regen on any hit', () => {
    const target = enemy();
    target.sinceDamage = 9;
    expect(applyShotDamage(target, 0, 30)).toBe('hit');
    expect(target.sinceDamage).toBe(0);
    expect(applyShotDamage(target, 0, 100)).toBe('splatted');
    expect(target.hp).toBe(0);
    expect(target.respawnTimer).toBe(CONFIG.player.respawnSeconds);
  });
});

describe('stepLife', () => {
  it('says when the respawn is due, and runs down spawn protection', () => {
    const s = enemy();
    s.respawnTimer = 1;
    s.protectTimer = 0.5;
    expect(stepLife(s, 0.6)).toBe(false);
    expect(s.protectTimer).toBe(0);
    expect(stepLife(s, 0.5)).toBe(true);
    expect(stepLife(s, 0.5)).toBe(false);
  });
});
