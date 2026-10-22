/**
 * The code that lets a refreshed page take its player back. It's kept in sessionStorage, so
 * each tab has its own (two tabs stay two players) and it's gone when the tab closes.
 */
const STORAGE_KEY = 'paint-rush.reconnect';

/** The part of Web Storage used here (lets tests pass a fake). */
export type TokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface SavedToken {
  token: string;
  /** When the page was left (ms since 1970). */
  savedAt: number;
}

function sessionStore(): TokenStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    // Storage blocked (some private-browsing modes): no rejoin, just a fresh join.
    return null;
  }
}

/** Remembers the room's current code, stamped with the time (call when leaving the page). */
export function saveReconnectToken(
  token: string,
  now = Date.now(),
  storage: TokenStorage | null = sessionStore(),
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ token, savedAt: now } satisfies SavedToken));
  } catch {
    // Storage full or blocked: the next load just joins fresh.
  }
}

/**
 * The saved code if it's still worth trying: the server only keeps a dropped player for
 * `maxAgeSeconds`, so older codes are skipped instead of waiting on a rejoin that will fail.
 */
export function loadReconnectToken(
  maxAgeSeconds: number,
  now = Date.now(),
  storage: TokenStorage | null = sessionStore(),
): string | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedToken>;
    if (typeof saved.token !== 'string' || typeof saved.savedAt !== 'number') return null;
    const ageSeconds = (now - saved.savedAt) / 1000;
    return ageSeconds >= 0 && ageSeconds < maxAgeSeconds ? saved.token : null;
  } catch {
    return null;
  }
}

export function clearReconnectToken(storage: TokenStorage | null = sessionStore()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up.
  }
}
