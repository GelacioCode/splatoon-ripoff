import { schema, t, type SchemaType } from '@colyseus/schema';

// Numbers use plain float32 (not t.quantized / t.angle): Colyseus prediction only mirrors
// plain numeric fields, and a field it skips leaves the predicted player without a position.

/**
 * One tick of player input on the wire. Mirrors `PlayerInput` field for field, so the shared
 * step functions can read either one.
 */
export const NetInput = schema(
  {
    moveX: t.float32(),
    moveY: t.float32(),
    aimYaw: t.float32(),
    aimPitch: t.float32(),
    fire: t.boolean(),
    swim: t.boolean(),
    jump: t.boolean(),
    reload: t.boolean(),
    aim: t.boolean(),
  },
  'NetInput',
);
export type NetInput = SchemaType<typeof NetInput>;

/**
 * A player as the server shares it. Has every `PlayerState` field, so the client can predict
 * its own player with the same rules. Fields marked `.view()` (timers, ink) only go to the
 * player who owns them; everyone else gets just what they need to draw the player.
 * (Bandwidth gets measured and trimmed in Phase 5.)
 */
export const NetPlayer = schema(
  {
    // Everyone: enough to draw and animate the player.
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
    vx: t.float32(),
    vy: t.float32(),
    vz: t.float32(),
    yaw: t.float32(),
    team: t.uint8(),
    weapon: t.uint8(),
    grounded: t.boolean(),
    swimBlend: t.float32(),
    submerged: t.boolean(),
    climbing: t.boolean(),
    aiming: t.boolean(),
    hp: t.float32(),
    respawnTimer: t.float32(),
    protectTimer: t.float32(),
    // Owner only: what prediction needs on top of that.
    airTime: t.float32().view(),
    jumped: t.boolean().view(),
    jumpBuffer: t.float32().view(),
    jumpHeld: t.boolean().view(),
    ink: t.float32().view(),
    fireCooldown: t.float32().view(),
    sinceShot: t.float32().view(),
    reloadTimer: t.float32().view(),
    shotCount: t.uint32().view(),
    sinceDamage: t.float32().view(),
    groundTeam: t.int8().view(),
    // Not simulation state: shown in the lobby. Has a default, so a NetPlayer can still be
    // built from a plain PlayerState (fields without one must be passed in).
    name: t.string().default(''),
    // The look (see LOOK_OPTIONS): one small number per part, only resent when it changes.
    eyes: t.uint8().default(0),
    hat: t.uint8().default(0),
    goggles: t.uint8().default(0),
    shoes: t.uint8().default(0),
    body: t.uint8().default(0),
  },
  'NetPlayer',
);
export type NetPlayer = SchemaType<typeof NetPlayer>;

/** Everything a match room syncs. Players are keyed by session id. */
export const MatchState = schema(
  {
    /** A MatchPhase ('lobby', 'reveal', 'countdown', 'playing'); read it with parsePhase. */
    phase: t.string().default('lobby'),
    /** Session id of the host (who can start, kick and set the match length). */
    hostId: t.string().default(''),
    matchMinutes: t.uint8().default(5),
    /** Whole seconds left in a timed phase (the reveal, the 3-2-1 countdown). */
    countdown: t.uint8().default(0),
    players: t.map(NetPlayer),
  },
  'MatchState',
);
export type MatchState = SchemaType<typeof MatchState>;
