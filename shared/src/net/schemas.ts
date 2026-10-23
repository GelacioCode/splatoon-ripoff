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
    carrying: t.boolean(),
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
    /** A bot the server plays itself ("Play with bots"), not a person. */
    bot: t.boolean().default(false),
    // The look (see LOOK_OPTIONS): one small number per part, only resent when it changes.
    eyes: t.uint8().default(0),
    hat: t.uint8().default(0),
    goggles: t.uint8().default(0),
    shoes: t.uint8().default(0),
    body: t.uint8().default(0),
    // Match stats (see PlayerStats), for the scoreboard and the results.
    kills: t.uint16().default(0),
    deaths: t.uint16().default(0),
    assists: t.uint16().default(0),
    captures: t.uint8().default(0),
    paint: t.uint32().default(0),
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
    // Capture the Flag.
    score0: t.uint8().default(0),
    score1: t.uint8().default(0),
    /** Whole seconds of match time left while playing. */
    timeLeft: t.uint16().default(0),
    /** A FlagState: 'home', 'carried', 'dropped' or 'away'. */
    flagState: t.string().default('home'),
    flagX: t.float32().default(0),
    flagY: t.float32().default(0),
    flagZ: t.float32().default(0),
    /** Session id of the flag carrier, or ''. */
    flagCarrier: t.string().default(''),
    /** Whole seconds until a dropped flag returns home. */
    flagTimer: t.uint8().default(0),
    /** Once the match has ended: the winning team, or −1 for a draw. */
    winner: t.int8().default(-1),
    /** How it was won: a MatchResult reason ('captures', 'time', 'turf' or 'draw'). */
    winReason: t.string().default(''),
    /** Each team's paint points over the whole match (paint is wiped every round). */
    turf0: t.uint32().default(0),
    turf1: t.uint32().default(0),
    /** Stages (rounds) to win, set by the host in the lobby (3, 5 or 7). */
    capturesToWin: t.uint8().default(3),
    /** The host's team color pair: an index into TEAM_PALETTES. */
    teamColors: t.uint8().default(0),
    /** The host's GameMode ('ctf', 'koth' or 'random'); read it with parseGameMode. */
    gameMode: t.string().default('ctf'),
    /** What this stage is played as: a StageMode ('ctf' or 'koth'); read it with parseStageMode. */
    stageMode: t.string().default('ctf'),
    // King of the Hill (koth stages): the circle, and the tug-of-war bar (see Hill).
    hillX: t.float32().default(0),
    hillY: t.float32().default(0),
    hillZ: t.float32().default(0),
    /** −100 … 100: team 0 wins the stage at +100, team 1 at −100. */
    hillBalance: t.float32().default(0),
    /** Who's in the hill: a team, −1 (nobody) or 2 (both: contested). */
    hillHolder: t.int8().default(-1),
    /**
     * The current round's layout: 0 is Drip Yard, anything else a random layout every screen
     * builds the same way (see arenaFor). It changes after every capture.
     */
    mapSeed: t.uint32().default(0),
    /** Arena size step for this match, from the head count at Start (see arenaSizeFor). */
    arenaSize: t.uint8().default(0),
    players: t.map(NetPlayer),
  },
  'MatchState',
);
export type MatchState = SchemaType<typeof MatchState>;
