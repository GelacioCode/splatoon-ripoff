/** The host's game mode for a whole match. 'random' flips a coin for every stage. */
export type GameMode = 'ctf' | 'koth' | 'random';

/** What one stage (round) is played as. */
export type StageMode = 'ctf' | 'koth';

export const GAME_MODES: readonly GameMode[] = ['ctf', 'koth', 'random'];

export const GAME_MODE_NAMES: Record<GameMode, string> = {
  ctf: 'All Capture the Flag',
  koth: 'All King of the Hill',
  random: 'All random (coin flip each stage)',
};

export const STAGE_MODE_NAMES: Record<StageMode, string> = {
  ctf: 'Capture the Flag',
  koth: 'King of the Hill',
};

export function isGameMode(value: unknown): value is GameMode {
  return GAME_MODES.includes(value as GameMode);
}

/** A synced game mode string ('ctf' for anything unknown). */
export function parseGameMode(value: unknown): GameMode {
  return isGameMode(value) ? value : 'ctf';
}

/** A synced stage mode string ('ctf' for anything unknown). */
export function parseStageMode(value: unknown): StageMode {
  return value === 'koth' ? 'koth' : 'ctf';
}

/** What the next stage is: fixed for the "All …" modes, a coin flip for random. */
export function pickStageMode(mode: GameMode, random: () => number): StageMode {
  if (mode === 'random') return random() < 0.5 ? 'ctf' : 'koth';
  return mode;
}
