/** Runs game logic at a fixed rate, independent of how fast frames are drawn. */
export class FixedStep {
  /** Length of one logic step (s). Can change at any time, e.g. from the tuning panel. */
  stepSeconds: number;
  private readonly maxFrameSeconds: number;
  private accumulator = 0;

  constructor(stepSeconds: number, maxFrameSeconds = 0.25) {
    this.stepSeconds = stepSeconds;
    this.maxFrameSeconds = maxFrameSeconds;
  }

  /**
   * Adds one frame's elapsed time and returns how many logic steps are due. Long frames are
   * capped, so a stalled tab doesn't trigger a huge burst of catch-up steps.
   */
  advance(frameSeconds: number): number {
    this.accumulator += Math.min(Math.max(frameSeconds, 0), this.maxFrameSeconds);
    let steps = 0;
    while (this.accumulator >= this.stepSeconds) {
      this.accumulator -= this.stepSeconds;
      steps++;
    }
    return steps;
  }

  /** How far we are from the last step toward the next one (0–1), for drawing in between. */
  get alpha(): number {
    return this.accumulator / this.stepSeconds;
  }
}
