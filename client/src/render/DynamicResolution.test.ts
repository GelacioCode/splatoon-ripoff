import { describe, expect, it } from 'vitest';
import { DynamicResolution } from './DynamicResolution';

function feed(resolution: DynamicResolution, frameMs: number, seconds: number): number {
  let scale = resolution.scale;
  for (let t = 0; t < seconds * 1000; t += frameMs) scale = resolution.update(frameMs);
  return scale;
}

describe('DynamicResolution', () => {
  it('lowers the resolution when frames are slow, but not below the minimum', () => {
    const resolution = new DynamicResolution(60, 0.5);
    expect(feed(resolution, 40, 2)).toBeLessThan(1);
    expect(feed(resolution, 40, 20)).toBe(0.5);
  });

  it('climbs back to full resolution once frames are fast again', () => {
    const resolution = new DynamicResolution(60, 0.5);
    feed(resolution, 40, 10);
    expect(feed(resolution, 8, 60)).toBe(1);
  });
});
