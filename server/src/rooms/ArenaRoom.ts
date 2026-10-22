import { Room, type Client, type StepContext } from '@colyseus/core';
import { StateView } from '@colyseus/schema';
import {
  ARENA,
  ArenaState,
  buildSurfaces,
  CONFIG,
  decodePaintEvents,
  DEFAULT_WEAPON,
  encodePaintEvents,
  encodePaintSnapshot,
  encodeShotEvents,
  MSG_CHOOSE_WEAPON,
  MSG_PAINT,
  MSG_PAINT_SNAPSHOT,
  MSG_REQUEST_PAINT,
  MSG_SHOTS,
  NetInput,
  NetPlayer,
  PaintGrid,
  parseWeaponChoice,
  seedFromString,
  shotEventOf,
  type ArenaJoinOptions,
  type PaintEvent,
} from '@paint-rush/shared';
import {
  createPlayerState,
  PhysicsWorld,
  setWeapon,
  stepPlayer,
  stepProjectiles,
  stepWeapon,
  type Collider,
  type Projectile,
} from '@paint-rush/shared/sim';

/** Falling below this height puts a player back on their team's spawn pad. */
const RESPAWN_BELOW_Y = -10;
/** A dropped player is kept this long, so a reconnecting client gets them back (s). */
const RECONNECT_SECONDS = 20;

/**
 * The authoritative arena: runs every player with the shared game rules at a fixed 30 Hz.
 * Clients predict their own player with the same rules and smooth everyone else.
 */
export class ArenaRoom extends Room<{ state: ArenaState; input: NetInput }> {
  maxClients = CONFIG.lobby.maxPlayers;
  state = new ArenaState();

  inputs = this.defineInput(NetInput, {
    bufferMaxSize: 64,
    sanitize: { moveX: [-1, 1], moveY: [-1, 1], aimPitch: [-1.6, 1.6] },
    // Through short network gaps, keep using the player's last input so they don't stutter.
    idle: ({ latest }) => latest ?? true,
  });

  private readonly physics = new PhysicsWorld(ARENA.blocks);
  private readonly paint = new PaintGrid(buildSurfaces(ARENA.blocks));
  private readonly bodies = new Map<string, Collider>();
  /** Every shot in flight. These are the real ones: they decide where paint lands. */
  private readonly projectiles: Projectile[] = [];

  onCreate() {
    this.setFixedTimestep((ctx) => this.step(ctx), CONFIG.net.tickRate);
  }

  messages = {
    // Switching role: checked here, so a client can't ask for a weapon that doesn't exist.
    // Re-picking the same role is ignored, so it can't be used as an instant reload.
    [MSG_CHOOSE_WEAPON]: (client: Client, payload: unknown) => {
      const weapon = parseWeaponChoice(payload);
      const player = this.state.players.get(client.sessionId);
      if (weapon === null || !player || player.weapon === weapon) return;
      setWeapon(player, weapon);
    },
    // A player who just joined or reconnected needs all the paint so far.
    [MSG_REQUEST_PAINT]: (client: Client) => {
      client.sendBytes(MSG_PAINT_SNAPSHOT, encodePaintSnapshot(this.paint.exportCells()));
    },
  };

  onJoin(client: Client, options?: ArenaJoinOptions) {
    const team = this.pickTeam();
    const weapon = parseWeaponChoice(options?.weapon) ?? DEFAULT_WEAPON;
    const player = new NetPlayer(
      createPlayerState(this.spawnFor(team), spawnYaw(team), team, weapon),
    );
    this.state.players.set(client.sessionId, player);
    this.bodies.set(client.sessionId, this.physics.createCharacter(player));
    // Owner-only fields (timers, ink) go to this client for its own player.
    client.view = new StateView();
    client.view.add(player);
    console.log(
      `[arena] ${client.sessionId} joined team ${team} (${this.state.players.size} players)`,
    );
  }

  onDrop(client: Client) {
    // If they come back within the window they keep their player; otherwise onLeave runs.
    void this.allowReconnection(client, RECONNECT_SECONDS);
  }

  onLeave(client: Client) {
    const body = this.bodies.get(client.sessionId);
    if (body) this.physics.removeCharacter(body);
    this.bodies.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    console.log(`[arena] ${client.sessionId} left (${this.state.players.size} players)`);
  }

  onDispose() {
    this.physics.dispose();
  }

  /**
   * One authoritative tick: one input per player, then the shared rules for movement,
   * weapons and shots. New shots go to everyone else; the paint that landed goes to everyone.
   */
  private step(ctx: StepContext): void {
    for (const [sessionId, player] of this.state.players) {
      const body = this.bodies.get(sessionId);
      const input = this.inputs.get(sessionId).next();
      if (!body || !input) continue;
      stepPlayer(this.physics, body, player, input, ctx.dt, this.paint);

      const firstNew = this.projectiles.length;
      // Seeded by session id: the shooter's screen predicts exactly the same spread.
      const fired = stepWeapon(player, input, ctx.dt, seedFromString(sessionId), this.projectiles);
      if (fired > 0) this.sendShots(sessionId, this.projectiles.slice(firstNew));

      if (player.y < RESPAWN_BELOW_Y) {
        // Shot numbers keep counting, so the player's screen never mistakes new shots for old.
        const { shotCount } = player;
        Object.assign(
          player,
          createPlayerState(
            this.spawnFor(player.team),
            spawnYaw(player.team),
            player.team,
            player.weapon,
          ),
        );
        player.shotCount = shotCount;
      }
    }

    const landed: PaintEvent[] = [];
    stepProjectiles(this.physics, this.projectiles, ctx.dt, (hit) =>
      landed.push({
        point: hit.point,
        radius: hit.radius,
        team: hit.team,
        drip: hit.drip,
        direction: hit.direction,
      }),
    );
    this.physics.step();
    if (landed.length > 0) this.applyPaint(landed);
  }

  /** Tells everyone but the shooter about new shots, so their screens can fly them too. */
  private sendShots(shooterId: string, shots: Projectile[]): void {
    const bytes = encodeShotEvents(shots.map(shotEventOf));
    const shooter = this.clients.getById(shooterId);
    this.broadcastBytes(MSG_SHOTS, bytes, shooter ? { except: shooter } : {});
  }

  /**
   * Paints the server's grid and sends the same paint to everyone. The grid is painted from
   * the packed values, so every screen's grid ends up exactly like the server's.
   */
  private applyPaint(landed: PaintEvent[]): void {
    const bytes = encodePaintEvents(landed);
    for (const event of decodePaintEvents(bytes)) {
      this.paint.splat(event.point, event.radius, event.team);
    }
    this.broadcastBytes(MSG_PAINT, bytes, {});
  }

  /** Alternates teams by head count (Phase 3 replaces this with lobby auto-balance). */
  private pickTeam(): number {
    let team0 = 0;
    for (const player of this.state.players.values()) if (player.team === 0) team0++;
    return team0 <= this.state.players.size - team0 ? 0 : 1;
  }

  private spawnFor(team: number) {
    const spawns = ARENA.spawns[team];
    const spot = spawns[Math.floor(Math.random() * spawns.length)];
    return { x: spot.x, y: spot.y + 0.05, z: spot.z };
  }
}

/** Each team starts facing the middle of the map. */
function spawnYaw(team: number): number {
  return team === 0 ? Math.PI : 0;
}
