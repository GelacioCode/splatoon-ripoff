import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { isGameMode, parseGameMode, parseStageMode, pickStageMode } from './modes';

describe('game modes', () => {
  it('keeps the "All …" modes the same every stage', () => {
    const random = createRng(1);
    for (let i = 0; i < 20; i++) {
      expect(pickStageMode('ctf', random)).toBe('ctf');
      expect(pickStageMode('koth', random)).toBe('koth');
    }
  });

  it('flips a coin for every stage in random mode', () => {
    const random = createRng(2);
    const stages = Array.from({ length: 40 }, () => pickStageMode('random', random));
    expect(stages).toContain('ctf');
    expect(stages).toContain('koth');
  });

  it('reads anything unknown as Capture the Flag', () => {
    expect(isGameMode('random')).toBe(true);
    expect(isGameMode('deathmatch')).toBe(false);
    expect(parseGameMode(7)).toBe('ctf');
    expect(parseStageMode('')).toBe('ctf');
    expect(parseStageMode('koth')).toBe('koth');
  });
});
