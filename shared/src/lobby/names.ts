import { CONFIG } from '../config';

/** Used when someone leaves the name empty. */
export const DEFAULT_PLAYER_NAME = 'Player';

/**
 * A player name safe to show everyone: no control characters, single spaces, trimmed, and at
 * most `maxNameLength` characters (emoji count as one). Empty or invalid names become "Player".
 */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_PLAYER_NAME;
  const visible = Array.from(raw)
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      const control = code < 0x20 || (code >= 0x7f && code < 0xa0);
      return control ? ' ' : char;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  const name = Array.from(visible).slice(0, CONFIG.lobby.maxNameLength).join('').trim();
  return name || DEFAULT_PLAYER_NAME;
}
