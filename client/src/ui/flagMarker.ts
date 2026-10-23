import { Vector3, type Camera } from 'three';

/** Keep the marker this far from the screen edges (px). */
const MARGIN = 36;
/** Distance of the edge arrow from the icon's center (px). */
const ARROW_OFFSET = 22;

/**
 * Shows where the flag is: a flag icon over it when it's on screen, or pinned to the screen
 * edge with an arrow pointing toward it when it's off screen or behind you.
 */
export class FlagMarker {
  private readonly root = document.createElement('div');
  private readonly arrow = document.createElement('div');
  private readonly point = new Vector3();

  constructor() {
    this.root.className = 'flag-marker';
    this.root.hidden = true;
    const icon = document.createElement('div');
    icon.className = 'flag-marker-icon';
    icon.textContent = '⚑';
    this.arrow.className = 'flag-marker-arrow';
    this.root.append(this.arrow, icon);
    document.body.append(this.root);
  }

  /** `at` is where the flag is in the world; `color` its current color (CSS). */
  update(camera: Camera, at: { x: number; y: number; z: number } | null, color: string): void {
    if (!at) {
      this.root.hidden = true;
      return;
    }
    const width = window.innerWidth;
    const height = window.innerHeight;
    const p = this.point.set(at.x, at.y, at.z).project(camera);
    // Behind the camera the projection comes out mirrored.
    const behind = p.z > 1;
    let x = (p.x * 0.5 + 0.5) * width;
    let y = (-p.y * 0.5 + 0.5) * height;
    if (behind) {
      x = width - x;
      y = height - y;
    }
    const onScreen =
      !behind && x >= MARGIN && x <= width - MARGIN && y >= MARGIN && y <= height - MARGIN;
    if (!onScreen) {
      // Slide along the line from the screen center until it meets the edge margin.
      const cx = width / 2;
      const cy = height / 2;
      let dx = x - cx;
      let dy = y - cy;
      if (behind && Math.abs(dy) < 1) dy = 1;
      const scale = Math.min(
        Math.abs((cx - MARGIN) / (dx || 1e-6)),
        Math.abs((cy - MARGIN) / (dy || 1e-6)),
      );
      dx *= scale;
      dy *= scale;
      x = cx + dx;
      y = cy + dy;
      // The arrow sits just outside the icon, on the side the flag is.
      const angle = Math.atan2(dy, dx);
      const ax = Math.cos(angle) * ARROW_OFFSET;
      const ay = Math.sin(angle) * ARROW_OFFSET;
      this.arrow.style.transform = `translate(${ax}px, ${ay}px) rotate(${angle}rad)`;
    }
    this.root.hidden = false;
    this.root.classList.toggle('off-screen', !onScreen);
    this.root.style.transform = `translate(${x}px, ${y}px)`;
    this.root.style.color = color;
  }

  dispose(): void {
    this.root.remove();
  }
}
