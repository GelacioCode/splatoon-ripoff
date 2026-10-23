import { LOOK_OPTIONS, LOOK_PARTS, randomLook, type Look, type LookPart } from '@paint-rush/shared';

const PART_NAMES: Record<LookPart, string> = {
  eyes: 'Eyes',
  hat: 'Hat',
  goggles: 'Goggles',
  shoes: 'Shoes',
  body: 'Body',
};

function arrow(label: string, name: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'look-arrow';
  button.textContent = label;
  button.setAttribute('aria-label', name);
  button.addEventListener('click', onClick);
  return button;
}

/**
 * One row per part (◀ Crown ▶) plus a Random button. `onChange` gets a new Look object
 * every time something changes.
 */
export function createLookPicker(initial: Look, onChange: (look: Look) => void): HTMLElement {
  let look: Look = { ...initial };
  const root = document.createElement('div');
  root.className = 'look-picker';
  const values = new Map<LookPart, HTMLSpanElement>();

  const show = () => {
    for (const part of LOOK_PARTS) {
      const value = values.get(part);
      if (value) value.textContent = LOOK_OPTIONS[part][look[part]];
    }
  };
  const change = (next: Look) => {
    look = next;
    show();
    onChange({ ...look });
  };

  for (const part of LOOK_PARTS) {
    const count = LOOK_OPTIONS[part].length;
    const step = (by: number) => change({ ...look, [part]: (look[part] + by + count) % count });
    const row = document.createElement('div');
    row.className = 'look-row';
    const label = document.createElement('span');
    label.className = 'look-label';
    label.textContent = PART_NAMES[part];
    const value = document.createElement('span');
    value.className = 'look-value';
    values.set(part, value);
    row.append(
      label,
      arrow('◀', `Previous ${PART_NAMES[part].toLowerCase()}`, () => step(-1)),
      value,
      arrow('▶', `Next ${PART_NAMES[part].toLowerCase()}`, () => step(1)),
    );
    root.append(row);
  }

  const random = document.createElement('button');
  random.type = 'button';
  random.className = 'screen-link-button';
  random.textContent = '🎲 Random look';
  random.addEventListener('click', () => change(randomLook(Math.random)));
  root.append(random);
  show();
  return root;
}
