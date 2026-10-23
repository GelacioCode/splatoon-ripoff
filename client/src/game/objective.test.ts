import { describe, expect, it } from 'vitest';
import { HILL_CONTESTED, HILL_FREE } from '@paint-rush/shared';
import { flagObjective, hillObjective, type FlagSituation } from './objective';

function situation(overrides: Partial<FlagSituation> = {}): FlagSituation {
  return {
    flagState: 'home',
    carrierTeam: null,
    carrierIsMe: false,
    myTeam: 0,
    flagTimer: 0,
    ...overrides,
  };
}

describe('flagObjective', () => {
  it('sends everyone for the flag while it is free', () => {
    expect(flagObjective(situation())).toMatchObject({ icon: 'flag', target: 'flag' });
    const dropped = flagObjective(situation({ flagState: 'dropped', flagTimer: 8.2 }));
    expect(dropped).toMatchObject({ icon: 'flag', target: 'flag' });
    expect(dropped.detail).toContain('9');
  });

  it('sends the carrier to the enemy base', () => {
    const o = flagObjective(situation({ flagState: 'carried', carrierTeam: 0, carrierIsMe: true }));
    expect(o).toMatchObject({ icon: 'flag', target: 'enemyBase', title: 'SCORE!' });
  });

  it("has the carrier's teammates attack the enemy base", () => {
    const o = flagObjective(situation({ flagState: 'carried', carrierTeam: 0 }));
    expect(o).toMatchObject({ icon: 'attack', target: 'enemyBase', title: 'ATTACK!' });
  });

  it('has the other team defend its own spawn', () => {
    const o = flagObjective(situation({ flagState: 'carried', carrierTeam: 1 }));
    expect(o).toMatchObject({ icon: 'defend', target: 'ownBase', title: 'DEFEND YOUR SPAWN!' });
  });

  it('King of the Hill: take it, hold or defend it, push them out', () => {
    const free = hillObjective({ holder: HILL_FREE, myTeam: 0, inside: false });
    expect(free).toMatchObject({ icon: 'crown', target: 'hill', title: 'TAKE THE HILL!' });
    expect(hillObjective({ holder: 1, myTeam: 0, inside: false }).title).toBe('TAKE THE HILL!');
    expect(hillObjective({ holder: 0, myTeam: 0, inside: true }).title).toBe('HOLD THE HILL!');
    expect(hillObjective({ holder: 0, myTeam: 0, inside: false }).title).toBe('DEFEND THE HILL!');
    expect(hillObjective({ holder: HILL_CONTESTED, myTeam: 1, inside: true })).toMatchObject({
      icon: 'attack',
      title: 'PUSH THEM OUT!',
    });
  });

  it('waits while the flag is away after a capture', () => {
    expect(flagObjective(situation({ flagState: 'away' }))).toMatchObject({
      icon: 'wait',
      target: 'middle',
    });
  });
});
