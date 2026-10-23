import {
  CONFIG,
  GAME_MODE_NAMES,
  GAME_MODES,
  LOBBY_CODE_LENGTH,
  parseLobbyCode,
  STAGE_MODE_NAMES,
  type GameMode,
  type Look,
  type StageMode,
} from '@paint-rush/shared';
import { TEAM_COLORS } from '../render/palette';
import { createLookPicker } from './lookPicker';
import { createRoleCards } from './roleCards';
import { createStatsTable, type StatsRow } from './statsTable';

/** One row of the lobby's player list. */
export interface LobbyPlayer {
  id: string;
  name: string;
  host: boolean;
  me: boolean;
  /** Played by the server ("Play with bots"). */
  bot: boolean;
}

/** Everything the lobby screen shows; re-rendered whenever it changes. */
export interface LobbyView {
  code: string;
  players: LobbyPlayer[];
  isHost: boolean;
  /** Bots in the lobby now, and the most there's room for (the rest of the spots are people's). */
  bots: number;
  maxBots: number;
  matchMinutes: number;
  /** Stages (rounds) to win (3, 5 or 7). */
  capturesToWin: number;
  gameMode: GameMode;
  /** SVG markup of the join QR code (host only), or null while it's being made. */
  qrSvg: string | null;
  joinLink: string;
}

export interface LobbyActions {
  start: () => void;
  kick: (id: string) => void;
  setMinutes: (minutes: number) => void;
  setCaptureGoal: (captures: number) => void;
  setGameMode: (mode: GameMode) => void;
  setBots: (count: number) => void;
  editLook: () => void;
  leave: () => void;
}

/** The look editor: a box for the 3D preview next to the part pickers. */
function customizeSection(look: Look, changeLook: (look: Look) => void) {
  const section = element('div', 'look-section');
  const preview = element('div', 'look-preview');
  section.append(preview, createLookPicker(look, changeLook));
  return { section, preview };
}

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const el = element('button', className, label);
  el.type = 'button';
  el.addEventListener('click', onClick);
  return el;
}

/**
 * The full-screen menus before and around a match: home, join, lobby and messages. One shows
 * at a time, over the 3D arena. Names always go in as text (never HTML), since players type them.
 */
export class Screens {
  private readonly root = element('div', 'screen');
  private readonly card = element('div', 'menu-card screen-card');
  /** Runs when the current screen goes away (e.g. to free its 3D preview). */
  private cleanup: (() => void) | null = null;
  /** Which screen is showing ('home', 'lobby', …), so updates don't replay the entrance. */
  private shownKind = '';

  constructor() {
    this.root.append(this.card);
    this.root.hidden = true;
    document.body.append(this.root);
  }

  hide(): void {
    this.runCleanup();
    this.root.hidden = true;
    this.shownKind = '';
  }

  /** Something to undo when the current screen is replaced or hidden. */
  onClose(cleanup: () => void): void {
    this.cleanup = cleanup;
  }

