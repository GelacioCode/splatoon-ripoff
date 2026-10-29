/** What the spectate screen shows while you wait to respawn. */
export interface SpectateView {
  /** "💀 YOU WERE SPLATTED" (or switching teams). */
  title: string;
  /** "Splatted by Bot 2 · respawning in 4…". */
  detail: string;
  /** The teammate being watched, or null when no teammate is up to watch. */
  watching: string | null;
  /** Their team's text color (CSS). */
  color: string;
}

/** Keys that switch teammates: previous / next. */
const PREVIOUS_KEYS = new Set(['KeyQ', 'KeyA', 'ArrowLeft']);
const NEXT_KEYS = new Set(['KeyE', 'KeyD', 'ArrowRight']);

/**
 * The screen while you're splatted: a big "YOU WERE SPLATTED · respawning in N" so nobody
 * thinks they're still playing, and "◀ Watching NAME ▶" to look through a teammate's camera.
 * Switch with the arrows (touch), Q / E, A / D, or a left / right click.
 */
export class SpectateBar {
  private readonly root = document.createElement('div');
  private readonly title = document.createElement('p');
  private readonly detail = document.createElement('p');
  private readonly watchRow = document.createElement('div');
  private readonly watching = document.createElement('p');
  private shownKey = '';
  private readonly step: (by: number) => void;

  constructor(touch: boolean, step: (by: number) => void) {
    this.step = step;
    this.root.className = 'spectate';
    this.root.hidden = true;
    const top = document.createElement('div');
    top.className = 'spectate-top';
    this.title.className = 'spectate-title';
    this.detail.className = 'spectate-detail';
    top.append(this.title, this.detail);

    this.watchRow.className = 'spectate-watch';
    const previous = this.arrow('◀', 'Previous teammate', -1);
    const next = this.arrow('▶', 'Next teammate', 1);
    this.watching.className = 'spectate-name';
    const hint = document.createElement('p');
    hint.className = 'spectate-hint';
    hint.textContent = touch ? 'Tap the arrows to switch' : 'Q / E or click to switch';
    const middle = document.createElement('div');
    middle.append(this.watching, hint);
    this.watchRow.append(previous, middle, next);
    this.root.append(top, this.watchRow);
    document.body.append(this.root);

    window.addEventListener('keydown', this.onKey);
    document.addEventListener('mousedown', this.onMouse);
  }

  show(view: SpectateView): void {
    document.body.classList.add('spectating');
    this.root.hidden = false;
    const key = `${view.title}|${view.detail}|${view.watching}|${view.color}`;
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.title.textContent = view.title;
    this.detail.textContent = view.detail;
    this.watchRow.hidden = view.watching === null;
    this.watching.textContent = `👀 Watching ${view.watching ?? ''}`;
    this.watching.style.color = view.color;
  }

  hide(): void {
    if (this.root.hidden) return;
    document.body.classList.remove('spectating');
    this.root.hidden = true;
    this.shownKey = '';
  }

  dispose(): void {
    this.hide();
    window.removeEventListener('keydown', this.onKey);
    document.removeEventListener('mousedown', this.onMouse);
    this.root.remove();
  }

  private arrow(label: string, name: string, by: number): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'spectate-arrow';
    button.textContent = label;
    button.setAttribute('aria-label', name);
    // Pointer down (not click): quick on touch, and kept away from the look drag underneath.
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.step(by);
    });
    return button;
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (this.root.hidden || this.watchRow.hidden || event.repeat) return;
    if (PREVIOUS_KEYS.has(event.code)) this.step(-1);
    else if (NEXT_KEYS.has(event.code)) this.step(1);
  };

  /** With the mouse captured (playing), left click is next and right click previous. */
  private readonly onMouse = (event: MouseEvent): void => {
    if (this.root.hidden || this.watchRow.hidden || !document.pointerLockElement) return;
    if (event.button === 0) this.step(1);
    else if (event.button === 2) this.step(-1);
  };
}
