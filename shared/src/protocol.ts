/** Bump whenever client/server messages change in an incompatible way. */
export const PROTOCOL_VERSION = 3;

export const DEFAULT_SERVER_PORT = 2567;

/** Colyseus room names. */
export const ROOM_ARENA = 'arena';

/** Client → server: switch to another role. Payload: the role's index in WEAPON_KINDS. */
export const MSG_CHOOSE_WEAPON = 'chooseWeapon';

/** Client → server: send me all paint on the map (after joining or reconnecting). No payload. */
export const MSG_REQUEST_PAINT = 'requestPaint';

/** Server → client, bytes: the whole paint grid (see encodePaintSnapshot). */
export const MSG_PAINT_SNAPSHOT = 'paintSnapshot';

/** Server → everyone, bytes: the paint that landed this tick (see encodePaintEvents). */
export const MSG_PAINT = 'paint';

/** Server → everyone but the shooter, bytes: shots fired this tick (see encodeShotEvents). */
export const MSG_SHOTS = 'shots';

/** Options a client sends when joining the arena. */
export interface ArenaJoinOptions {
  /** Starting role (index in WEAPON_KINDS); invalid values mean assault. */
  weapon?: number;
}
