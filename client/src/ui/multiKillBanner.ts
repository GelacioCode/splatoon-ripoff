/** How long the callout stays up (ms). */
const SHOW_MS = 1700;

/**
 * Your multi-kill callout: a big bouncy "TRIPLE KILL!" on a paint splash, bigger and wilder
 * for bigger streaks. It never blocks clicks.
 */
export class MultiKillBanner {
  private readonly root = document.createElement('div');
  private readonly text = document.createElement('div');
  private readonly count = document.createElement('div');
  private hideTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.root.className = 'multi-kill';
    this.root.hidden = true;
    this.text.className = 'multi-kill-text';
    this.count.className = 'multi-kill-count';
    this.root.append(this.count, this.text);
    document.body.append(this.root);
  }

  /** `name` e.g. "TRIPLE KILL"; `streak` 2–5+; `color` the splash color (CSS). */
  show(name: string, streak: number, color: string): void {
    clearTimeout(this.hideTimer);
    this.text.textContent = `${name}!`;
    this.count.textContent = `×${streak}`;
    this.root.style.setProperty('--splash', color);
    this.root.dataset.level = String(Math.min(streak, 5));
    this.root.hidden = false;
    // Restart the pop-in.
    this.root.classList.remove('show');
    void this.root.offsetWidth;
    this.root.classList.add('show');
    this.hideTimer = setTimeout(() => {
      this.root.hidden = true;
    }, SHOW_MS);
  }

  dispose(): void {
    clearTimeout(this.hideTimer);
    this.root.remove();
  }
}
