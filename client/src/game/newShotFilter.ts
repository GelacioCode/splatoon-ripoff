/**
 * Prediction replays recent ticks after every server update, so the same shots get "fired"
 * again. Shots are numbered (`shotCount`), so only numbers never seen before are new.
 */
export class NewShotFilter {
  private highest: number;

  /** `shotCount`: the player's shot number when prediction starts. */
  constructor(shotCount: number) {
    this.highest = shotCount;
  }

  /**
   * A tick fired `fired` shots, ending at shot number `shotCount`. Returns how many of them
   * (counted from the last one back) haven't been shown yet.
   */
  take(shotCount: number, fired: number): number {
    const fresh = Math.max(0, Math.min(fired, shotCount - this.highest));
    this.highest = Math.max(this.highest, shotCount);
    return fresh;
  }
}
