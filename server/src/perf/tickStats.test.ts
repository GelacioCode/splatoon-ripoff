import { describe, expect, it } from 'vitest';
import { TickStats } from './tickStats';

describe('TickStats', () => {
  it('summarizes average, 95th percentile and worst tick, then starts over', () => {
    const stats = new TickStats();
    // 95 quick ticks and 5 slow ones.
    for (let i = 0; i < 95; i++) stats.record(1);
    for (let i = 0; i < 5; i++) stats.record(10);
    const summary = stats.take();
    expect(summary).toEqual({ ticks: 100, avg: 1.45, p95: 1, max: 10 });
    expect(stats.take()).toBeNull();
  });

  it('catches the slow ticks once they are more than 5% of them', () => {
    const stats = new TickStats();
    for (let i = 0; i < 90; i++) stats.record(2);
    for (let i = 0; i < 10; i++) stats.record(8);
    expect(stats.take()?.p95).toBe(8);
  });
});
