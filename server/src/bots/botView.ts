import type { MapDef, MatchState, NetPlayer } from '@paint-rush/shared';
import type { BotView } from './botBrain';

/** Whether the bot `me` can see `enemy` (e.g. no wall in between); everyone, if not given. */
export type CanSee = (me: NetPlayer, enemy: NetPlayer) => boolean;

/**
 * What the bot `meId` sees of the match: itself, the enemies it can see, the flag, and both
 * bases. Used by the server's own bots and by the load-test bots (which read their copy of
 * the synced state). Null if that player isn't in the match.
 */
export function botViewOf(
  state: MatchState,
  meId: string,
  map: MapDef,
  canSee?: CanSee,
): BotView | null {
  const me = state.players.get(meId);
  if (!me) return null;
  const enemies: BotView['enemies'] = [];
  for (const p of state.players.values()) {
    if (p.team === me.team || p.respawnTimer > 0) continue;
    if (canSee && !canSee(me, p)) continue;
    enemies.push({ x: p.x, y: p.y, z: p.z });
  }
  const carrierTeam = state.players.get(state.flagCarrier)?.team;
  const flagVisible =
    state.flagState === 'home' || state.flagState === 'dropped' || state.flagState === 'carried';
  const team = me.team === 1 ? 1 : 0;
  const enemyTeam = team === 1 ? 0 : 1;
  return {
    me: {
      x: me.x,
      y: me.y,
      z: me.z,
      team: me.team,
      carrying: me.carrying,
      splatted: me.respawnTimer > 0,
    },
    enemies,
    flag: flagVisible
      ? {
          x: state.flagX,
          y: state.flagY,
          z: state.flagZ,
          holder: carrierTeam === undefined ? 'none' : carrierTeam === me.team ? 'mine' : 'theirs',
        }
      : null,
    base: map.bases[team].center,
    enemyBase: map.bases[enemyTeam].center,
    halfWidth: map.bounds.maxX,
    halfLength: map.bounds.maxZ,
  };
}
