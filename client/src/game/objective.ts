import type { FlagState } from '@paint-rush/shared';

/** The icon on the arrow over your head and next to the order at the top. */
export type ObjectiveIcon = 'flag' | 'attack' | 'defend' | 'wait';

/** Where the arrow over your head points. */
export type ObjectiveTarget = 'flag' | 'enemyBase' | 'ownBase' | 'middle';

/** What you should be doing right now: the order at the top, and where the arrow points. */
export interface Objective {
  icon: ObjectiveIcon;
  target: ObjectiveTarget;
  /** The big order ("ATTACK!"). */
  title: string;
  /** The smaller line under it. */
  detail: string;
}

/** What the order depends on in Capture the Flag. */
export interface FlagSituation {
  flagState: FlagState;
  /** Team of the flag carrier, or null when nobody carries it. */
  carrierTeam: number | null;
  carrierIsMe: boolean;
  myTeam: number;
  /** Seconds until a dropped flag returns to the middle. */
  flagTimer: number;
}

/**
 * Your order in Capture the Flag: get the flag while it's free; with it, score in the enemy
 * base; while a teammate has it, attack with them; while an enemy has it, defend your spawn
 * (their goal is your base, in front of it).
 */
export function flagObjective(s: FlagSituation): Objective {
  if (s.flagState === 'carried' && s.carrierTeam !== null) {
    if (s.carrierIsMe) {
      return {
        icon: 'flag',
        target: 'enemyBase',
        title: 'SCORE!',
        detail: 'Run it into the enemy base',
      };
    }
    if (s.carrierTeam === s.myTeam) {
      return {
        icon: 'attack',
        target: 'enemyBase',
        title: 'ATTACK!',
        detail: 'Escort your carrier to the enemy base',
      };
    }
    return {
      icon: 'defend',
      target: 'ownBase',
      title: 'DEFEND YOUR SPAWN!',
      detail: 'Stop the carrier before they reach your base',
    };
  }
  if (s.flagState === 'dropped') {
    return {
      icon: 'flag',
      target: 'flag',
      title: 'GET THE FLAG!',
      detail: `It's down · back to the middle in ${Math.max(0, Math.ceil(s.flagTimer))}`,
    };
  }
  if (s.flagState === 'away') {
    return {
      icon: 'wait',
      target: 'middle',
      title: 'GET READY',
      detail: 'The flag is coming back to the middle',
    };
  }
  return { icon: 'flag', target: 'flag', title: 'GET THE FLAG!', detail: "It's in the middle" };
}
