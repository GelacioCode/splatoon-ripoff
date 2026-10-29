import type { Settings } from '../settings';
import { createHowToPlay } from './howToPlay';
import { createRoleCards } from './roleCards';
import { createSettingsPanel } from './settingsPanel';
import { createTabs } from './tabs';

export interface PauseMenuActions {
  play: () => void;
  /** Called whenever a setting changes (already applied to the settings object). */
  settingsChanged: (settings: Settings, changed: keyof Settings) => void;
  /** Gyro was switched on; resolves to whether it actually works here. */
  enableGyro: () => Promise<boolean>;
  testVoice: () => void;
  openTuning: () => void;
}

/** What the pause menu can do in an online match (nothing of this in the offline sandbox). */
export interface MatchMenuActions {
  /** The other team's name, if switching to it is allowed right now (else null). */
  switchTarget: () => string | null;
  switchTeam: () => void;
  leave: () => void;
}

/** How often the "Switch team" button rechecks whether it's allowed (ms). */
const REFRESH_MS = 500;

/**
 * The pause menu, in three tabs: Play (resume, your role, switch team, leave), Settings and
 * How to play. Shown before playing and whenever the game is paused (Esc on desktop, the II
 * button on touch).
 */
export function createPauseMenu(
  settings: Settings,
  touchDevice: boolean,
  actions: PauseMenuActions,
) {
  const menu = document.createElement('div');
  menu.className = 'pause-menu';
  const card = document.createElement('div');
  card.className = 'menu-card pause-card';
  const title = document.createElement('h1');
  title.textContent = 'Paint Rush';

  // --- Play tab
  const playPage = document.createElement('div');
  playPage.className = 'pause-play';
  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'menu-play';
  play.textContent = touchDevice ? '▶ Tap to play' : '▶ Click to play';
  play.addEventListener('click', actions.play);
  const roleHeading = document.createElement('p');
  roleHeading.className = 'menu-heading';
  roleHeading.textContent = 'Your role';
  const roles = createRoleCards(settings.weapon, (weapon) => {
    settings.weapon = weapon;
    actions.settingsChanged(settings, 'weapon');
  });
  const matchRow = document.createElement('div');
  matchRow.className = 'pause-match';
  const switchTeam = document.createElement('button');
  switchTeam.type = 'button';
  switchTeam.className = 'screen-button';
  const leave = document.createElement('button');
  leave.type = 'button';
  leave.className = 'screen-button screen-button-quiet';
  leave.textContent = '🚪 Leave match';
  matchRow.append(switchTeam, leave);
  matchRow.hidden = true;
  const tuning = document.createElement('button');
  tuning.type = 'button';
  tuning.className = 'menu-tuning';
  tuning.textContent = 'Tuning panel (dev)';
  tuning.hidden = !import.meta.env.DEV;
  tuning.addEventListener('click', actions.openTuning);
  playPage.append(play, roleHeading, roles.element, matchRow, tuning);

  const settingsPage = createSettingsPanel(settings, touchDevice, {
    changed: (changed) => actions.settingsChanged(settings, changed),
    enableGyro: actions.enableGyro,
    testVoice: actions.testVoice,
  });
  const tabs = createTabs(
    [
      { id: 'play', label: '▶ Play', content: playPage },
      { id: 'settings', label: '⚙ Settings', content: settingsPage },
      { id: 'how', label: '❓ How to play', content: createHowToPlay(touchDevice) },
    ],
    'pause-tabs',
  );
  card.append(title, tabs.element);
  menu.append(card);
  document.body.appendChild(menu);

  let match: MatchMenuActions | null = null;
  let refresh: ReturnType<typeof setInterval> | undefined;
  const updateMatch = () => {
    matchRow.hidden = match === null;
    if (!match) return;
    const target = match.switchTarget();
    switchTeam.disabled = target === null;
    switchTeam.textContent = target
      ? `🔁 Switch to ${target}`
      : '🔁 Switch team (their team is bigger)';
  };
  switchTeam.addEventListener('click', () => {
    if (!match?.switchTarget()) return;
    match.switchTeam();
    actions.play();
  });
  leave.addEventListener('click', () => match?.leave());

  return {
    setVisible(visible: boolean): void {
      menu.hidden = !visible;
      clearInterval(refresh);
      if (!visible) return;
      // The role may have been picked on another screen meanwhile.
      roles.select(settings.weapon);
      tabs.select('play');
      updateMatch();
      refresh = setInterval(updateMatch, REFRESH_MS);
    },
    /** Online match buttons (switch team, leave), or null to remove them. */
    setMatchActions(actions: MatchMenuActions | null): void {
      match = actions;
      updateMatch();
    },
  };
}
