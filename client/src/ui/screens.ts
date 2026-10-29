import {
  AUTO_TEAM,
  CONFIG,
  GAME_MODE_NAMES,
  GAME_MODES,
  LOBBY_CODE_LENGTH,
  MAP_CHOICE_NAMES,
  MAP_CHOICES,
  parseLobbyCode,
  STAGE_MODE_NAMES,
  TEAM_PALETTES,
  type GameMode,
  type Look,
  type MapChoice,
  type MapTheme,
  type StageMode,
} from '@paint-rush/shared';
import { TEAM_COLORS, teamName, teamTextColor, textOnTeam } from '../render/palette';
import { createHowToPlay } from './howToPlay';
import { InvitePopup } from './invitePopup';
import { createLookPicker } from './lookPicker';
import { createRoleCards } from './roleCards';
import { createStatsTable, type StatsRow } from './statsTable';
import { createTabs } from './tabs';

/** One row of the lobby's player list. */
export interface LobbyPlayer {
  id: string;
  name: string;
  host: boolean;
  me: boolean;
  /** Played by the server ("Play with bots"). */
  bot: boolean;
  /** Team wish: 0, 1 or AUTO_TEAM. */
  pick: number;
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
  /** The map: a theme, or a new random one every round. */
  mapChoice: MapChoice;
  /** The team color pair (index in TEAM_PALETTES). */
  teamColors: number;
  /** SVG markup of the join QR code, or null while it's being made. */
  qrSvg: string | null;
  joinLink: string;
}

export interface LobbyActions {
  start: () => void;
  kick: (id: string) => void;
  pickTeam: (pick: number) => void;
  setMinutes: (minutes: number) => void;
  setCaptureGoal: (captures: number) => void;
  setGameMode: (mode: GameMode) => void;
  setMap: (choice: MapChoice) => void;
  setTeamColors: (index: number) => void;
  setBots: (count: number) => void;
  editLook: () => void;
  leave: () => void;
}

/** What the start screen starts with. */
export interface HomeView {
  name: string;
  /** Invited to this lobby (a /join/CODE link), or null. */
  code: string | null;
  look: Look;
  weapon: number;
  /** A message to show first, e.g. a bad lobby code. */
  note: string;
  /** The settings tabs (made by the game, which applies the changes). */
  settings: HTMLElement;
  touchDevice: boolean;
}

export interface HomeActions {
  create: (name: string) => void;
  playWithBots: (name: string) => void;
  join: (code: string, name: string) => void;
  pickWeapon: (weapon: number) => void;
  changeLook: (look: Look) => void;
  /** The Customize tab opened: show the 3D preview in `box`; returns how to remove it. */
  showPreview: (box: HTMLElement) => () => void;
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

/** A labelled select with the given options. */
function select<T extends string | number>(
  label: string,
  value: T,
  options: [T, string][],
  change: (value: T) => void,
): HTMLLabelElement {
  const wrap = element('label', 'screen-label');
  const el = element('select', 'screen-select');
  for (const [option, text] of options) {
    const o = element('option', undefined, text);
    o.value = String(option);
    o.selected = option === value;
    el.append(o);
  }
  el.addEventListener('change', () => {
    const picked = options.find(([option]) => String(option) === el.value);
    if (picked) change(picked[0]);
  });
  wrap.append(el);
  wrap.prepend(element('span', 'screen-label-text', label));
  return wrap;
}

/**
 * The full-screen menus before and around a match: the start hub, the lobby, results and
 * messages. One shows at a time, over the 3D arena. Names always go in as text (never HTML),
 * since players type them.
 */
export class Screens {
  private readonly root = element('div', 'screen');
  private readonly card = element('div', 'menu-card screen-card');
  /** Runs when the current screen goes away (e.g. to free its 3D preview). */
  private cleanup: (() => void) | null = null;
  /** Which screen is showing ('home', 'lobby', …), so updates don't replay the entrance. */
  private shownKind = '';
  /** The lobby's open tab on phones, kept while the lobby updates. */
  private lobbyTab = 'teams';
  /** The lobby's invite popup (QR code, copy and share), kept open while the lobby updates. */
  private readonly invite = new InvitePopup();

  constructor() {
    // Decorative paint splats behind the cards.
    const splats = element('div', 'screen-splats');
    splats.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 6; i++) splats.append(element('span', `splat splat-${i}`));
    this.root.append(splats, this.card, this.invite.element);
    this.root.hidden = true;
    document.body.append(this.root);
  }

  hide(): void {
    this.runCleanup();
    this.invite.close();
    this.root.hidden = true;
    this.shownKind = '';
  }

  /** Something to undo when the current screen is replaced or hidden. */
  onClose(cleanup: () => void): void {
    this.cleanup = cleanup;
  }

