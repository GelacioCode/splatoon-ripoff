import { describe, expect, it } from 'vitest';
import { NewShotFilter } from './newShotFilter';

describe('NewShotFilter', () => {
  it('shows each shot once, even when prediction replays the ticks that fired it', () => {
    const filter = new NewShotFilter(10);
    expect(filter.take(11, 1)).toBe(1);
    expect(filter.take(12, 1)).toBe(1);
    // Replay of the same two ticks after a server update.
    expect(filter.take(11, 1)).toBe(0);
    expect(filter.take(12, 1)).toBe(0);
    // The next live tick.
    expect(filter.take(13, 1)).toBe(1);
  });

  it('counts only the unseen part of a tick that fired several shots', () => {
    const filter = new NewShotFilter(0);
    expect(filter.take(2, 2)).toBe(2);
    // A replay of that tick now fires three (e.g. after a correction): one is new.
    expect(filter.take(3, 3)).toBe(1);
  });

  it('ignores ticks that fired nothing', () => {
    const filter = new NewShotFilter(5);
    expect(filter.take(5, 0)).toBe(0);
  });
});
