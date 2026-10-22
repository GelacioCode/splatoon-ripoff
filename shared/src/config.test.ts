import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';

describe('CONFIG', () => {
  it('simulates at least as often as it sends snapshots', () => {
    expect(CONFIG.net.tickRate).toBeGreaterThanOrEqual(CONFIG.net.snapshotRate);
  });

  it('buffers at least two snapshots for remote-player interpolation', () => {
    const snapshotIntervalMs = 1000 / CONFIG.net.snapshotRate;
    expect(CONFIG.net.interpolationDelayMs).toBeGreaterThanOrEqual(2 * snapshotIntervalMs);
  });

  it('slows the flag carrier without stopping them', () => {
    expect(CONFIG.match.flagCarrierSpeedMultiplier).toBeGreaterThan(0);
    expect(CONFIG.match.flagCarrierSpeedMultiplier).toBeLessThan(1);
  });
});
