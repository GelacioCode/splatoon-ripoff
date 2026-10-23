import { teamTextColor } from '../render/palette';

/** How long an entry stays (ms), and how many show at once. */
const ENTRY_MS = 5000;
const MAX_ENTRIES = 5;

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function name(text: string, team: number): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'feed-name';
  span.textContent = text;
  span.style.color = cssColor(teamTextColor(team));
  return span;
}

/** Top-right list of who splatted whom, in team colors; entries fade after a few seconds. */
export class KillFeed {
  private readonly root = document.createElement('div');

  constructor() {
    this.root.className = 'kill-feed';
    document.body.append(this.root);
  }

  add(attacker: string, attackerTeam: number, victim: string, victimTeam: number): void {
    const entry = document.createElement('div');
    entry.className = 'feed-entry';
    const mark = document.createElement('span');
    mark.className = 'feed-mark';
    mark.textContent = '💥';
    entry.append(name(attacker, attackerTeam), mark, name(victim, victimTeam));
    this.root.prepend(entry);
    while (this.root.children.length > MAX_ENTRIES) this.root.lastElementChild?.remove();
    setTimeout(() => entry.remove(), ENTRY_MS);
  }

  clear(): void {
    this.root.replaceChildren();
  }
}
