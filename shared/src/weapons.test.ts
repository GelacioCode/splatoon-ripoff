import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { parseWeaponChoice, WEAPON_KINDS, weaponKind, weaponStats } from './weapons';

const { assault, sniper, machineGun } = CONFIG.weapons;

describe('roles', () => {
  it('give each role its magazine: sniper 5, assault 20, machine gun 40', () => {
    expect(sniper.magazine).toBe(5);
    expect(assault.magazine).toBe(20);
    expect(machineGun.magazine).toBe(40);
  });

  it('make the sniper fastest on foot and the machine gun slowest', () => {
    expect(sniper.moveSpeedMultiplier).toBeGreaterThan(assault.moveSpeedMultiplier);
    expect(assault.moveSpeedMultiplier).toBeGreaterThan(machineGun.moveSpeedMultiplier);
  });

  it('give the sniper the longest range and the machine gun the shortest', () => {
    const range = (w: { projectileSpeed: number; straightTime: number }) =>
      w.projectileSpeed * w.straightTime;
    expect(range(sniper)).toBeGreaterThan(range(assault));
    expect(range(assault)).toBeGreaterThan(range(machineGun));
  });

  it('look roles up by index, falling back to assault for unknown ones', () => {
    expect(WEAPON_KINDS.map((_, i) => weaponKind(i))).toEqual(['assault', 'sniper', 'machineGun']);
    expect(weaponStats(99)).toBe(assault);
  });

  it('accept only valid role choices from clients', () => {
    expect(parseWeaponChoice(1)).toBe(1);
    for (const bad of [-1, 3, 1.5, '1', null, undefined]) expect(parseWeaponChoice(bad)).toBeNull();
  });
});
