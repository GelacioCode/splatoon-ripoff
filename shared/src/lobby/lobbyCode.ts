/** Letters and digits that can't be mixed up when read aloud or off a screen (no I/1, O/0). */
export const LOBBY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LOBBY_CODE_LENGTH = 4;
/** Gives up after this many collisions (only possible with nearly all codes in use). */
const MAX_TRIES = 1000;

/** A fresh lobby code such as `K7QX` that `isTaken` doesn't already know. */
export function generateLobbyCode(
  random: () => number,
  isTaken: (code: string) => boolean,
): string {
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    let code = '';
    for (let i = 0; i < LOBBY_CODE_LENGTH; i++) {
      code += LOBBY_CODE_ALPHABET[Math.floor(random() * LOBBY_CODE_ALPHABET.length)];
    }
    if (!isTaken(code)) return code;
  }
  throw new Error('No free lobby codes left');
}

/** A typed or linked code, tidied up (`" k7qx "` → `"K7QX"`), or null if it can't be one. */
export function parseLobbyCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  if (code.length !== LOBBY_CODE_LENGTH) return null;
  for (const char of code) if (!LOBBY_CODE_ALPHABET.includes(char)) return null;
  return code;
}
