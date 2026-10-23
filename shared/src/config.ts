/**
 * Every tunable gameplay value lives in this one object, so balancing never means hunting
 * through code. The in-game tuning panel (backtick key) edits these values live.
 */
export const CONFIG = {
  net: {
    /** Authoritative server simulation rate (Hz). The offline sandbox uses it too. */
    tickRate: 30,
    /** State snapshots sent to clients per second (Hz). */
    snapshotRate: 20,
    /** Remote players are drawn this far behind the newest snapshot (ms). */
    interpolationDelayMs: 100,
    /**
     * A player's inputs waiting on the server beyond this many get run in the same tick
     * (catch-up), so network hiccups don't leave them permanently behind.
     */
    maxQueuedInputs: 2,
    /** Most inputs one player can run in a single tick while catching up. */
    maxCatchUpSteps: 4,
    /** A dropped player (lost connection, page refresh) is kept this long for them to rejoin (s). */
    reconnectSeconds: 20,
  },
  lobby: {
    maxPlayers: 30,
    maxNameLength: 16,
    /**
     * The lobby's Start button needs this many players, bots included (the server itself
     * accepts 1, for testing).
     */
    minPlayersToStart: 2,
    /** "Play with bots" opens a new lobby with this many bots (the host can change it there). */
    defaultBots: 7,
    /** Match lengths the host can pick (minutes). */
    matchMinuteOptions: [3, 5, 7],
    /** Captures to win that the host can pick (the default is CONFIG.match.capturesToWin). */
    captureGoalOptions: [3, 5, 7],
    /**
     * Arena size by head count at Start (user decision: today's arena is the minimum). Width
     * and length grow by `scale`; heights stay the same. Index = MatchState.arenaSize.
     */
    arenaSizes: [
      { upToPlayers: 10, scale: 1 },
      { upToPlayers: 20, scale: 1.25 },
      { upToPlayers: Infinity, scale: 1.5 },
    ],
    /** How long the team reveal shows before the countdown (s). */
    revealSeconds: 3,
    /** 3 · 2 · 1 before GO (s). Players stand on their spawn pads meanwhile. */
    countdownSeconds: 3,
  },
  player: {
    maxHp: 100,
    /**
     * Respawn wait (user decision): 3 s for your first splat of the match, 1 s longer for each
     * one after, never more than 10 s.
     */
    respawnBaseSeconds: 3,
    respawnStepSeconds: 1,
    respawnMaxSeconds: 10,
    /** Damaging an enemy this long before a teammate splats them counts as an assist (s). */
    assistWindowSeconds: 5,
    /** After respawning, shots can't hurt you for this long (no spawn camping). */
    spawnProtectSeconds: 2,
    /** Shots hit a player inside this ball around their body (m). */
    hitRadius: 0.55,
    /** As a puddle the ball is a little wider and sits low. */
    puddleHitRadius: 0.6,
    /** A splatted player bursts into a splat of the attacker's paint this big (m). */
    splatPaintRadius: 2.2,
  },
  match: {
    durationSeconds: 5 * 60,
    capturesToWin: 3,
    /**
     * After a capture (that doesn't win), "Pink scores!" shows this long before the next
     * round: everyone back on their spawn, paint wiped, a new random layout (s).
     */
    scoredSeconds: 2.5,
    /** A dropped flag left untouched this long returns to the center. */
    flagReturnSeconds: 15,
    /** Pause after a capture before the flag reappears in the center. */
    flagResetDelaySeconds: 3,
    /** The carrier can't swim and moves at this fraction of normal speed. */
    flagCarrierSpeedMultiplier: 0.8,
    /** Standing this close to the flag picks it up (m, measured flat; height within 2 m). */
    flagPickupRadius: 1.3,
  },
  /** King of the Hill (user decisions: a tug-of-war bar, the hill on the middle line). */
  koth: {
    /**
     * Holding the hill alone for this long, net, wins the stage (s): the bar goes from the
     * middle to the enemy's end. While the enemy holds it alone, the bar comes back.
     */
    winSeconds: 60,
    /** The hill circle (m). */
    hillRadius: 4.5,
    /** Players count as in the hill this far above or below its floor (m). */
    hillHeight: 2.5,
  },
  paint: {
    /** Size of one paint-grid cell on floors and walls (m). */
    cellSize: 0.5,
  },
  character: {
    /** Capsule radius (m). */
    radius: 0.4,
    /** Half the length of the capsule's straight middle (m). Total height = 2 × (this + radius). */
    capsuleHalfHeight: 0.2,
    /** Gap the character controller keeps from the map (m). */
    skinWidth: 0.02,
    /** Steepest slope you can walk up (degrees). */
    maxSlopeDeg: 50,
    /** Slopes steeper than this slide you down (degrees). */
    minSlopeSlideDeg: 35,
    /** Ledges lower than this are stepped onto without jumping (m). */
    stepHeight: 0.35,
    /** A ledge must be at least this deep to step onto it (m). */
    stepMinWidth: 0.2,
    /** Keeps you glued to the floor when walking down slopes and steps (m). */
    snapToGround: 0.3,
  },
  movement: {
    /** Top running speed (m/s). */
    walkSpeed: 6,
    /** How quickly you reach top speed on the ground (m/s²). */
    groundAccel: 60,
    /** How quickly you stop on the ground after letting go (m/s²). */
    groundDecel: 50,
    /** Share of ground acceleration available in the air (0–1). */
    airControl: 0.5,
    /** Downward acceleration (m/s²). */
    gravity: 25,
    /** Upward speed of a jump (m/s). 9 m/s with 25 m/s² gravity ≈ 1.6 m high. */
    jumpSpeed: 9,
    /** A jump still works this long after running off a ledge (s). */
    coyoteTime: 0.1,
    /** A jump pressed this long before landing still happens on landing (s). */
    jumpBuffer: 0.12,
    /** Fastest possible fall (m/s). */
    maxFallSpeed: 30,
    /** Walking speed multiplier while aiming. */
    aimSpeedMultiplier: 0.65,
  },
  camera: {
    /** Vertical field of view (degrees). */
    fov: 70,
    /** How far behind the player the camera sits (m). */
    distance: 4.6,
    /** Sideways offset for the over-the-shoulder view (m, positive = right). */
    shoulderOffset: 0.65,
    /** Height of the point the camera orbits, above the feet (m). */
    pivotHeight: 1.3,
    /** Lowest and highest look angles (degrees). */
    minPitchDeg: -70,
    maxPitchDeg: 60,
    /** Radians of turn per pixel of mouse movement. */
    mouseSensitivity: 0.0022,
    /** How tightly the camera follows the player (higher = stiffer). */
    followSharpness: 18,
    /** How far the camera stays off walls when they push it closer (m). */
    collisionPadding: 0.25,
    /** Extra field of view while swimming fast, for a sense of speed (degrees). */
    swimFovBoost: 8,
    /** Aim mode: zoomed field of view (degrees), closer camera and wider shoulder offset (m). */
    aimFov: 48,
    aimDistance: 2.6,
    aimShoulderOffset: 0.85,
    /** Look sensitivity multiplier while aiming, for fine adjustments. */
    aimSensitivity: 0.55,
  },
  swim: {
    /** Time to melt into a puddle or pop back out (s). */
    transformTime: 0.15,
    /** Top speed swimming through your own paint (m/s). */
    swimSpeed: 11,
    /** How quickly you reach swimming speed (m/s²). */
    swimAccel: 80,
    /** Top speed as a puddle outside your own paint (m/s). */
    puddleSpeed: 3,
    /** Upward speed when jumping out of your own paint (m/s). */
    swimJumpSpeed: 11,
    /** Climbing speed up a wall painted in your color (m/s). */
    climbSpeed: 7,
    /** Upward pop when you reach the top of a painted wall (m/s). */
    climbTopPop: 6,
    /** Ink refilled per second while hidden in your own paint. */
    inkRefillRate: 10,
  },
  health: {
    /** Enemy paint multiplies your speed by this. */
    enemyPaintSpeedMultiplier: 0.45,
    /** Enemy paint multiplies your jump by this. */
    enemyPaintJumpMultiplier: 0.7,
    /** Damage per second from standing in enemy paint. */
    enemyPaintDamagePerSecond: 18,
    /** Enemy paint alone can't take you below this HP. */
    enemyPaintMinHp: 40,
    /** Health starts coming back this long after the last damage (s). */
    regenDelay: 1.5,
    /** Health regained per second. */
    regenPerSecond: 30,
  },
  /** Settings shared by every role's weapon. Each role's own numbers are in `weapons`. */
  weapon: {
    /** How fast shots drop after their straight part (m/s²). */
    projectileGravity: 30,
    /** Shots that hit nothing disappear after this long (s). */
    maxLifetime: 1.5,
    /** Aimed shots fly this much faster. */
    aimProjectileSpeedMultiplier: 1.25,
    /** The trail only lands when the floor is at most this far below the shot (m). */
    dripMaxHeight: 2.5,
    /**
     * How wide a shot's trail line is drawn (m). The swimmable paint under it is wider: every
     * cell within the role's dripRadius of the line, so swimming along it never breaks.
     */
    trailWidth: 0.24,
    /** Ink used per shot (the tank holds `magazine` shots). */
    inkPerShot: 1,
    /** A partly empty tank reloads by itself after this long without shooting (s). */
    autoReloadAfterSeconds: 10,
    /** Where the nozzle sits relative to the feet: up, to the right and forward (m). */
    muzzleHeight: 0.5,
    muzzleRight: 0.44,
    muzzleForward: 0.6,
  },
  /**
   * The three roles players pick from. Fields per role:
   * - magazine: shots before a reload; reloadSeconds: how long the reload takes
   * - fireInterval: seconds between shots while the trigger is held
   * - spreadDeg / aimSpreadDeg: random aim wobble per shot, normally / while aiming (degrees)
   * - projectileSpeed (m/s); straightTime / aimStraightTime: flight before dropping (s)
   * - splatRadius: paint left on a hit (m)
   * - dripEvery: length of each piece of the straight paint trail (m); dripRadius: cells this
   *   close to the trail line get painted (m). At least 0.36 (half a cell's diagonal), or the
   *   swimmable line gets gaps.
   * - moveSpeedMultiplier: walking and swimming speed (heavier guns are slower)
   * - damage: HP taken from an enemy per hit (players have CONFIG.player.maxHp)
   */
  weapons: {
    /** Balanced all-rounder. */
    assault: {
      magazine: 20,
      reloadSeconds: 2.5,
      fireInterval: 0.125,
      spreadDeg: 3,
      aimSpreadDeg: 0.6,
      projectileSpeed: 24,
      straightTime: 0.15,
      aimStraightTime: 0.4,
      splatRadius: 0.85,
      dripEvery: 1.5,
      dripRadius: 0.36,
      moveSpeedMultiplier: 1,
      // 3 hits (user decision): same as the machine gun; they differ in range.
      damage: 34,
    },
    /** Few, slow, pinpoint long-range shots with a long paint trail. Fastest on foot. */
    sniper: {
      magazine: 5,
      reloadSeconds: 2.5,
      fireInterval: 0.6,
      spreadDeg: 0.4,
      aimSpreadDeg: 0,
      projectileSpeed: 45,
      straightTime: 0.6,
      aimStraightTime: 1,
      splatRadius: 1.1,
      dripEvery: 0.9,
      dripRadius: 0.36,
      moveSpeedMultiplier: 1.1,
      // 2 hits (user decision).
      damage: 50,
    },
    /** A short-range spray of small splats. Heaviest, so the slowest on foot. */
    machineGun: {
      magazine: 40,
      reloadSeconds: 3,
      fireInterval: 0.07,
      spreadDeg: 6,
      aimSpreadDeg: 3,
      projectileSpeed: 20,
      straightTime: 0.08,
      aimStraightTime: 0.2,
      splatRadius: 0.6,
      dripEvery: 2,
      dripRadius: 0.36,
      moveSpeedMultiplier: 0.8,
      // 3 hits (user decision), but only up close: short range is its trade-off.
      damage: 34,
    },
  },
};
