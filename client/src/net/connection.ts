import { Client } from '@colyseus/sdk';
import { MSG_PING, ROOM_SANDBOX, SandboxState } from '@paint-rush/shared';

export interface ConnectionStatus {
  state: 'connecting' | 'connected' | 'offline';
  players?: number;
  rttMs?: number;
}

const RETRY_DELAY_MS = 2000;
const PING_INTERVAL_MS = 2000;

/**
 * Joins the Phase 0 sandbox room and keeps retrying while the server is down (for example
 * while `tsx watch` restarts it). Reports connection state, player count and round-trip time.
 */
export function connectToSandbox(serverUrl: string, onStatus: (status: ConnectionStatus) => void) {
  const client = new Client(serverUrl);
  const name = `Blob-${Math.floor(1000 + Math.random() * 9000)}`;

  const retrySoon = () => {
    onStatus({ state: 'offline' });
    setTimeout(join, RETRY_DELAY_MS);
  };

  function join() {
    onStatus({ state: 'connecting' });
    client.joinOrCreate(ROOM_SANDBOX, { name }, SandboxState).then(
      (room) => {
        // A server restart wipes every room, so there is nothing to reconnect to: join a
        // fresh room instead. Rejoining as the same player comes with the lobby in Phase 3.
        room.reconnection.enabled = false;

        let rttMs: number | undefined;
        const publish = () =>
          onStatus({ state: 'connected', players: room.state.players.size, rttMs });

        let pingInFlight = false;
        const ping = async () => {
          if (pingInFlight) return;
          pingInFlight = true;
          const sentAt = performance.now();
          try {
            await room.request(MSG_PING);
            rttMs = Math.round(performance.now() - sentAt);
            publish();
          } catch {
            // The room closed mid-request; onLeave updates the status.
          } finally {
            pingInFlight = false;
          }
        };
        const pingTimer = setInterval(() => void ping(), PING_INTERVAL_MS);

        room.onStateChange(publish);
        room.onLeave((code) => {
          console.info(`[net] left the room (code ${code})`);
          clearInterval(pingTimer);
          retrySoon();
        });

        publish();
        void ping();
      },
      (error: unknown) => {
        console.warn('[net] could not join the server, retrying…', error);
        retrySoon();
      },
    );
  }

  join();
}
