import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { createRng } from '../rng';
import { generateLobbyCode, LOBBY_CODE_ALPHABET, parseLobbyCode } from './lobbyCode';
import { cleanName, DEFAULT_PLAYER_NAME } from './names';
import { isCaptureGoal, isMatchLength, nextPhase, parsePhase, phaseSeconds } from './phases';
import { shuffleTeams, smallerTeam } from './teams';

describe('lobby codes', () => {
  it('are 4 easy-to-read characters, never one already in use', () => {
    const random = createRng(3);
    const taken = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const code = generateLobbyCode(random, (c) => taken.has(c));
      expect(code).toMatch(/^[A-Z2-9]{4}$/);
      for (const char of code) expect(LOBBY_CODE_ALPHABET).toContain(char);
      expect(taken.has(code)).toBe(false);
      taken.add(code);
    }
    expect(LOBBY_CODE_ALPHABET).not.toMatch(/[IO01]/);
  });

  it('are read from what people type, or rejected', () => {
    expect(parseLobbyCode(' k7qx ')).toBe('K7QX');
    expect(parseLobbyCode('K7-QX')).toBe('K7QX');
    for (const bad of ['K7Q', 'K7QXZ', 'K0QX', 'KIQX', 42, null]) {
      expect(parseLobbyCode(bad)).toBeNull();
    }
  });
});

describe('player names', () => {
  it('are trimmed, single-spaced and cut to the maximum length', () => {
    expect(cleanName('  Sam   the\tBlob ')).toBe('Sam the Blob');
    expect(cleanName('x'.repeat(40))).toHaveLength(CONFIG.lobby.maxNameLength);
    expect(cleanName('bad\u0000\u0007name')).toBe('bad name');
  });

  it('fall back to "Player" when empty or not text', () => {
    for (const empty of ['', '   ', '\u0000', undefined, 7]) {
      expect(cleanName(empty)).toBe(DEFAULT_PLAYER_NAME);
    }
  });
});

describe('team balancing', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
  const sizes = (teams: Map<string, number>) => {
    const counts = [0, 0];
    for (const team of teams.values()) counts[team]++;
    return counts;
  };

  it('splits everyone into two teams that differ by at most one', () => {
    for (const n of [1, 2, 7, 30]) {
      const teams = shuffleTeams(ids(n), createRng(n));
      expect(teams.size).toBe(n);
      const [a, b] = sizes(teams);
      expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
    }
  });

  it('shuffles (different seeds, different teams) but repeats for the same seed', () => {
    const one = [...shuffleTeams(ids(10), createRng(1))];
    expect([...shuffleTeams(ids(10), createRng(1))]).toEqual(one);
    expect([...shuffleTeams(ids(10), createRng(2))]).not.toEqual(one);
  });

  it('puts a late joiner on the smaller team', () => {
    expect(smallerTeam([0, 0, 1])).toBe(1);
    expect(smallerTeam([0, 1, 1])).toBe(0);
    expect(smallerTeam([])).toBe(0);
  });
});

describe('match phases', () => {
  it('go reveal → countdown → playing, with the configured timings', () => {
    expect(nextPhase('reveal')).toBe('countdown');
    expect(nextPhase('countdown')).toBe('playing');
    expect(phaseSeconds('reveal')).toBe(CONFIG.lobby.revealSeconds);
    expect(phaseSeconds('countdown')).toBe(CONFIG.lobby.countdownSeconds);
    expect(phaseSeconds('lobby')).toBeNull();
    expect(phaseSeconds('playing')).toBeNull();
  });

  it('treat unknown values as the lobby and accept only listed match lengths', () => {
    expect(parsePhase('playing')).toBe('playing');
    expect(parsePhase(undefined)).toBe('lobby');
    expect(isMatchLength(5)).toBe(true);
    expect(isMatchLength(4)).toBe(false);
    expect(isMatchLength('5')).toBe(false);
  });

  it('after a capture: a short "scored" break, then a fresh countdown; goals are 3, 5 or 7', () => {
    expect(nextPhase('scored')).toBe('countdown');
    expect(phaseSeconds('scored')).toBe(CONFIG.match.scoredSeconds);
    expect(parsePhase('scored')).toBe('scored');
    expect([3, 5, 7].every(isCaptureGoal)).toBe(true);
    expect(isCaptureGoal(4)).toBe(false);
  });
});
