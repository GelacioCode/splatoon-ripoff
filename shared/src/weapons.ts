import { CONFIG } from './config';

/** Roles in a fixed order; a player's `weapon` field is an index into this list. */
export const WEAPON_KINDS = ['assault', 'sniper', 'machineGun'] as const;
export type WeaponKind = (typeof WEAPON_KINDS)[number];
export type WeaponStats = (typeof CONFIG.weapons)[WeaponKind];

export const DEFAULT_WEAPON = 0;

export function weaponKind(index: number): WeaponKind {
  return WEAPON_KINDS[index] ?? WEAPON_KINDS[DEFAULT_WEAPON];
}

/** The tunable numbers of a role (unknown indices fall back to assault). */
export function weaponStats(index: number): WeaponStats {
  return CONFIG.weapons[weaponKind(index)];
}

/** A role choice from a client, if it's valid; otherwise null. */
export function parseWeaponChoice(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < WEAPON_KINDS.length
    ? value
    : null;
}
