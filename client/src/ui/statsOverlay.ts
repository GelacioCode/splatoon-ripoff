import { createStatsTable, type StatsRow } from './statsTable';

/**
 * The live scoreboard during a match: hold Tab (desktop) or tap the 📊 button (touch) to
 * see everyone's splats, deaths, assists, captures and paint.
 */
export class StatsOverlay {
  private readonly root = document.createElement('div');
  private readonly toggle = document.createElement('button');
  private open = false;
  private enabled = false;
  private shown = '';

  constructor(touchDevice: boolean) {
    this.root.className = 'stats-overlay';
    this.root.hidden = true;
    this.toggle.type = 'button';
    this.toggle.className = 'stats-button';
    this.toggle.textContent = '📊';
    this.toggle.setAttribute('aria-label', 'Scoreboard');
    this.toggle.hidden = true;
    this.toggle.addEventListener('click', () => this.setOpen(!this.open));
    if (touchDevice) document.body.append(this.toggle);
    document.body.append(this.root);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  /** Only available in a match (not in the lobby or on the results screen). */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.toggle.hidden = !enabled;
    if (!enabled) this.setOpen(false);
  }

  /** Call every frame; it only rebuilds when it's open and the numbers changed. */
  update(rows: readonly StatsRow[]): void {
    if (!this.open) return;
    const key = JSON.stringify(rows);
    if (key === this.shown) return;
    this.shown = key;
    this.root.replaceChildren(createStatsTable(rows, false));
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.root.remove();
    this.toggle.remove();
  }

  private setOpen(open: boolean): void {
    this.open = open && this.enabled;
    this.root.hidden = !this.open;
    this.root.classList.toggle('open', this.open);
    if (!this.open) this.shown = '';
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Tab' || !this.enabled) return;
    // Tab would otherwise move the focus around the page.
    event.preventDefault();
    if (!event.repeat) this.setOpen(true);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Tab') this.setOpen(false);
  };
}