  /** Start screen: create a lobby (with or without bots), or type a code to join one. */
  showHome(
    actions: { create: () => void; playWithBots: () => void; joinCode: (code: string) => void },
    note = '',
  ): void {
    const codeInput = element('input', 'screen-code-input');
    codeInput.placeholder = 'CODE';
    codeInput.maxLength = LOBBY_CODE_LENGTH + 1;
    codeInput.autocapitalize = 'characters';
    codeInput.autocomplete = 'off';
    codeInput.spellcheck = false;
    const error = element('p', 'menu-note', note);
    error.hidden = note === '';
    const join = () => {
      const code = parseLobbyCode(codeInput.value);
      if (code) actions.joinCode(code);
      else {
        error.textContent = `Lobby codes are ${LOBBY_CODE_LENGTH} letters/numbers, like K7QX.`;
        error.hidden = false;
      }
    };
    codeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') join();
    });
    const joinRow = element('div', 'screen-row');
    joinRow.append(codeInput, button('Join', 'screen-button', join));
    const offline = element('a', 'screen-link', 'Practice alone (offline sandbox)');
    offline.href = '/?offline';

    this.show(
      'home',
      element('h1', 'logo', 'Paint Rush'),
      button('Create Lobby', 'menu-play', actions.create),
      button('🤖 Play with bots', 'screen-button', actions.playWithBots),
      element('p', 'menu-heading', 'or join with a code'),
      joinRow,
      error,
      offline,
    );
  }

  /**
   * Name, look and role, then Join (or Create, when `code` is null). Returns the box for the
   * 3D preview, and a way to show progress and errors while connecting.
   */
  showJoin(options: {
    code: string | null;
    /** A new lobby that starts with bots ("Play with bots"). */
    withBots?: boolean;
    name: string;
    weapon: number;
    look: Look;
    submit: (name: string) => void;
    pickWeapon: (weapon: number) => void;
    changeLook: (look: Look) => void;
    back: () => void;
  }) {
    const nameInput = element('input', 'screen-name-input');
    nameInput.placeholder = 'Your name';
    nameInput.value = options.name;
    nameInput.maxLength = CONFIG.lobby.maxNameLength;
    // A valid HTML autofill hint, but missing from TypeScript's AutoFill type.
    nameInput.setAttribute('autocomplete', 'nickname');
    const label = element('label', 'screen-label', 'Name');
    label.append(nameInput);
    const roles = createRoleCards(options.weapon, options.pickWeapon);
    const status = element('p', 'menu-note');
    status.hidden = true;
    const go = button(options.code ? 'Join' : 'Create lobby', 'menu-play', () =>
      options.submit(nameInput.value),
    );
    nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !go.disabled) go.click();
    });

    const customize = customizeSection(options.look, options.changeLook);

    const title = options.code
      ? `Join lobby ${options.code}`
      : options.withBots
        ? 'Play with bots'
        : 'New lobby';
    this.show(
      'join',
      element('h1', undefined, title),
      label,
      element('p', 'menu-heading', 'Customize'),
      customize.section,
      element('p', 'menu-heading', 'Choose your role'),
      roles.element,
      go,
      status,
      button('Back', 'screen-link-button', options.back),
    );
    // On phones, popping up the keyboard straight away would hide the screen.
    if (!window.matchMedia('(pointer: coarse)').matches) nameInput.focus();
    return {
      preview: customize.preview,
      busy(text: string): void {
        go.disabled = true;
        status.textContent = text;
        status.hidden = false;
      },
      failed(text: string): void {
        go.disabled = false;
        status.textContent = text;
        status.hidden = false;
      },
    };
  }

  /** The lobby: QR code and code for the host, the player list, and the host's controls. */
  showLobby(view: LobbyView, actions: LobbyActions): void {
    const parts: HTMLElement[] = [element('h1', undefined, 'Lobby')];
    const code = element('p', 'screen-code', view.code);
    if (view.isHost) {
      const qr = element('div', 'screen-qr');
      if (view.qrSvg) qr.innerHTML = view.qrSvg;
      const link = element('p', 'screen-join-link', view.joinLink);
      parts.push(qr, element('p', 'menu-heading', 'Scan to join, or enter the code:'), code, link);
    } else {
      parts.push(element('p', 'menu-heading', 'Lobby code'), code);
    }

    const list = element('ul', 'screen-players');
    for (const player of view.players) {
      const row = element('li', player.me ? 'me' : undefined);
      row.append(element('span', 'screen-player-name', player.name));
      if (player.bot) row.append(element('span', 'screen-tag screen-tag-bot', '🤖 bot'));
      if (player.host) row.append(element('span', 'screen-tag', 'host'));
      if (player.me) row.append(element('span', 'screen-tag', 'you'));
      if (view.isHost && !player.me) {
        const kick = button('✕', 'screen-kick', () => actions.kick(player.id));
        kick.title = `Remove ${player.name}`;
        kick.setAttribute('aria-label', `Remove ${player.name}`);
        row.append(kick);
      }
      list.append(row);
    }
    parts.push(
      element('p', 'menu-heading', `Players (${view.players.length}/${CONFIG.lobby.maxPlayers})`),
      list,
    );

    if (view.isHost) {
      const minutes = element('select', 'screen-select');
      for (const option of CONFIG.lobby.matchMinuteOptions) {
        const el = element('option', undefined, `${option} minutes`);
        el.value = String(option);
        el.selected = option === view.matchMinutes;
        minutes.append(el);
      }
      minutes.addEventListener('change', () => actions.setMinutes(Number(minutes.value)));
      const length = element('label', 'screen-label', 'Match length');
      length.append(minutes);
      const mode = element('select', 'screen-select');
      for (const option of GAME_MODES) {
        const el = element('option', undefined, GAME_MODE_NAMES[option]);
        el.value = option;
        el.selected = option === view.gameMode;
        mode.append(el);
      }
      mode.addEventListener('change', () => actions.setGameMode(mode.value as GameMode));
      const modeLabel = element('label', 'screen-label', 'Game mode');
      modeLabel.append(mode);
      const goal = element('select', 'screen-select');
      for (const option of CONFIG.lobby.captureGoalOptions) {
        const el = element('option', undefined, `First to ${option} rounds`);
        el.value = String(option);
        el.selected = option === view.capturesToWin;
        goal.append(el);
      }
      goal.addEventListener('change', () => actions.setCaptureGoal(Number(goal.value)));
      const goalLabel = element('label', 'screen-label', 'Rounds to win');
      goalLabel.append(goal);
      const enough = view.players.length >= CONFIG.lobby.minPlayersToStart;
      const start = button(
        enough ? 'Start' : `Start (needs ${CONFIG.lobby.minPlayersToStart} players, or add a bot)`,
        'menu-play',
        actions.start,
      );
      start.disabled = !enough;
      parts.push(modeLabel, length, goalLabel, this.botStepper(view, actions), start);
    } else {
      parts.push(
        element(
          'p',
          'screen-waiting',
          `Waiting for the host… (${GAME_MODE_NAMES[view.gameMode]}, ${view.matchMinutes} min, ` +
            `first to ${view.capturesToWin} rounds)`,
        ),
      );
    }
    parts.push(
      button('Edit look', 'screen-button', actions.editLook),
      button('Leave lobby', 'screen-link-button', actions.leave),
    );
    this.show('lobby', ...parts);
  }

  /** The host's "Bots: − 7 +" control (the server plays the bots). */
  private botStepper(view: LobbyView, actions: LobbyActions): HTMLElement {
    const row = element('div', 'screen-stepper');
    const less = button('−', 'screen-step', () => actions.setBots(view.bots - 1));
    less.disabled = view.bots <= 0;
    less.setAttribute('aria-label', 'One bot fewer');
    const more = button('+', 'screen-step', () => actions.setBots(view.bots + 1));
    more.disabled = view.bots >= view.maxBots;
    more.setAttribute('aria-label', 'One more bot');
    row.append(less, element('span', 'screen-step-value', String(view.bots)), more);
    const label = element('div', 'screen-label', 'Bots');
    label.append(row);
    return label;
  }

  /** Change your look while waiting in the lobby. Returns the box for the 3D preview. */
  showLookEditor(look: Look, changeLook: (look: Look) => void, done: () => void): HTMLElement {
    const customize = customizeSection(look, changeLook);
    this.show(
      'look',
      element('h1', undefined, 'Your look'),
      customize.section,
      element('p', 'screen-waiting', 'Everyone in the lobby sees changes right away.'),
      button('Done', 'menu-play', done),
    );
    return customize.preview;
  }

  /**
   * The end of a match: who won, the final score and turf, and everyone's stats. The host can
   * start the next one (Play Again: back to the lobby); everyone can leave.
   */
  showResults(view: {
    winner: number;
    reason: string;
    scores: [number, number];
    turf: [number, number];
    rows: StatsRow[];
    isHost: boolean;
    playAgain: () => void;
    leave: () => void;
  }): void {
    const title =
      view.winner < 0 ? "It's a draw!" : `${view.winner === 0 ? 'Pink' : 'Cyan'} team wins!`;
    const heading = element('h1', 'results-title', title);
    if (view.winner >= 0) heading.style.color = cssColor(TEAM_COLORS[view.winner]);
    const summary = element(
      'p',
      'results-summary',
      `Rounds ${view.scores[0]} – ${view.scores[1]} · Paint ${view.turf[0]} – ${view.turf[1]}` +
        (view.reason === 'turf' ? ' (decided by paint)' : ''),
    );
    const next = view.isHost
      ? button('Play again', 'menu-play', view.playAgain)
      : element('p', 'screen-waiting', 'Waiting for the host to play again…');
    this.show(
      'results',
      heading,
      summary,
      createStatsTable(view.rows, true),
      next,
      button('Leave lobby', 'screen-link-button', view.leave),
    );
    this.card.classList.add('results-card');
  }

  /** A message with one button, e.g. "You were removed by the host". */
  showMessage(title: string, text: string, action: { label: string; run: () => void }): void {
    this.show(
      'message',
      element('h1', undefined, title),
      element('p', 'screen-message', text),
      button(action.label, 'menu-play', action.run),
    );
  }

  /**
   * Replaces the card's contents. A different `kind` of screen pops in, its parts rising one
   * after another; the same screen updating (e.g. someone joined the lobby) just swaps them.
   */
  private show(kind: string, ...children: HTMLElement[]): void {
    this.runCleanup();
    this.card.classList.remove('results-card');
    this.card.replaceChildren(...children);
    const fresh = kind !== this.shownKind || this.root.hidden;
    this.shownKind = kind;
    this.card.classList.remove('enter');
    if (fresh) {
      children.forEach((child, i) => child.style.setProperty('--i', String(i)));
      void this.card.offsetWidth;
      this.card.classList.add('enter');
    }
    this.root.hidden = false;
  }

  private runCleanup(): void {
    const cleanup = this.cleanup;
    this.cleanup = null;
    cleanup?.();
  }
}

