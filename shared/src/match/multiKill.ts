import { CONFIG } from '../config';

/** What a streak of splats in quick succession is called (2 = double … 5 or more = penta). */
const NAMES = ['DOUBLE KILL', 'TRIPLE KILL', 'QUADRA KILL', 'PENTA KILL'];

/** The callout for a streak of `count` quick splats, or null below a double. */
export function multiKillName(count: number): string | null {
  if (count < 2) return null;
  return NAMES[Math.min(count, 5) - 2] ?? null;
}

/**
 * Counts each player's splats in quick succession: every splat within
 * CONFIG.player.multiKillWindowSeconds of their previous one adds to the streak, and being
 * splatted yourself ends it. Times are in seconds.
 */
export class MultiKillTracker {
  private readonly streaks = new Map<string, { count: number; at: number }>();

  /** `killer` splatted someone at `now`; returns their streak (1 for a lone splat). */
  splat(killer: string, now: number): number {
    const window = CONFIG.player.multiKillWindowSeconds;
    const last = this.streaks.get(killer);
    const count = last && now - last.at <= window ? last.count + 1 : 1;
    this.streaks.set(killer, { count, at: now });
    return count;
  }

  /** A player was splatted (their streak ends) or left. */
  end(player: string): void {
    this.streaks.delete(player);
  }

  clear(): void {
    this.streaks.clear();
  }
}
