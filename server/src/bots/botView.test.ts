import { describe, expect, it } from 'vitest';
import { ARENA, MatchState, NetPlayer } from '@paint-rush/shared';
import { createPlayerState } from '@paint-rush/shared/sim';
import { botViewOf } from './botView';

function addPlayer(state: MatchState, id: string, team: number, x: number, z: number): NetPlayer {
  const player = new NetPlayer(createPlayerState({ x, y: 0, z }, 0, team));
  state.players.set(id, player);
  return player;
}

describe('botViewOf', () => {
  it('sees living enemies (not teammates), its own base and the enemy base', () => {
    const state = new MatchState();
    addPlayer(state, 'bot-1', 0, 0, -10);
    addPlayer(state, 'mate', 0, 2, -10);
    addPlayer(state, 'enemy', 1, 0, 5);
    const splatted = addPlayer(state, 'splatted', 1, 0, 6);
    splatted.respawnTimer = 3;

    const view = botViewOf(state, 'bot-1', ARENA);
    expect(view?.enemies).toEqual([{ x: 0, y: 0, z: 5 }]);
    expect(view?.base).toEqual(ARENA.bases[0].center);
    expect(view?.enemyBase).toEqual(ARENA.bases[1].center);
  });

  it("knows who holds the flag, and skips enemies it can't see", () => {
    const state = new MatchState();
    addPlayer(state, 'bot-1', 1, 0, 10);
    addPlayer(state, 'enemy', 0, 0, 0);
    state.flagState = 'carried';
    state.flagCarrier = 'enemy';

    const view = botViewOf(state, 'bot-1', ARENA, () => false);
    expect(view?.flag?.holder).toBe('theirs');
    expect(view?.enemies).toEqual([]);
    expect(view?.base).toEqual(ARENA.bases[1].center);
  });

  it('is null for a player who is not in the match', () => {
    expect(botViewOf(new MatchState(), 'nobody', ARENA)).toBeNull();
  });
});
