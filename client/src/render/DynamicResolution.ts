/**
 * Keeps the frame rate up by lowering the rendering resolution when frames take too long,
 * and raising it again when there's headroom. Returns a scale from `minScale` to 1.
 */
export class DynamicResolution {
  scale = 1;
  private readonly targetMs: number;
  private readonly minScale: number;
  private averageMs: number;
  private waitMs = 0;

  constructor(targetFps = 60, minScale = 0.5) {
    this.targetMs = 1000 / targetFps;
    this.minScale = minScale;
    this.averageMs = this.targetMs;
  }

  /** Feed the last frame's duration (ms); returns the resolution scale to use. */
  update(frameMs: number): number {
    this.averageMs = this.averageMs * 0.9 + frameMs * 0.1;
    this.waitMs -= frameMs;
    if (this.waitMs > 0) return this.scale;
    if (this.averageMs > this.targetMs * 1.15 && this.scale > this.minScale) {
      // Too slow: step down quickly.
      this.scale = Math.max(this.minScale, this.scale - 0.1);
      this.waitMs = 500;
    } else if (this.averageMs < this.targetMs * 1.03 && this.scale < 1) {
      // Keeping up: carefully try a little more detail.
      this.scale = Math.min(1, this.scale + 0.05);
      this.waitMs = 3000;
    }
    return this.scale;
  }
}
