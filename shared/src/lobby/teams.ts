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

/** The team a late joiner should go on: whichever has fewer players (team 0 on a tie). */
export function smallerTeam(teams: Iterable<number>): number {
  const counts = [0, 0];
  for (const team of teams) if (team === 0 || team === 1) counts[team]++;
  return counts[0] <= counts[1] ? 0 : 1;
}
