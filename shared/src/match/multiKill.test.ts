import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { multiKillName, MultiKillTracker } from './multiKill';

const WINDOW = CONFIG.player.multiKillWindowSeconds;

describe('multi-kills', () => {
  it('are named double, triple, quadra and penta (and stay penta after that)', () => {
    expect(multiKillName(1)).toBeNull();
    expect(multiKillName(2)).toBe('DOUBLE KILL');
    expect(multiKillName(3)).toBe('TRIPLE KILL');
    expect(multiKillName(4)).toBe('QUADRA KILL');
    expect(multiKillName(5)).toBe('PENTA KILL');
    expect(multiKillName(9)).toBe('PENTA KILL');
  });

  it('count splats that come quickly one after another', () => {
    const tracker = new MultiKillTracker();
    expect(tracker.splat('sam', 10)).toBe(1);
    expect(tracker.splat('sam', 10 + WINDOW - 1)).toBe(2);
    expect(tracker.splat('sam', 10 + WINDOW * 2 - 2)).toBe(3);
    // Each player has their own streak.
    expect(tracker.splat('alex', 12)).toBe(1);
  });

  it('start over after a pause, or when the player is splatted', () => {
    const tracker = new MultiKillTracker();
    tracker.splat('sam', 0);
    expect(tracker.splat('sam', WINDOW + 0.5)).toBe(1);
    tracker.splat('sam', WINDOW + 1);
    tracker.end('sam');
    expect(tracker.splat('sam', WINDOW + 2)).toBe(1);
  });
});
