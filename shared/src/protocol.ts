import type { Look } from './lobby/look';

/** Bump whenever client/server messages change in an incompatible way. */
export const PROTOCOL_VERSION = 5;

export const DEFAULT_SERVER_PORT = 2567;

/**
 * Colyseus room name. Each lobby is one room of this type; its room id is the lobby code
 * (e.g. `K7QX`), so players join with `joinById(code)`.
 */
export const ROOM_MATCH = 'match';

/** Options a client sends when creating or joining a lobby. Everything is checked by the server. */
export interface MatchJoinOptions {
  name?: string;
  /** Starting role (index in WEAPON_KINDS); invalid values mean assault. */
  weapon?: number;
  /** The blob's look (see LOOK_OPTIONS); invalid parts get the default. */
  look?: Look;
}

/** Client → server, in the lobby only: a new look. Payload: a Look. */
export const MSG_SET_LOOK = 'setLook';

/** Server → a shooter whose shot hit an enemy. Payload: true if it splatted them. */
export const MSG_HIT = 'hit';

/** Server → everyone: someone was splatted. Payload: a SplatEvent. */
export const MSG_SPLAT = 'splat';

export interface SplatEvent {
  /** Session ids; `by` is empty if the attacker already left. */
  victim: string;
  by: string;
  /** The attacker's team (its color for the burst and the kill feed). */
  team: number;
}

/** Client → server: switch to another role. Payload: the role's index in WEAPON_KINDS. */
export const MSG_CHOOSE_WEAPON = 'chooseWeapon';

/** Host → server: start the match (team reveal, countdown, play). No payload. */
export const MSG_START = 'start';

/** Host → server: remove a player. Payload: their session id. */
export const MSG_KICK = 'kick';

/** Server → a kicked player, just before closing their connection. No payload. */
export const MSG_KICKED = 'kicked';

/** Host → server: match length. Payload: minutes, one of CONFIG.lobby.matchMinuteOptions. */
export const MSG_MATCH_LENGTH = 'matchLength';

/**
 * Client → server (development only): which addresses this computer has on the local network,
 * so a host page opened on `localhost` can put a QR code phones can actually reach.
 * The server answers with MSG_LAN_ADDRESSES: a list of IPv4 addresses.
 */
export const MSG_REQUEST_LAN = 'requestLan';
export const MSG_LAN_ADDRESSES = 'lanAddresses';

/** Client → server: send me all paint on the map (after joining or reconnecting). No payload. */
export const MSG_REQUEST_PAINT = 'requestPaint';

/** Server → client, bytes: the whole paint grid (see encodePaintSnapshot). */
export const MSG_PAINT_SNAPSHOT = 'paintSnapshot';

/** Server → everyone, bytes: the paint that landed this tick (see encodePaintEvents). */
export const MSG_PAINT = 'paint';

/** Server → everyone but the shooter, bytes: shots fired this tick (see encodeShotEvents). */
export const MSG_SHOTS = 'shots';

/**
 * Client → server: a plain network ping. Payload: a client timestamp (ms), which the server
 * echoes straight back in MSG_PONG. Unlike the input round trip, nothing waits in a queue.
 */
export const MSG_PING = 'ping';
export const MSG_PONG = 'pong';
