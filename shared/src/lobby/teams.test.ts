import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { AUTO_TEAM, canSwitchTeam, teamsWithPicks, type TeamChoice } from './teams';

function counts(teams: Map<string, number>): [number, number] {
  const c: [number, number] = [0, 0];
  for (const team of teams.values()) c[team === 1 ? 1 : 0]++;
  return c;
}

function choices(...picks: number[]): TeamChoice[] {
  return picks.map((pick, i) => ({ id: `p${i}`, pick }));
}

describe('teamsWithPicks', () => {
  it('honors picks when they fit, and fills in the auto players to keep it even', () => {
    const { teams, moved } = teamsWithPicks(choices(0, 1, AUTO_TEAM, AUTO_TEAM, 0), createRng(1));
    expect(teams.get('p0')).toBe(0);
    expect(teams.get('p1')).toBe(1);
    expect(teams.get('p4')).toBe(0);
    expect(moved).toEqual([]);
    const [a, b] = counts(teams);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });

  it('moves the latest pickers when too many picked one side', () => {
    const { teams, moved } = teamsWithPicks(choices(0, 0, 0, 0, 1, AUTO_TEAM), createRng(2));
    // Six players: three a side. The fourth one to pick team 0 has to go.
    expect(moved).toEqual(['p3']);
    expect(teams.get('p3')).toBe(1);
    expect(counts(teams)).toEqual([3, 3]);
  });

  it('always keeps the teams within one player of each other', () => {
    const random = createRng(3);
    for (let n = 1; n <= 30; n++) {
      const picks = Array.from({ length: n }, () => Math.floor(random() * 3) - 1);
      const { teams } = teamsWithPicks(choices(...picks), random);
      expect(teams.size).toBe(n);
      const [a, b] = counts(teams);
      expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
    }
  });
});

describe('canSwitchTeam', () => {
  it('lets players switch any time, except onto the bigger team', () => {
    expect(canSwitchTeam(0, [0, 0, 0, 1, 1])).toBe(true);
    expect(canSwitchTeam(1, [0, 0, 0, 1, 1])).toBe(false);
    // Even teams: allowed (user decision).
    expect(canSwitchTeam(0, [0, 0, 1, 1])).toBe(true);
  });
});
