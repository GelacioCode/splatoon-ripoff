import { CONFIG } from '../config';

/**
 * Where a match is: players gathering in the lobby, the team reveal, the 3-2-1 countdown, then
 * playing. (Phase 4 adds the end of the match.)
 */
export type MatchPhase = 'lobby' | 'reveal' | 'countdown' | 'playing';

/** How long a timed phase lasts (s), or null for phases that wait for something else. */
export function phaseSeconds(phase: MatchPhase): number | null {
  if (phase === 'reveal') return CONFIG.lobby.revealSeconds;
  if (phase === 'countdown') return CONFIG.lobby.countdownSeconds;
  return null;
}

/** The phase after a timed one runs out (the lobby only moves on when the host starts). */
export function nextPhase(phase: MatchPhase): MatchPhase {
  if (phase === 'reveal') return 'countdown';
  if (phase === 'countdown') return 'playing';
  return phase;
}

/** Synced as a plain string; anything unexpected (e.g. before the first update) counts as the lobby. */
export function parsePhase(value: unknown): MatchPhase {
  return value === 'reveal' || value === 'countdown' || value === 'playing' ? value : 'lobby';
}

export function isMatchLength(value: unknown): value is number {
  return typeof value === 'number' && CONFIG.lobby.matchMinuteOptions.includes(value);
}

/** The match length a new lobby starts with (minutes). */
export function defaultMatchMinutes(): number {
  return Math.round(CONFIG.match.durationSeconds / 60);
}
