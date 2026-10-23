import { highlights, playerScore, type HighlightKind, type PlayerStats } from '@paint-rush/shared';
import { TEAM_COLORS } from '../render/palette';

/** One player's line in the stats table. */
export interface StatsRow extends PlayerStats {
  id: string;
  name: string;
  team: number;
  me: boolean;
}

const BADGES: Record<HighlightKind, string> = {
  splats: '💥 Most splats',
  captures: '⚑ Most captures',
  paint: '🎨 Most paint',
};

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function cell(tag: 'td' | 'th', text: string, className?: string): HTMLTableCellElement {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

/**
 * Both teams side by side, each sorted best first: name, splats / deaths / assists, captures
 * and paint points. With `badges`, the standout players get a highlight badge.
 */
export function createStatsTable(rows: readonly StatsRow[], badges: boolean): HTMLElement {
  const root = document.createElement('div');
  root.className = 'stats-teams';
  const best = badges ? highlights(rows) : {};
  const badgeOf = new Map<string, string[]>();
  for (const [kind, id] of Object.entries(best) as [HighlightKind, string][]) {
    badgeOf.set(id, [...(badgeOf.get(id) ?? []), BADGES[kind]]);
  }

  for (const team of [0, 1]) {
    const table = document.createElement('table');
    table.className = 'stats-table';
    table.style.setProperty('--team', cssColor(TEAM_COLORS[team]));
    const head = document.createElement('tr');
    head.append(
      cell('th', team === 0 ? 'Pink' : 'Cyan', 'stats-name'),
      cell('th', 'K'),
      cell('th', 'D'),
      cell('th', 'A'),
      cell('th', '⚑'),
      cell('th', 'Paint'),
    );
    table.append(head);
    const members = rows
      .filter((r) => r.team === team)
      .sort((a, b) => playerScore(b) - playerScore(a));
    for (const r of members) {
      const line = document.createElement('tr');
      if (r.me) line.className = 'me';
      const name = cell('td', r.name, 'stats-name');
      for (const badge of badgeOf.get(r.id) ?? []) {
        const tag = document.createElement('span');
        tag.className = 'stats-badge';
        tag.textContent = badge;
        name.append(tag);
      }
      line.append(
        name,
        cell('td', String(r.kills)),
        cell('td', String(r.deaths)),
        cell('td', String(r.assists)),
        cell('td', String(r.captures)),
        cell('td', String(r.paint)),
      );
      table.append(line);
    }
    root.append(table);
  }
  return root;
}
