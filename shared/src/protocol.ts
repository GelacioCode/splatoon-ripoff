import type { Look } from './lobby/look';

/** Bump whenever client/server messages change in an incompatible way. */
export const PROTOCOL_VERSION = 12;

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
  /**
   * Development only (ignored in production): the lobby's creator can force an arena size step
   * (see CONFIG.lobby.arenaSizes), to try big arenas without 11+ players.
   */
  devArenaSize?: number;
  /** Creating a lobby only ("Play with bots"): start it with this many bots. */
  bots?: number;
}

/**
 * Host → server, in the lobby only: how many bots to have (the server plays them). Payload: a
 * whole number; the server keeps bots + people within CONFIG.lobby.maxPlayers.
 */
export const MSG_SET_BOTS = 'setBots';

/** Client → server, in the lobby only: a new look. Payload: a Look. */
export const MSG_SET_LOOK = 'setLook';

/** Server → a shooter whose shot hit an enemy. Payload: true if it splatted them. */
export const MSG_HIT = 'hit';

/** Server → everyone: someone was splatted. Payload: a SplatEvent. */
export const MSG_SPLAT = 'splat';

/**
 * Server → everyone: objective news for the announcements. Payload: a FlagEvent ('taken',
 * 'dropped', 'captured', 'returned' or 'reset') or a HillEvent ('hillHeld', 'hillWon').
 */
export const MSG_FLAG = 'flag';

export interface SplatEvent {
  /** Session ids; `by` is empty if the attacker already left. */
  victim: string;
  by: string;
  /** The attacker's team (its color for the burst and the kill feed). */
  team: number;
  /** The attacker's multi-kill streak with this splat (1 alone, 2 a double … see multiKillName). */
  streak: number;
}

/** Server → everyone but the thrower: a bomb was thrown. Payload: a BombThrow. */
export const MSG_BOMB = 'bomb';

/** Server → everyone: a bomb went off (its paint comes as usual in MSG_PAINT). */
export const MSG_BLAST = 'blast';

/** Server → everyone: someone took a bomb crate. Payload: a CrateTaken. */
export const MSG_CRATE = 'crate';

export interface BombThrow {
  /** The thrower's session id and throw number (see Bomb). */
  owner: string;
  number: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  team: number;
}

export interface BombBlast {
  owner: string;
  number: number;
  x: number;
  y: number;
  z: number;
  team: number;
}

export interface CrateTaken {
  /** Who took it (session id), and where it was. */
  by: string;
  x: number;
  y: number;
  z: number;
}

/** Client → server: switch to another role. Payload: the role's index in WEAPON_KINDS. */
export const MSG_CHOOSE_WEAPON = 'chooseWeapon';

/** Host → server: start the match (team reveal, countdown, play). No payload. */
export const MSG_START = 'start';

/** Host → server: remove a player. Payload: their session id. */
export const MSG_KICK = 'kick';

/** Server → a kicked player, just before closing their connection. No payload. */
export const MSG_KICKED = 'kicked';

/**
 * Host → server, once a match has ended: everyone back to the lobby (names and looks kept,
 * paint wiped, teams shuffled again on the next start). No payload.
 */
export const MSG_PLAY_AGAIN = 'playAgain';

/** Host → server: stages (rounds) to win. Payload: one of CONFIG.lobby.captureGoalOptions. */
export const MSG_CAPTURE_GOAL = 'captureGoal';

/** Host → server, in the lobby only: the game mode. Payload: a GameMode. */
export const MSG_GAME_MODE = 'gameMode';

/** Host → server, in the lobby only: the map (a theme, or 'random'). Payload: a MapChoice. */
export const MSG_MAP_THEME = 'mapTheme';

/** Host → server, in the lobby only: the team color pair. Payload: an index in TEAM_PALETTES. */
export const MSG_TEAM_COLORS = 'teamColors';

/** Client → server, in the lobby only: my team wish. Payload: 0, 1 or −1 (AUTO_TEAM). */
export const MSG_PICK_TEAM = 'pickTeam';

/**
 * Client → server, during a match: switch me to the other team (allowed unless it's the
 * bigger team; see canSwitchTeam). No payload.
 */
export const MSG_SWITCH_TEAM = 'switchTeam';

/**
 * Server → clients: team news. Payload: a TeamNews. 'switched' goes to everyone (someone
 * changed sides mid-match); 'moved' only to a player whose lobby pick couldn't be kept.
 */
export const MSG_TEAM_NEWS = 'teamNews';

export interface TeamNews {
  kind: 'switched' | 'moved';
  /** Who it's about (session id). */
  by: string;
  /** The team they're on now. */
  team: number;
}

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
