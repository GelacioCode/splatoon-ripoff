/**
 * Every tunable gameplay value lives in this one object, so balancing never means hunting
 * through code. Later phases add movement, weapon and paint tuning here.
 */
export const CONFIG = {
  net: {
    /** Authoritative server simulation rate (Hz). */
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
};
