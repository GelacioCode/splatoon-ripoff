import { Room, type Client } from '@colyseus/core';
import { CONFIG, MSG_PING, PlayerInfo, SandboxState } from '@paint-rush/shared';

interface JoinOptions {
  name?: unknown;
}

/** Phase 0 smoke-test room: tracks who is connected and answers pings. */
export class SandboxRoom extends Room<{ state: SandboxState }> {
  maxClients = CONFIG.lobby.maxPlayers;
  state = new SandboxState();

  messages = {
    // The return value answers the client's `room.request()`.
    [MSG_PING]: () => Date.now(),
  };

  onJoin(client: Client, options?: JoinOptions) {
    const name = sanitizeName(options?.name) ?? `Player ${this.state.players.size + 1}`;
    this.state.players.set(client.sessionId, new PlayerInfo({ name }));
    console.log(`[sandbox] ${name} joined (${this.state.players.size} connected)`);
  }

  onLeave(client: Client) {
    const name = this.state.players.get(client.sessionId)?.name ?? client.sessionId;
    this.state.players.delete(client.sessionId);
    console.log(`[sandbox] ${name} left (${this.state.players.size} connected)`);
  }
}

function sanitizeName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.trim().slice(0, CONFIG.lobby.maxNameLength);
  return name.length > 0 ? name : undefined;
}
