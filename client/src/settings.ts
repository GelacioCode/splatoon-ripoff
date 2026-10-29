import {
  CONFIG,
  DEFAULT_LOOK,
  DEFAULT_WEAPON,
  parseLook,
  parseWeaponChoice,
  type Look,
} from '@paint-rush/shared';
import { CONTROLS_SETTINGS, type ControlsSetting } from './input/controlsMode';

export type Quality = 'auto' | 'low' | 'medium' | 'high';

/** Player preferences, saved in this browser. */
export interface Settings {
  /** Multiplier on the base mouse sensitivity (CONFIG.camera.mouseSensitivity). */
  mouseSensitivity: number;
  /** Multiplier on the base touch-drag sensitivity. */
  touchSensitivity: number;
  invertY: boolean;
  quality: Quality;
  /** Master volume, 0–1 (everything below is a share of it). */
  volume: number;
  /** Music, sound effects and the multi-kill announcer voice, each 0–1. */
  musicVolume: number;
  effectsVolume: number;
  announcerVolume: number;
  /** Aim by turning the phone (needs https:// and, on iPhone, a permission tap). */
  gyro: boolean;
  gyroSensitivity: number;
  /** Chosen role: an index in WEAPON_KINDS (0 assault, 1 sniper, 2 machine gun). */
  weapon: number;
  /** Name shown in lobbies, as typed (the server cleans it up). Empty until first set. */
  name: string;
  /** The blob's eyes, hat, goggles, shoes and body shape. */
  look: Look;
  /** Touch controls, mouse and keyboard, or let the device decide. */
  controls: ControlsSetting;
  /** Show the FPS / ping panel (always on in development). */
  showStats: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mouseSensitivity: 1,
  touchSensitivity: 1,
  invertY: false,
  quality: 'auto',
  volume: 0.8,
  musicVolume: 0.5,
  effectsVolume: 1,
  announcerVolume: 1,
  gyro: false,
  gyroSensitivity: 1,
  weapon: DEFAULT_WEAPON,
  name: '',
  look: { ...DEFAULT_LOOK },
  controls: 'auto',
  showStats: false,
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
    musicVolume: numberIn(saved.musicVolume, 0, 1, d.musicVolume),
    effectsVolume: numberIn(saved.effectsVolume, 0, 1, d.effectsVolume),
    announcerVolume: numberIn(saved.announcerVolume, 0, 1, d.announcerVolume),
    gyro: typeof saved.gyro === 'boolean' ? saved.gyro : d.gyro,
    gyroSensitivity: numberIn(saved.gyroSensitivity, 0.1, 5, d.gyroSensitivity),
    weapon: parseWeaponChoice(saved.weapon) ?? d.weapon,
    name:
      typeof saved.name === 'string'
        ? Array.from(saved.name).slice(0, CONFIG.lobby.maxNameLength).join('')
        : d.name,
    look: parseLook(saved.look),
    controls: CONTROLS_SETTINGS.includes(saved.controls as ControlsSetting)
      ? (saved.controls as ControlsSetting)
      : d.controls,
    showStats: typeof saved.showStats === 'boolean' ? saved.showStats : d.showStats,
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
