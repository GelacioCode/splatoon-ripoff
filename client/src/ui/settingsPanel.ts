import type { ControlsSetting } from '../input/controlsMode';
import type { Quality, Settings } from '../settings';
import { createTabs } from './tabs';

export interface SettingsPanelActions {
  /** A setting changed (already applied to the settings object). */
  changed: (changed: keyof Settings) => void;
  /** Gyro was switched on; resolves to whether it actually works here. */
  enableGyro: () => Promise<boolean>;
  /** Plays the announcer voice once, to hear the volume. */
  testVoice: () => void;
}

/** A labelled slider from 0 to 100 % for a 0–1 setting. */
function slider(label: string, value: number, min: number, max: number, step: number) {
  const wrap = document.createElement('label');
  wrap.className = 'set-row';
  const name = document.createElement('span');
  name.className = 'set-name';
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  wrap.append(name, input);
  return { wrap, input };
}

function toggle(label: string, checked: boolean) {
  const wrap = document.createElement('label');
  wrap.className = 'set-row set-toggle';
  const name = document.createElement('span');
  name.className = 'set-name';
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  const knob = document.createElement('span');
  knob.className = 'set-switch';
  wrap.append(name, input, knob);
  return { wrap, input };
}

function choice<T extends string>(label: string, value: T, options: [T, string][]) {
  const wrap = document.createElement('label');
  wrap.className = 'set-row';
  const name = document.createElement('span');
  name.className = 'set-name';
  name.textContent = label;
  const select = document.createElement('select');
  for (const [option, text] of options) {
    const el = document.createElement('option');
    el.value = option;
    el.textContent = text;
    el.selected = option === value;
    select.append(el);
  }
  wrap.append(name, select);
  return { wrap, select };
}

function note(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'set-note';
  p.textContent = text;
  return p;
}

/**
 * The settings, in three short tabs: Graphics, Audio and Controls. Every change applies and
 * saves at once. Used on the start screen and in the pause menu.
 */
export function createSettingsPanel(
  settings: Settings,
  touchDevice: boolean,
  actions: SettingsPanelActions,
): HTMLElement {
  // --- Graphics
  const graphics = document.createElement('div');
  graphics.className = 'set-page';
  const quality = choice<Quality>('Quality', settings.quality, [
    ['auto', 'Auto (recommended)'],
    ['low', 'Low (fastest)'],
    ['medium', 'Medium'],
    ['high', 'High (prettiest)'],
  ]);
  quality.select.addEventListener('change', () => {
    settings.quality = quality.select.value as Quality;
    actions.changed('quality');
  });
  const stats = toggle('Show FPS & ping', settings.showStats);
  stats.input.addEventListener('change', () => {
    settings.showStats = stats.input.checked;
    actions.changed('showStats');
  });
  graphics.append(
    quality.wrap,
    note(
      'Changing quality reloads the page. Resolution also lowers by itself when the game slows down.',
    ),
    stats.wrap,
  );

  // --- Audio
  const audio = document.createElement('div');
  audio.className = 'set-page';
  type VolumeKey = 'volume' | 'musicVolume' | 'effectsVolume' | 'announcerVolume';
  const volumes: [VolumeKey, string][] = [
    ['volume', 'Master'],
    ['musicVolume', 'Music'],
    ['effectsVolume', 'Sound effects'],
    ['announcerVolume', 'Announcer voice'],
  ];
  for (const [key, label] of volumes) {
    const row = slider(label, settings[key], 0, 1, 0.05);
    row.input.addEventListener('input', () => {
      settings[key] = Number(row.input.value);
      actions.changed(key);
    });
    audio.append(row.wrap);
  }
  const test = document.createElement('button');
  test.type = 'button';
  test.className = 'set-button';
  test.textContent = '🔊 Test the announcer';
  test.addEventListener('click', actions.testVoice);
  audio.append(test);

  // --- Controls
  const controls = document.createElement('div');
  controls.className = 'set-page';
  const sensitivityKey = touchDevice ? 'touchSensitivity' : 'mouseSensitivity';
  const sensitivity = slider(
    touchDevice ? 'Touch sensitivity' : 'Mouse sensitivity',
    settings[sensitivityKey],
    0.2,
    3,
    0.05,
  );
  sensitivity.input.addEventListener('input', () => {
    settings[sensitivityKey] = Number(sensitivity.input.value);
    actions.changed(sensitivityKey);
  });
  const invert = toggle('Invert up / down', settings.invertY);
  invert.input.addEventListener('change', () => {
    settings.invertY = invert.input.checked;
    actions.changed('invertY');
  });
  const mode = choice<ControlsSetting>('Controls (reloads)', settings.controls, [
    ['auto', 'Auto'],
    ['touch', 'Touch'],
    ['mouse', 'Mouse & keyboard'],
  ]);
  mode.select.addEventListener('change', () => {
    settings.controls = mode.select.value as ControlsSetting;
    actions.changed('controls');
  });
  controls.append(sensitivity.wrap, invert.wrap, mode.wrap);

  if (touchDevice) {
    const gyro = toggle('Gyro aim (turn the phone)', settings.gyro);
    const gyroSensitivity = slider('Gyro sensitivity', settings.gyroSensitivity, 0.2, 3, 0.05);
    const gyroNote = note('');
    gyroNote.hidden = true;
    gyroSensitivity.input.addEventListener('input', () => {
      settings.gyroSensitivity = Number(gyroSensitivity.input.value);
      actions.changed('gyroSensitivity');
    });
    gyro.input.addEventListener('change', () => {
      if (!gyro.input.checked) {
        settings.gyro = false;
        gyroNote.hidden = true;
        actions.changed('gyro');
        return;
      }
      actions
        .enableGyro()
        .then((works) => {
          settings.gyro = works;
          gyro.input.checked = works;
          gyroNote.textContent = works
            ? ''
            : 'Gyro needs an https:// page and motion permission on this device.';
          gyroNote.hidden = works;
          actions.changed('gyro');
        })
        .catch(() => {
          gyro.input.checked = false;
          gyroNote.textContent = 'Gyro is not available here.';
          gyroNote.hidden = false;
        });
    });
    controls.append(gyro.wrap, gyroSensitivity.wrap, gyroNote);
  }

  return createTabs(
    [
      { id: 'graphics', label: '🎨 Graphics', content: graphics },
      { id: 'audio', label: '🎵 Audio', content: audio },
      { id: 'controls', label: '🎮 Controls', content: controls },
    ],
    'set-tabs',
  ).element;
}
