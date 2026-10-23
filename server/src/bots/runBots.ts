/**
 * Load test: fills a lobby with bots that play like (simple) real players.
 *
 *   pnpm --filter @paint-rush/server bots -- --code K7QX --count 29   join an existing lobby
 *   pnpm --filter @paint-rush/server bots -- --create --start --count 30   make one and start it
 *
 * Options: --server <url> (default http://localhost:2567). Ctrl+C makes every bot leave.
 * Every few seconds it prints how much data the bots receive and send.
 */
import { Client, type InputHandle } from '@colyseus/sdk';
import {
  arenaFor,
  CONFIG,
  createRng,
  DEFAULT_SERVER_PORT,
  MatchState,
  MSG_START,
  NetInput,
  parseLobbyCode,
  parsePhase,
  randomLook,
  ROOM_MATCH,
  WEAPON_KINDS,
  type MapDef,
  type MatchJoinOptions,
} from '@paint-rush/shared';
import { createBotMind, think, type BotMind, type BotView } from './botBrain';

/** Gap between bots joining, so the server isn't hit by 30 joins at once (ms). */
const JOIN_GAP_MS = 120;
const REPORT_SECONDS = 5;
const TICK_MS = 1000 / CONFIG.net.tickRate;

interface Options {
  server: string;
  code: string | null;
  count: number;
  create: boolean;
  start: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const value = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const count = Number(value('--count') ?? 10);
  return {
    server: value('--server') ?? `http://localhost:${DEFAULT_SERVER_PORT}`,
    code: parseLobbyCode(value('--code') ?? ''),
    count: Number.isInteger(count) && count > 0 ? Math.min(count, CONFIG.lobby.maxPlayers) : 10,
    create: argv.includes('--create'),
    start: argv.includes('--start'),
  };
}

function createLobby(server: string, options: MatchJoinOptions) {
  return new Client(server).create(ROOM_MATCH, options, MatchState);
}
type BotRoom = Awaited<ReturnType<typeof createLobby>>;

function joinLobby(server: string, code: string, options: MatchJoinOptions): Promise<BotRoom> {
  return new Client(server).joinById<MatchState>(code, options, MatchState);
}

/** Size in bytes of a message from the `ws` library (Buffer, ArrayBuffer or a list of Buffers). */
function byteSize(data: unknown): number {
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (Array.isArray(data)) return data.reduce((sum: number, part) => sum + byteSize(part), 0);
  if (typeof data === 'string') return data.length;
  return 0;
}

class Bot {
  readonly room: BotRoom;
  private readonly mind: BotMind;
  private readonly random: () => number;
  private readonly input: InputHandle<NetInput>;
  private map: MapDef | null = null;
  private mapKey = '';
  received = 0;
  sent = 0;

  constructor(room: BotRoom, seed: number) {
    this.room = room;
    this.random = createRng(seed);
    this.mind = createBotMind(this.random);
    this.input = room.input({ type: NetInput });
    this.meter();
  }

  /** Counts this bot's network bytes (the SDK's WebSocket from the `ws` library). */
  private meter(): void {
    const transport = (this.room.connection as { transport?: { ws?: unknown } }).transport;
    const ws = transport?.ws as
      | {
          on?: (event: string, fn: (data: unknown) => void) => void;
          send?: (data: unknown) => void;
        }
      | undefined;
    if (!ws?.on || !ws.send) return;
    ws.on('message', (data) => {
      this.received += byteSize(data);
    });
    const send = ws.send.bind(ws);
    ws.send = (data: unknown) => {
      this.sent += byteSize(data);
      send(data);
    };
  }

  /** The arena the server is on (a new layout every round). */
  private currentMap(): MapDef {
    const { mapSeed, arenaSize } = this.room.state;
    const key = `${mapSeed}:${arenaSize}`;
    if (!this.map || key !== this.mapKey) {
      this.map = arenaFor(mapSeed, arenaSize);
      this.mapKey = key;
    }
    return this.map;
  }

  /** One tick: look around, decide, send the input (like the game does 30 times a second). */
  tick(): void {
    const state = this.room.state;
    const me = state.players.get(this.room.sessionId);
    if (!me || parsePhase(state.phase) === 'lobby') return;
    const map = this.currentMap();
    const enemies: BotView['enemies'] = [];
    for (const p of state.players.values()) {
      if (p.team !== me.team && p.respawnTimer <= 0) enemies.push({ x: p.x, y: p.y, z: p.z });
    }
    const carrierTeam = state.players.get(state.flagCarrier)?.team;
    const flagVisible =
      state.flagState === 'home' || state.flagState === 'dropped' || state.flagState === 'carried';
    const view: BotView = {
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
            holder:
              carrierTeam === undefined ? 'none' : carrierTeam === me.team ? 'mine' : 'theirs',
          }
        : null,
      base: map.bases[me.team]?.center ?? map.bases[0].center,
      halfWidth: map.bounds.maxX,
      halfLength: map.bounds.maxZ,
    };
    const command = think(view, this.mind, TICK_MS / 1000, this.random);
    Object.assign(this.input.data, command);
    this.input.send();
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options.create && !options.code) {
    console.error('Give a lobby code (--code K7QX) or --create. See the top of runBots.ts.');
    process.exit(1);
  }
  const lookRandom = createRng(Date.now() >>> 0);
  const botOptions = (i: number): MatchJoinOptions => ({
    name: `Bot ${String(i + 1).padStart(2, '0')}`,
    weapon: Math.floor(lookRandom() * WEAPON_KINDS.length),
    look: randomLook(lookRandom),
  });

  const bots: Bot[] = [];
  let code = options.code;
  for (let i = 0; i < options.count; i++) {
    try {
      const room =
        code === null
          ? await createLobby(options.server, botOptions(i))
          : await joinLobby(options.server, code, botOptions(i));
      if (code === null) {
        code = room.roomId;
        console.log(`[bots] created lobby ${code}`);
      }
      bots.push(new Bot(room, 1000 + i));
    } catch (error) {
      console.error(`[bots] bot ${i + 1} could not join:`, error);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, JOIN_GAP_MS));
  }
  console.log(`[bots] ${bots.length} bots in lobby ${code ?? '?'}`);
  if (options.start && options.create && bots[0]) bots[0].room.send(MSG_START);

  const ticker = setInterval(() => {
    for (const bot of bots) bot.tick();
  }, TICK_MS);

  const reporter = setInterval(() => {
    const live = bots.filter((bot) => bot.room.connection.isOpen);
    const down = live.map((bot) => bot.received / 1024 / REPORT_SECONDS);
    const up = live.map((bot) => bot.sent / 1024 / REPORT_SECONDS);
    for (const bot of bots) {
      bot.received = 0;
      bot.sent = 0;
    }
    const avg = (values: number[]) =>
      values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
    const f = (value: number) => value.toFixed(1);
    console.log(
      `[bots] ${live.length} connected · down avg ${f(avg(down))} KB/s, max ${f(Math.max(0, ...down))} KB/s · ` +
        `up avg ${f(avg(up))} KB/s`,
    );
  }, REPORT_SECONDS * 1000);

  process.on('SIGINT', () => {
    clearInterval(ticker);
    clearInterval(reporter);
    console.log('[bots] leaving…');
    Promise.allSettled(bots.map((bot) => bot.room.leave())).finally(() => process.exit(0));
  });
}

void main();
