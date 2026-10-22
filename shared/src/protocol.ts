/** Bump whenever client/server messages change in an incompatible way. */
export const PROTOCOL_VERSION = 2;

export const DEFAULT_SERVER_PORT = 2567;

/** Colyseus room names. */
export const ROOM_ARENA = 'arena';

/** Client → server: switch to another role. Payload: the role's index in WEAPON_KINDS. */
export const MSG_CHOOSE_WEAPON = 'chooseWeapon';

/** Options a client sends when joining the arena. */
export interface ArenaJoinOptions {
  /** Starting role (index in WEAPON_KINDS); invalid values mean assault. */
  weapon?: number;
}
