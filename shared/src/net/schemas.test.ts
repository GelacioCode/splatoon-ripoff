import { describe, expect, it } from 'vitest';
import { createInput } from '../sim/input';
import { createPlayerState } from '../sim/playerState';
import { NetInput, NetPlayer } from './schemas';

describe('network schemas', () => {
  it('carry every field of the simulation state, so prediction can mirror it', () => {
    const player = new NetPlayer();
    const missing = Object.keys(createPlayerState({ x: 0, y: 0, z: 0 })).filter(
      (key) => !(key in player),
    );
    expect(missing).toEqual([]);
  });

  it('carry every field of the player input', () => {
    const input = new NetInput();
    const missing = Object.keys(createInput()).filter((key) => !(key in input));
    expect(missing).toEqual([]);
  });

  it('keep a player state close to its original values after quantizing', () => {
    const state = createPlayerState({ x: 12.345, y: 1.25, z: -27.5 }, Math.PI / 3, 1);
    const player = new NetPlayer(state);
    expect(player.x).toBeCloseTo(12.345, 2);
    expect(player.z).toBeCloseTo(-27.5, 2);
    expect(player.yaw).toBeCloseTo(Math.PI / 3, 3);
    expect(player.team).toBe(1);
  });
});
