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
  },
  lobby: {
    maxPlayers: 30,
    maxNameLength: 16,
  },
  player: {
    maxHp: 100,
    respawnSeconds: 5,
  },
  match: {
    durationSeconds: 5 * 60,
    capturesToWin: 3,
    /** A dropped flag left untouched this long returns to the center. */
    flagReturnSeconds: 15,
    /** Pause after a capture before the flag reappears in the center. */
    flagResetDelaySeconds: 3,
    /** The carrier can't swim and moves at this fraction of normal speed. */
    flagCarrierSpeedMultiplier: 0.8,
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
  },
  camera: {
    /** Vertical field of view (degrees). */
    fov: 70,
    /** How far behind the player the camera sits (m). */
    distance: 3.6,
    /** Sideways offset for the over-the-shoulder view (m, positive = right). */
    shoulderOffset: 0.55,
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
  },
};
