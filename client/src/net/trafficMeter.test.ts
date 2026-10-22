import { describe, expect, it } from 'vitest';
import { byteSize, TrafficMeter } from './trafficMeter';

describe('TrafficMeter', () => {
  it('turns counted bytes into KB/s and starts over after each sample', () => {
    const meter = new TrafficMeter();
    meter.addReceived(2048);
    meter.addReceived(1024);
    meter.addSent(512);
    expect(meter.sample(0.5)).toEqual({ downKBps: 6, upKBps: 1 });
    expect(meter.sample(0.5)).toEqual({ downKBps: 0, upKBps: 0 });
  });

  it('measures binary and text messages', () => {
    expect(byteSize(new Uint8Array(11))).toBe(11);
    expect(byteSize(new ArrayBuffer(7))).toBe(7);
    expect(byteSize(new Uint8Array(20).subarray(5))).toBe(15);
    expect(byteSize('hello')).toBe(5);
    expect(byteSize(null)).toBe(0);
  });
});
