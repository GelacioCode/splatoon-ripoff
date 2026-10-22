import { DEFAULT_WEAPON, parseWeaponChoice } from '@paint-rush/shared';

export type Quality = 'auto' | 'low' | 'medium' | 'high';

/** Player preferences, saved in this browser. */
export interface Settings {
  /** Multiplier on the base mouse sensitivity (CONFIG.camera.mouseSensitivity). */
  mouseSensitivity: number;
  /** Multiplier on the base touch-drag sensitivity. */
  touchSensitivity: number;
  invertY: boolean;
  quality: Quality;
  /** Sound volume, 0–1. */
  volume: number;
  /** Aim by turning the phone (needs https:// and, on iPhone, a permission tap). */
  gyro: boolean;
  gyroSensitivity: number;
  /** Chosen role: an index in WEAPON_KINDS (0 assault, 1 sniper, 2 machine gun). */
  weapon: number;
}

export const DEFAULT_SETTINGS: Settings = {
  mouseSensitivity: 1,
  touchSensitivity: 1,
  invertY: false,
  quality: 'auto',
  volume: 0.8,
  gyro: false,
  gyroSensitivity: 1,
  weapon: DEFAULT_WEAPON,
};

const STORAGE_KEY = 'paint-rush.settings';
const QUALITIES: Quality[] = ['auto', 'low', 'medium', 'high'];

function numberIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

/** Reads saved settings, keeping only valid values and filling in defaults for the rest. */
export function parseSettings(raw: string | null): Settings {
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') saved = parsed as Record<string, unknown>;
  } catch {
    // Corrupted settings: start over from the defaults.
  }
  const d = DEFAULT_SETTINGS;
  return {
    mouseSensitivity: numberIn(saved.mouseSensitivity, 0.1, 5, d.mouseSensitivity),
    touchSensitivity: numberIn(saved.touchSensitivity, 0.1, 5, d.touchSensitivity),
    invertY: typeof saved.invertY === 'boolean' ? saved.invertY : d.invertY,
    quality: QUALITIES.includes(saved.quality as Quality) ? (saved.quality as Quality) : d.quality,
    volume: numberIn(saved.volume, 0, 1, d.volume),
    gyro: typeof saved.gyro === 'boolean' ? saved.gyro : d.gyro,
    gyroSensitivity: numberIn(saved.gyroSensitivity, 0.1, 5, d.gyroSensitivity),
    weapon: parseWeaponChoice(saved.weapon) ?? d.weapon,
  };
}

export function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage blocked (e.g. some private-browsing modes): use defaults.
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: settings just won't be remembered.
  }
}
