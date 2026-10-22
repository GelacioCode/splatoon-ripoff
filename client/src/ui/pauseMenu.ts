import { CONFIG } from '@paint-rush/shared';
import type { Quality, Settings } from '../settings';

export interface PauseMenuActions {
  play: () => void;
  /** Called whenever a setting changes (already applied to the settings object). */
  settingsChanged: (settings: Settings, changed: keyof Settings) => void;
  /** Gyro was switched on; resolves to whether it actually works here. */
  enableGyro: () => Promise<boolean>;
  openTuning: () => void;
}

/** The role cards, lightest to heaviest. `weapon` is the index in WEAPON_KINDS. */
const ROLES = [
  { weapon: 1, name: 'Sniper', about: 'Long range · fastest on foot', kind: 'sniper' },
  { weapon: 0, name: 'Assault', about: 'All-rounder', kind: 'assault' },
  { weapon: 2, name: 'Machine gun', about: 'Close range · slowest', kind: 'machineGun' },
] as const;

const DESKTOP_KEYS =
  'WASD move · Mouse look · Click shoot · Right-click aim · R reload · Shift swim · Space jump · Esc pause · ` tuning';
const TOUCH_KEYS =
  'Left thumb: move · Right thumb: drag to aim · SHOOT (drag it to aim too) · AIM (zoom) · SWIM · JUMP · R reload';

/**
 * The start/pause screen: a big Play button plus the settings, which save automatically.
 * Shown at launch and whenever the game is paused (Esc on desktop, the II button on touch).
 */
export function createPauseMenu(
  settings: Settings,
  touchDevice: boolean,
  actions: PauseMenuActions,
) {
  const menu = document.createElement('div');
  menu.className = 'pause-menu';
  menu.innerHTML = `
    <div class="menu-card">
      <h1>Paint Rush</h1>
      <p class="menu-heading">Choose your role</p>
      <div class="menu-roles" role="radiogroup" aria-label="Role">
        ${ROLES.map(
          (r) => `
          <button class="menu-role" type="button" role="radio" data-weapon="${r.weapon}">
            <strong>${r.name}</strong>
            <span class="menu-role-shots">${CONFIG.weapons[r.kind].magazine} shots</span>
            <span>${r.about}</span>
          </button>`,
        ).join('')}
      </div>
      <button class="menu-play" type="button">${touchDevice ? 'Tap to play' : 'Click to play'}</button>
      <p class="menu-keys">${touchDevice ? TOUCH_KEYS : DESKTOP_KEYS}</p>
      <div class="menu-settings">
        <label>${touchDevice ? 'Touch' : 'Mouse'} sensitivity
          <input name="sensitivity" type="range" min="0.2" max="3" step="0.05" />
        </label>
        <label class="menu-check"><input name="invertY" type="checkbox" /> Invert up/down</label>
        <label>Volume <input name="volume" type="range" min="0" max="1" step="0.05" /></label>
        <label>Graphics quality (reloads the page)
          <select name="quality">
            <option value="auto">Auto</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label class="menu-check menu-gyro"><input name="gyro" type="checkbox" /> Gyro aim (turn the phone)</label>
        <label class="menu-gyro">Gyro sensitivity
          <input name="gyroSensitivity" type="range" min="0.2" max="3" step="0.05" />
        </label>
        <p class="menu-note" hidden></p>
      </div>
      <button class="menu-tuning" type="button">Tuning panel (dev)</button>
    </div>`;
  document.body.appendChild(menu);

  const field = <T extends HTMLElement>(name: string) => {
    const element = menu.querySelector<T>(`[name="${name}"]`);
    if (!element) throw new Error(`Pause menu: missing ${name}`);
    return element;
  };
  const sensitivity = field<HTMLInputElement>('sensitivity');
  const invertY = field<HTMLInputElement>('invertY');
  const volume = field<HTMLInputElement>('volume');
  const quality = field<HTMLSelectElement>('quality');
  const gyro = field<HTMLInputElement>('gyro');
  const gyroSensitivity = field<HTMLInputElement>('gyroSensitivity');
  const note = menu.querySelector<HTMLParagraphElement>('.menu-note');

  const sensitivityKey = touchDevice ? 'touchSensitivity' : 'mouseSensitivity';
  sensitivity.value = String(settings[sensitivityKey]);
  invertY.checked = settings.invertY;
  volume.value = String(settings.volume);
  quality.value = settings.quality;
  gyro.checked = settings.gyro;
  gyroSensitivity.value = String(settings.gyroSensitivity);
  for (const element of menu.querySelectorAll<HTMLElement>('.menu-gyro')) {
    element.hidden = !touchDevice;
  }

  const roleButtons = [...menu.querySelectorAll<HTMLButtonElement>('.menu-role')];
  const showRole = () => {
    for (const button of roleButtons) {
      const selected = Number(button.dataset.weapon) === settings.weapon;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', String(selected));
    }
  };
  showRole();
  for (const button of roleButtons) {
    button.addEventListener('click', () => {
      const weapon = Number(button.dataset.weapon);
      if (weapon === settings.weapon) return;
      settings.weapon = weapon;
      showRole();
      actions.settingsChanged(settings, 'weapon');
    });
  }

  const showNote = (text: string) => {
    if (!note) return;
    note.textContent = text;
    note.hidden = text === '';
  };

  sensitivity.addEventListener('input', () => {
    settings[sensitivityKey] = Number(sensitivity.value);
    actions.settingsChanged(settings, sensitivityKey);
  });
  invertY.addEventListener('change', () => {
    settings.invertY = invertY.checked;
    actions.settingsChanged(settings, 'invertY');
  });
  volume.addEventListener('input', () => {
    settings.volume = Number(volume.value);
    actions.settingsChanged(settings, 'volume');
  });
  quality.addEventListener('change', () => {
    settings.quality = quality.value as Quality;
    actions.settingsChanged(settings, 'quality');
  });
  gyroSensitivity.addEventListener('input', () => {
    settings.gyroSensitivity = Number(gyroSensitivity.value);
    actions.settingsChanged(settings, 'gyroSensitivity');
  });
  gyro.addEventListener('change', () => {
    if (!gyro.checked) {
      settings.gyro = false;
      showNote('');
      actions.settingsChanged(settings, 'gyro');
      return;
    }
    actions
      .enableGyro()
      .then((works) => {
        settings.gyro = works;
        gyro.checked = works;
        showNote(works ? '' : 'Gyro needs an https:// page and motion permission on this device.');
        actions.settingsChanged(settings, 'gyro');
      })
      .catch(() => {
        gyro.checked = false;
        showNote('Gyro is not available here.');
      });
  });

  menu.querySelector('.menu-play')?.addEventListener('click', actions.play);
  menu.querySelector('.menu-tuning')?.addEventListener('click', actions.openTuning);

  return {
    setVisible(visible: boolean): void {
      menu.hidden = !visible;
    },
  };
}
