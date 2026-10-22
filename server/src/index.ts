import { createEndpoint, createRouter, defineRoom, defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DEFAULT_SERVER_PORT, PROTOCOL_VERSION, ROOM_SANDBOX } from '@paint-rush/shared';
import { initPhysics } from '@paint-rush/shared/sim';
import { SandboxRoom } from './rooms/SandboxRoom';

const rapierVersion = await initPhysics();
console.log(`[server] Rapier ${rapierVersion} ready`);

const health = createEndpoint('/health', { method: 'GET' }, async () => ({
  ok: true,
  protocol: PROTOCOL_VERSION,
  rapier: rapierVersion,
}));

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: {
    [ROOM_SANDBOX]: defineRoom(SandboxRoom),
  },
  routes: createRouter({ health }),
});

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
await server.listen(port);
console.log(`[server] listening on http://localhost:${port}`);
