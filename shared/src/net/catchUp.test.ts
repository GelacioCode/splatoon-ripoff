import { describe, expect, it } from 'vitest';
import { inputsToRun } from './catchUp';

describe('inputsToRun', () => {
  it('runs one input per tick while the queue is short (or empty)', () => {
    for (const queued of [0, 1, 2, 3]) expect(inputsToRun(queued, 2, 4)).toBe(1);
  });

  it('runs the extra inputs when too many are waiting, leaving the allowed amount', () => {
    expect(inputsToRun(4, 2, 4)).toBe(2);
    expect(inputsToRun(5, 2, 4)).toBe(3);
  });

  it('never runs more than the per-tick limit', () => {
    expect(inputsToRun(40, 2, 4)).toBe(4);
  });
});
