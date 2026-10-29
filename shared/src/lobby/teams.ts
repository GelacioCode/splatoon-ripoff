/**
 * Splits players into team 0 and team 1. Pluggable, so a skill-based balancer can replace the
 * random one later without touching the room.
 */
export type TeamBalancer = (
  playerIds: readonly string[],
  random: () => number,
) => Map<string, number>;

/** Shuffles everyone, then alternates teams: sizes differ by at most one, and either side may get the extra player. */
export const shuffleTeams: TeamBalancer = (playerIds, random) => {
  const order = [...playerIds];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const first = random() < 0.5 ? 0 : 1;
  return new Map(order.map((id, i) => [id, (i + first) % 2]));
};

/** A player's team wish in the lobby: 0 or 1, or AUTO_TEAM to let the game decide. */
export const AUTO_TEAM = -1;

export interface TeamChoice {
  id: string;
  pick: number;
}

/** Whether a synced team wish is valid. */
export function isTeamPick(value: unknown): value is number {
  return value === AUTO_TEAM || value === 0 || value === 1;
}

/**
 * Teams at Start, honoring the lobby's picks while keeping the sides even (they differ by at
 * most one). `choices` are in the order players picked: if too many picked one side, the
 * latest of them are moved to the other. Everyone on auto (bots too) fills the gaps, with
 * `balance` proposing their sides. Returns the teams and who couldn't get their pick.
 */
export function teamsWithPicks(
  choices: readonly TeamChoice[],
  random: () => number,
  balance: TeamBalancer = shuffleTeams,
): { teams: Map<string, number>; moved: string[] } {
  const n = choices.length;
  const big = Math.ceil(n / 2);
  const counts = [0, 0];
  const teams = new Map<string, number>();
  const free: string[] = [];
  for (const choice of choices) {
    const pick = choice.pick;
    if ((pick === 0 || pick === 1) && counts[pick] < big) {
      teams.set(choice.id, pick);
      counts[pick]++;
    } else {
      free.push(choice.id);
    }
  }
  // Final sizes: the side more players picked (or a coin flip) gets the odd player.
  const bigTeam = counts[0] > counts[1] ? 0 : counts[1] > counts[0] ? 1 : random() < 0.5 ? 0 : 1;
  const size = bigTeam === 0 ? [big, n - big] : [n - big, big];
  const proposed = balance(free, random);
  for (const id of free) {
    const want = proposed.get(id) === 1 ? 1 : 0;
    const team = counts[want] < size[want] ? want : 1 - want;
    teams.set(id, team);
    counts[team]++;
  }
  const moved = choices
    .filter((c) => (c.pick === 0 || c.pick === 1) && teams.get(c.id) !== c.pick)
    .map((c) => c.id);
  return { teams, moved };
}

/**
 * Whether a player on `team` may switch sides mid-match (user decision): any time, unless the
 * other team already has more players (so nobody piles onto the bigger side). `teams` are
 * everyone's teams in the arena.
 */
export function canSwitchTeam(team: number, teams: Iterable<number>): boolean {
  const counts = [0, 0];
  for (const t of teams) if (t === 0 || t === 1) counts[t]++;
  const other = team === 0 ? 1 : 0;
  return counts[other] <= counts[team === 1 ? 1 : 0];
}

/** The team a late joiner should go on: whichever has fewer players (team 0 on a tie). */
export function smallerTeam(teams: Iterable<number>): number {
  const counts = [0, 0];
  for (const team of teams) if (team === 0 || team === 1) counts[team]++;
  return counts[0] <= counts[1] ? 0 : 1;
}
