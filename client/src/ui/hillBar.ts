import { HILL_CONTESTED } from '@paint-rush/shared';
import { TEAM_COLORS, teamName, teamPaletteVersion, teamTextColor } from '../render/palette';

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** How quickly the drawn marker catches up with the real bar (per second). */
const FOLLOW_RATE = 8;

/**
 * King of the Hill's tug-of-war bar, under the scores: 200 points, team 0's 100 on the left
 * and team 1's on the right, with a marker that starts in the middle. Holding the hill alone
 * pushes the marker into the other team's side; the stage is won at the far end.
 */
export class HillBar {
  readonly root = document.createElement('div');
  private readonly track = document.createElement('div');
  private readonly left = document.createElement('div');
  private readonly marker = document.createElement('div');
  private readonly counts: [HTMLSpanElement, HTMLSpanElement];
  private readonly status = document.createElement('div');
  private shown = 0;
  private shownCounts = '';
  private paletteVersion = -1;

  constructor() {
    this.root.className = 'hill-bar';
    this.root.hidden = true;
    this.track.className = 'hill-bar-track';
    this.left.className = 'hill-bar-left';
    this.marker.className = 'hill-bar-marker';
    this.track.append(this.left, this.marker);
    this.counts = [document.createElement('span'), document.createElement('span')];
    for (const count of this.counts) count.className = 'hill-bar-count';
    this.status.className = 'hill-bar-status';
    const row = document.createElement('div');
    row.className = 'hill-bar-row';
    row.append(this.counts[0], this.track, this.counts[1]);
    this.root.append(row, this.status);
    this.applyTeamColors();
  }

  /** `balance` −100 … 100 (null hides the bar); `holder` a team, −1 or HILL_CONTESTED. */
  update(dt: number, balance: number | null, holder: number): void {
    this.root.hidden = balance === null;
    if (balance === null) return;
    if (this.paletteVersion !== teamPaletteVersion()) this.applyTeamColors();
    // Springs toward the real value (it arrives 20 times a second).
    this.shown += (balance - this.shown) * (1 - Math.exp(-FOLLOW_RATE * dt));
    const share = (this.shown + 100) / 200;
    this.left.style.width = `${share * 100}%`;
    this.marker.style.left = `${share * 100}%`;
    // Each side's points: theirs go down as the other team pushes in.
    const counts = `${Math.round(100 + balance)}|${Math.round(100 - balance)}`;
    if (counts !== this.shownCounts) {
      this.shownCounts = counts;
      this.counts[0].textContent = String(Math.round(100 + balance));
      this.counts[1].textContent = String(Math.round(100 - balance));
    }
    const contested = holder === HILL_CONTESTED;
    const held = holder === 0 || holder === 1;
    this.root.classList.toggle('contested', contested);
    this.marker.style.background = held ? cssColor(TEAM_COLORS[holder]) : '';
    const status = contested ? 'CONTESTED!' : held ? `${teamName(holder)} holds the hill` : '';
    if (this.status.textContent !== status) this.status.textContent = status;
  }

  /** Each side in its team's current color. */
  private applyTeamColors(): void {
    this.paletteVersion = teamPaletteVersion();
    this.track.style.background = cssColor(TEAM_COLORS[1]);
    this.left.style.background = cssColor(TEAM_COLORS[0]);
    this.counts.forEach((count, team) => {
      count.style.color = cssColor(teamTextColor(team));
    });
  }
}