/**
 * The banner over the game around the start: both teams during the reveal, then a big
 * 3 · 2 · 1 and GO. It never blocks clicks, so you can still click to play.
 */
export class MatchBanner {
  private readonly root = element('div', 'match-banner');
  private shown = '';
  private hideTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.root.hidden = true;
    document.body.append(this.root);
  }

  /** Team lists (team 0 then team 1), plus "Starting in N". */
  showReveal(teams: [string[], string[]], secondsLeft: number): void {
    const key = `reveal|${teams[0].join(',')}|${teams[1].join(',')}|${secondsLeft}`;
    if (!this.update(key)) return;
    const columns = element('div', 'banner-teams');
    teams.forEach((names, team) => {
      const column = element('div', 'banner-team');
      column.style.setProperty('--team', cssColor(TEAM_COLORS[team]));
      column.append(element('h2', undefined, team === 0 ? 'Pink team' : 'Cyan team'));
      const list = element('ul');
      for (const name of names) list.append(element('li', undefined, name));
      column.append(list);
      columns.append(column);
    });
    this.root.replaceChildren(columns, element('p', 'banner-sub', `Starting in ${secondsLeft}…`));
  }

  /** 3 · 2 · 1, with which stage this is and what it's played as. */
  showCountdown(secondsLeft: number, stage: number, mode: StageMode): void {
    if (this.update(`count|${secondsLeft}|${stage}|${mode}`)) {
      this.root.replaceChildren(
        element('p', 'banner-sub banner-stage', `Round ${stage} · ${STAGE_MODE_NAMES[mode]}`),
        element('p', 'banner-big', String(Math.max(1, secondsLeft))),
      );
    }
  }

  /**
   * The match is over: who won and how. `winner` is a team, or −1 for a draw; `reason` is a
   * MatchResult reason.
   */
  showEnd(
    winner: number,
    reason: string,
    scores: [number, number],
    turf: [number, number],
    goal: number,
  ): void {
    const key = `end|${winner}|${reason}|${scores.join()}|${turf.join()}`;
    if (!this.update(key)) return;
    const title = winner < 0 ? "It's a draw!" : `${winner === 0 ? 'Pink' : 'Cyan'} team wins!`;
    const big = element('p', 'banner-big banner-end', title);
    if (winner >= 0) big.style.color = cssColor(TEAM_COLORS[winner]);
    const how =
      reason === 'captures'
        ? `${scores[0]} – ${scores[1]} · first to ${goal} rounds`
        : reason === 'time'
          ? `Time's up! ${scores[0]} – ${scores[1]}`
          : `Time's up! ${scores[0]} – ${scores[1]}, decided by paint: ${turf[0]} vs ${turf[1]}`;
    this.root.replaceChildren(big, element('p', 'banner-sub', how));
  }

  /** After a stage is won (a capture, or the hill): who won it, and that a new arena is coming. */
  showScored(team: number, scores: [number, number], goal: number, mode: StageMode): void {
    if (!this.update(`scored|${team}|${scores.join()}|${mode}`)) return;
    const name = team === 0 ? 'Pink' : 'Cyan';
    const title = mode === 'koth' ? `${name} takes the hill!` : `${name} scores!`;
    const big = element('p', 'banner-big banner-end', title);
    big.style.color = cssColor(TEAM_COLORS[team] ?? TEAM_COLORS[0]);
    this.root.replaceChildren(
      big,
      element('p', 'banner-sub', `${scores[0]} – ${scores[1]} · first to ${goal} · new arena!`),
    );
  }

  /** "GO!" for a moment, then the banner hides by itself. */
  showGo(): void {
    if (!this.update('go')) return;
    this.root.replaceChildren(element('p', 'banner-big', 'GO!'));
    this.hideTimer = setTimeout(() => this.hide(), 900);
  }

  hide(): void {
    this.shown = '';
    this.root.hidden = true;
  }

  /** Only rebuild when the content actually changes (this is called every frame). */
  private update(key: string): boolean {
    if (key === this.shown) return false;
    clearTimeout(this.hideTimer);
    this.shown = key;
    this.root.hidden = false;
    return true;
  }
}
