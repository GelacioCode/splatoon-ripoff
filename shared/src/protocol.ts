/** Bump whenever client/server messages change in an incompatible way. */
export const PROTOCOL_VERSION = 1;

export const DEFAULT_SERVER_PORT = 2567;

/** Colyseus room names. */
export const ROOM_SANDBOX = 'sandbox';

/** Request names (client → server, answered with a reply). */
export const MSG_PING = 'ping';
