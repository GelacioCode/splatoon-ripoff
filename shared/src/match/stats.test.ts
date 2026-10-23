import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { DamageLog, highlights, playerScore, type PlayerStats } from './stats';

const WINDOW = CONFIG.player.assistWindowSeconds;

function stats(id: string, values: Partial<PlayerStats>): PlayerStats & { id: string } {
  return { id, kills: 0, deaths: 0, assists: 0, captures: 0, paint: 0, ...values };
}

describe('assists', () => {
  it('go to everyone who hit the victim shortly before the splat, except the splatter', () => {
    const log = new DamageLog();
    log.record('victim', 'alex', 10);
    log.record('victim', 'sam', 12);
    log.record('victim', 'kim', 12 - WINDOW - 1);
    expect(log.takeAssists('victim', 'sam', 12).sort()).toEqual(['alex']);
  });

  it('start fresh after each splat, and forget players who left', () => {
    const log = new DamageLog();
    log.record('victim', 'alex', 1);
    log.takeAssists('victim', 'sam', 2);
    expect(log.takeAssists('victim', 'sam', 3)).toEqual([]);
    log.record('victim', 'alex', 4);
    log.forget('alex');
    expect(log.takeAssists('victim', 'sam', 5)).toEqual([]);
  });
});

describe('end of match', () => {
  it('ranks captures above splats above assists above paint', () => {
    const capper = playerScore(stats('a', { captures: 1 }));
    const fragger = playerScore(stats('b', { kills: 4 }));
    const helper = playerScore(stats('c', { assists: 1 }));
    const painter = playerScore(stats('d', { paint: 40 }));
    expect(capper).toBeGreaterThan(fragger);
    expect(fragger).toBeGreaterThan(helper);
    expect(helper).toBeGreaterThan(painter);
  });

  it('awards highlights to the top player in each, never for zero', () => {
    const players = [
      stats('a', { kills: 5, paint: 100 }),
      stats('b', { kills: 2, paint: 300 }),
      stats('c', { kills: 5 }),
    ];
    expect(highlights(players)).toEqual({ splats: 'a', paint: 'b' });
  });
});
