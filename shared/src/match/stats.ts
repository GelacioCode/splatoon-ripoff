import { CONFIG } from '../config';

/** A player's numbers for one match. */
export interface PlayerStats {
  kills: number;
  deaths: number;
  assists: number;
  captures: number;
  /** Paint points: ground cells painted (each 0.5 × 0.5 m). */
  paint: number;
}

/**
 * Who recently damaged whom, for assists: damaging an enemy shortly before a teammate splats
 * them counts as an assist (`CONFIG.player.assistWindowSeconds`).
 */
export class DamageLog {
  /** victim → (attacker → time of their latest hit, s) */
  private readonly hits = new Map<string, Map<string, number>>();

  record(victim: string, attacker: string, time: number): void {
    let byAttacker = this.hits.get(victim);
    if (!byAttacker) {
      byAttacker = new Map();
      this.hits.set(victim, byAttacker);
    }
    byAttacker.set(attacker, time);
  }

  /**
   * Everyone (except the one who splatted them) who hit `victim` recently enough to get an
   * assist. Clears the victim's record: their next life starts fresh.
   */
  takeAssists(victim: string, killer: string, time: number): string[] {
    const byAttacker = this.hits.get(victim);
    this.hits.delete(victim);
    if (!byAttacker) return [];
    const window = CONFIG.player.assistWindowSeconds;
    const assists: string[] = [];
    for (const [attacker, at] of byAttacker) {
      if (attacker !== killer && time - at <= window) assists.push(attacker);
    }
    return assists;
  }

  /** Forgets a player (they left), as a victim and as an attacker. */
  forget(player: string): void {
    this.hits.delete(player);
    for (const byAttacker of this.hits.values()) byAttacker.delete(player);
  }

  clear(): void {
    this.hits.clear();
  }
}

/**
 * One number to rank players by at the end: captures matter most, then splats and assists,
 * then painting.
 */
export function playerScore(s: PlayerStats): number {
  return s.captures * 50 + s.kills * 10 + s.assists * 5 + Math.floor(s.paint / 10);
}

export type HighlightKind = 'splats' | 'captures' | 'paint';

/**
 * Who stood out: the most splats, most captures and most paint. A highlight needs at least 1
 * (nobody gets "Most captures" for 0), and ties go to the first in `players`.
 */
export function highlights<T extends PlayerStats & { id: string }>(
  players: readonly T[],
): Partial<Record<HighlightKind, string>> {
  const best = (value: (p: T) => number): string | undefined => {
    let top: T | undefined;
    for (const p of players) if (value(p) > 0 && (!top || value(p) > value(top))) top = p;
    return top?.id;
  };
  const result: Partial<Record<HighlightKind, string>> = {};
  const splats = best((p) => p.kills);
  const captures = best((p) => p.captures);
  const paint = best((p) => p.paint);
  if (splats) result.splats = splats;
  if (captures) result.captures = captures;
  if (paint) result.paint = paint;
  return result;
}