  /**
   * The start hub: Play (your name, Create lobby, Play with bots, join by code, practice
   * offline), Customize (look and role, with a 3D preview), How to play and Settings, as tabs
   * along the bottom. Returns a way to show progress and errors while connecting.
   */
  showHome(view: HomeView, actions: HomeActions) {
    // --- Play
    const play = element('div', 'home-play');
    const nameInput = element('input', 'screen-name-input');
    nameInput.placeholder = 'Your name';
    nameInput.value = view.name;
    nameInput.maxLength = CONFIG.lobby.maxNameLength;
    // A valid HTML autofill hint, but missing from TypeScript's AutoFill type.
    nameInput.setAttribute('autocomplete', 'nickname');
    const nameLabel = element('label', 'screen-label');
    nameLabel.append(element('span', 'screen-label-text', 'Your name'), nameInput);
    const status = element('p', 'menu-note', view.note);
    status.hidden = view.note === '';
    const name = () => nameInput.value;

    const codeInput = element('input', 'screen-code-input');
    codeInput.placeholder = 'CODE';
    codeInput.maxLength = LOBBY_CODE_LENGTH + 1;
    codeInput.autocapitalize = 'characters';
    codeInput.autocomplete = 'off';
    codeInput.spellcheck = false;
    if (view.code) codeInput.value = view.code;
    const join = () => {
      const code = parseLobbyCode(codeInput.value);
      if (code) actions.join(code, name());
      else {
        status.textContent = `Lobby codes are ${LOBBY_CODE_LENGTH} letters/numbers, like K7QX.`;
        status.hidden = false;
      }
    };
    codeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') join();
    });
    const joinRow = element('div', 'screen-row');
    joinRow.append(codeInput, button('Join', 'screen-button', join));

    const buttons: HTMLButtonElement[] = [];
    const main = view.code
      ? button(`Join lobby ${view.code}`, 'menu-play', join)
      : button('Create lobby', 'menu-play', () => actions.create(name()));
    const bots = button('🤖 Play with bots', 'screen-button home-bots', () =>
      actions.playWithBots(name()),
    );
    buttons.push(main, bots);
    nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !main.disabled) main.click();
    });
    const offline = element('a', 'screen-link', '🎯 Practice alone (offline)');
    offline.href = '/?offline';
    if (view.code) {
      play.append(element('p', 'home-invite', `You're invited to lobby ${view.code}!`));
    }
    play.append(
      nameLabel,
      main,
      bots,
      element('p', 'menu-heading home-or', view.code ? 'or another code' : 'or join with a code'),
      joinRow,
      status,
      offline,
    );

    // --- Customize
    const customizePage = element('div', 'home-customize');
    const customize = customizeSection(view.look, actions.changeLook);
    const roles = createRoleCards(view.weapon, actions.pickWeapon);
    customizePage.append(
      element('p', 'menu-heading', 'Your blob'),
      customize.section,
      element('p', 'menu-heading', 'Your role'),
      roles.element,
    );

    let removePreview: (() => void) | null = null;
    const tabs = createTabs(
      [
        { id: 'play', label: '▶ Play', content: play },
        { id: 'customize', label: '🎨 Customize', content: customizePage },
        { id: 'how', label: '❓ How to play', content: createHowToPlay(view.touchDevice) },
        { id: 'settings', label: '⚙ Settings', content: view.settings },
      ],
      'home-tabs',
      (id) => {
        removePreview?.();
        removePreview = id === 'customize' ? actions.showPreview(customize.preview) : null;
      },
    );

    const logo = element('h1', 'logo', 'Paint Rush');
    const tagline = element('p', 'home-tagline', 'Splat · Swim · Score');
    this.show('home', logo, tagline, tabs.element);
    this.card.classList.add('home-card');
    this.onClose(() => removePreview?.());
    // On phones, popping up the keyboard straight away would hide the screen.
    if (!view.touchDevice && view.name === '') nameInput.focus();

    return {
      busy(text: string): void {
        for (const b of buttons) b.disabled = true;
        status.textContent = text;
        status.hidden = false;
      },
      failed(text: string): void {
        for (const b of buttons) b.disabled = false;
        status.textContent = text;
        status.hidden = false;
        tabs.select('play');
      },
    };
  }

  /**
   * The lobby: the teams (pick yours: team A, auto or team B) and the match settings (the
   * host's controls). Side by side on wide screens, as tabs on phones. The "Lobby: CODE" chip
   * at the top opens the invite popup (QR code, copy code / link / picture).
   */
  showLobby(view: LobbyView, actions: LobbyActions): void {
    const teamsPage = this.lobbyTeams(view, actions);
    const matchPage = this.lobbyMatch(view, actions);
    const tabs = createTabs(
      [
        { id: 'teams', label: `👥 Teams (${view.players.length})`, content: teamsPage },
        { id: 'match', label: '⚙ Match', content: matchPage },
      ],
      'lobby-tabs',
      (id) => {
        this.lobbyTab = id;
      },
      this.lobbyTab,
    );

    const footer = element('div', 'lobby-footer');
    if (view.isHost) {
      const enough = view.players.length >= CONFIG.lobby.minPlayersToStart;
      const start = button(
        enough
          ? '▶ Start'
          : `Start (needs ${CONFIG.lobby.minPlayersToStart} players, or add a bot)`,
        'menu-play',
        actions.start,
      );
      start.disabled = !enough;
      footer.append(start);
    } else {
      footer.append(element('p', 'screen-waiting', 'Waiting for the host to start…'));
    }
    const small = element('div', 'lobby-footer-row');
    small.append(
      button('🎨 Customize', 'screen-button', actions.editLook),
      button('Leave', 'screen-link-button', actions.leave),
    );
    footer.append(small);

    this.show('lobby', this.lobbyHeader(view), tabs.element, footer);
    this.card.classList.add('lobby-card');
    this.invite.update({ code: view.code, link: view.joinLink, qrSvg: view.qrSvg });
  }

  /**
   * "Lobby: CODE" as one big button: it opens the invite popup. With a mouse, hovering it
   * also peeks at the QR code.
   */
  private lobbyHeader(view: LobbyView): HTMLElement {
    const header = element('div', 'lobby-header');
    const chip = button('', 'lobby-chip', () => this.invite.open());
    chip.setAttribute('aria-label', `Lobby ${view.code}: invite players`);
    chip.append(
      element('span', 'lobby-chip-label', 'Lobby:'),
      element('span', 'lobby-chip-code', view.code),
      element('span', 'lobby-chip-hint', '📱 Invite'),
    );
    if (view.qrSvg) {
      const peek = element('span', 'lobby-chip-peek');
      peek.setAttribute('aria-hidden', 'true');
      // Our own SVG (from qrCodeSvg), never anything a player typed.
      peek.innerHTML = view.qrSvg;
      chip.append(peek);
    }
    header.append(chip);
    return header;
  }

  /** Three columns (team A · auto · team B) of players, and your own pick buttons. */
  private lobbyTeams(view: LobbyView, actions: LobbyActions): HTMLElement {
    const page = element('div', 'lobby-teams');
    const me = view.players.find((p) => p.me);
    const picker = element('div', 'team-picker');
    const sides: [number, string][] = [
      [0, teamName(0)],
      [AUTO_TEAM, 'Auto'],
      [1, teamName(1)],
    ];
    for (const [pick, label] of sides) {
      const chosen = me?.pick === pick;
      const b = button(label, `team-pick${chosen ? ' chosen' : ''}`, () => actions.pickTeam(pick));
      b.setAttribute('aria-pressed', String(chosen));
      if (pick === 0 || pick === 1) {
        b.style.background = cssColor(TEAM_COLORS[pick]);
        b.style.color = textOnTeam(pick);
      }
      picker.append(b);
    }
    const columns = element('div', 'team-columns');
    for (const [pick, label] of sides) {
      const column = element('div', `team-column${pick === AUTO_TEAM ? ' auto' : ''}`);
      if (pick === 0 || pick === 1) column.style.setProperty('--team', cssColor(TEAM_COLORS[pick]));
      const members = view.players.filter((p) => p.pick === pick);
      column.append(element('h3', undefined, `${label} · ${members.length}`));
      const list = element('ul', 'screen-players');
      for (const player of members) list.append(this.playerRow(player, view, actions));
      column.append(list);
      columns.append(column);
    }
    page.append(
      element('p', 'menu-heading', 'Pick your team'),
      picker,
      columns,
      element(
        'p',
        'lobby-hint',
        'Teams stay even: Auto players (and bots) fill the gaps at Start.',
      ),
    );
    return page;
  }

  private playerRow(player: LobbyPlayer, view: LobbyView, actions: LobbyActions): HTMLLIElement {
    const row = element('li', player.me ? 'me' : undefined);
    row.append(element('span', 'screen-player-name', player.name));
    if (player.bot) row.append(element('span', 'screen-tag screen-tag-bot', '🤖'));
    if (player.host) row.append(element('span', 'screen-tag', '👑'));
    if (player.me) row.append(element('span', 'screen-tag', 'you'));
    if (view.isHost && !player.me) {
      const kick = button('✕', 'screen-kick', () => actions.kick(player.id));
      kick.title = `Remove ${player.name}`;
      kick.setAttribute('aria-label', `Remove ${player.name}`);
      row.append(kick);
    }
    return row;
  }

  /** The host's match settings, or a summary of them for everyone else. */
  private lobbyMatch(view: LobbyView, actions: LobbyActions): HTMLElement {
    const page = element('div', 'lobby-match');
    if (!view.isHost) {
      page.append(
        this.colorPicker(view, null),
        element(
          'p',
          'lobby-summary',
          `${GAME_MODE_NAMES[view.gameMode]} · ${MAP_CHOICE_NAMES[view.mapChoice]} · ` +
            `${view.matchMinutes} min · first to ${view.capturesToWin} rounds`,
        ),
      );
      return page;
    }
    page.append(
      select<GameMode>(
        'Game mode',
        view.gameMode,
        GAME_MODES.map((mode): [GameMode, string] => [mode, GAME_MODE_NAMES[mode]]),
        actions.setGameMode,
      ),
      select<MapChoice>(
        'Map',
        view.mapChoice,
        MAP_CHOICES.map((choice): [MapChoice, string] => [choice, MAP_CHOICE_NAMES[choice]]),
        actions.setMap,
      ),
      this.colorPicker(view, actions),
      select<number>(
        'Match length',
        view.matchMinutes,
        CONFIG.lobby.matchMinuteOptions.map((m): [number, string] => [m, `${m} minutes`]),
        actions.setMinutes,
      ),
      select<number>(
        'Rounds to win',
        view.capturesToWin,
        CONFIG.lobby.captureGoalOptions.map((n): [number, string] => [n, `First to ${n} rounds`]),
        actions.setCaptureGoal,
      ),
      this.botStepper(view, actions),
    );
    return page;
  }

  /**
   * The team colors: one button per pair (two swatches and the names) for the host, or just
   * the chosen pair for everyone else (`actions` null).
   */
  private colorPicker(view: LobbyView, actions: LobbyActions | null): HTMLElement {
    const row = element('div', 'screen-colors');
    TEAM_PALETTES.forEach((palette, index) => {
      const chosen = index === view.teamColors;
      if (!actions && !chosen) return;
      const pick = button('', `screen-color-pair${chosen ? ' chosen' : ''}`, () =>
        actions?.setTeamColors(index),
      );
      pick.disabled = !actions;
      pick.setAttribute('aria-pressed', String(chosen));
      for (const team of palette.teams) {
        const swatch = element('span', 'screen-swatch');
        swatch.style.background = cssColor(team.color);
        pick.append(swatch);
      }
      pick.append(element('span', 'screen-color-name', palette.name));
      row.append(pick);
    });
    const label = element('div', 'screen-label');
    label.append(element('span', 'screen-label-text', 'Team colors'), row);
    return label;
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
    const label = element('div', 'screen-label');
    label.append(element('span', 'screen-label-text', '🤖 Bots'), row);
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
    const title = view.winner < 0 ? "It's a draw!" : `${teamName(view.winner)} team wins!`;
    const heading = element('h1', 'results-title', title);
    if (view.winner >= 0) heading.style.color = cssColor(teamTextColor(view.winner));
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
    if (kind !== 'lobby') this.invite.close();
    this.card.classList.remove('results-card', 'home-card', 'lobby-card');
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
      column.append(element('h2', undefined, `${teamName(team)} team`));
      const list = element('ul');
      for (const name of names) list.append(element('li', undefined, name));
      column.append(list);
      columns.append(column);
    });
    this.root.replaceChildren(columns, element('p', 'banner-sub', `Starting in ${secondsLeft}…`));
  }

  /** 3 · 2 · 1, with which stage this is, what it's played as, and on which map. */
  showCountdown(secondsLeft: number, stage: number, mode: StageMode, theme: MapTheme): void {
    if (this.update(`count|${secondsLeft}|${stage}|${mode}|${theme}`)) {
      const title = `Round ${stage} · ${STAGE_MODE_NAMES[mode]} · ${MAP_CHOICE_NAMES[theme]}`;
      this.root.replaceChildren(
        element('p', 'banner-sub banner-stage', title),
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
    const title = winner < 0 ? "It's a draw!" : `${teamName(winner)} team wins!`;
    const big = element('p', 'banner-big banner-end', title);
    if (winner >= 0) big.style.color = cssColor(teamTextColor(winner));
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
    const name = teamName(team);
    const title = mode === 'koth' ? `${name} takes the hill!` : `${name} scores!`;
    const big = element('p', 'banner-big banner-end', title);
    big.style.color = cssColor(teamTextColor(team));
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
    document.body.classList.remove('banner-up');
  }

  /** Only rebuild when the content actually changes (this is called every frame). */
  private update(key: string): boolean {
    if (key === this.shown) return false;
    clearTimeout(this.hideTimer);
    this.shown = key;
    this.root.hidden = false;
    // Lets the pause menu make room for the banner (see body.banner-up in the CSS).
    document.body.classList.add('banner-up');
    return true;
  }
}
