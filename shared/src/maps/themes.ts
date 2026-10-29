/**
 * How the arena looks (user decision: looks only). Every theme plays on the same random
 * layouts with the same collision; only colors, the ground pattern, the sky and the scenery
 * outside the walls change. 'yard' is the original look (Drip Yard).
 */
export type MapTheme = 'yard' | 'forest' | 'desert' | 'office';

/** The host's map setting: one theme for every round, or 'random' (a new one every round). */
export type MapChoice = MapTheme | 'random';

export const MAP_THEMES: readonly MapTheme[] = ['yard', 'forest', 'desert', 'office'];

export const MAP_CHOICES: readonly MapChoice[] = [...MAP_THEMES, 'random'];

export const MAP_CHOICE_NAMES: Record<MapChoice, string> = {
  yard: 'Drip Yard',
  forest: 'Forest',
  desert: 'Desert',
  office: 'Office',
  random: 'Random (new map every round)',
};

export function isMapChoice(value: unknown): value is MapChoice {
  return MAP_CHOICES.includes(value as MapChoice);
}

/** A synced map setting ('yard' for anything unknown). */
export function parseMapChoice(value: unknown): MapChoice {
  return isMapChoice(value) ? value : 'yard';
}

/** A synced theme ('yard' for anything unknown). */
export function parseMapTheme(value: unknown): MapTheme {
  return MAP_THEMES.includes(value as MapTheme) ? (value as MapTheme) : 'yard';
}

/**
 * The theme for the next round: the chosen one, or for 'random' any theme but the one just
 * played (so every round really looks different).
 */
export function pickStageTheme(
  choice: MapChoice,
  random: () => number,
  previous?: MapTheme,
): MapTheme {
  if (choice !== 'random') return choice;
  const options = MAP_THEMES.filter((theme) => theme !== previous);
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}
