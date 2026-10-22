import { schema, t, type SchemaType } from '@colyseus/schema';

/** A connected player, as every client sees them. */
export const PlayerInfo = schema(
  {
    name: t.string(),
  },
  'PlayerInfo',
);
export type PlayerInfo = SchemaType<typeof PlayerInfo>;

/** Synced state of the Phase 0 sandbox room. */
export const SandboxState = schema(
  {
    players: t.map(PlayerInfo),
  },
  'SandboxState',
);
export type SandboxState = SchemaType<typeof SandboxState>;
