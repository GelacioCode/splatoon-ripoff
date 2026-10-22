import { CONFIG } from '@paint-rush/shared';

/** The role cards, lightest to heaviest. `weapon` is the index in WEAPON_KINDS. */
const ROLES = [
  { weapon: 1, name: 'Sniper', about: 'Long range · fastest on foot', kind: 'sniper' },
  { weapon: 0, name: 'Assault', about: 'All-rounder', kind: 'assault' },
  { weapon: 2, name: 'Machine gun', about: 'Close range · slowest', kind: 'machineGun' },
] as const;

/**
 * Three cards to pick a role (Sniper / Assault / Machine gun), with the current one
 * highlighted. `onPick` runs only when a different role is chosen.
 */
export function createRoleCards(selected: number, onPick: (weapon: number) => void) {
  const element = document.createElement('div');
  element.className = 'menu-roles';
  element.setAttribute('role', 'radiogroup');
  element.setAttribute('aria-label', 'Role');
  element.innerHTML = ROLES.map(
    (r) => `
      <button class="menu-role" type="button" role="radio" data-weapon="${r.weapon}">
        <strong>${r.name}</strong>
        <span class="menu-role-shots">${CONFIG.weapons[r.kind].magazine} shots</span>
        <span>${r.about}</span>
      </button>`,
  ).join('');

  const buttons = [...element.querySelectorAll<HTMLButtonElement>('.menu-role')];
  let current = selected;
  const show = () => {
    for (const button of buttons) {
      const on = Number(button.dataset.weapon) === current;
      button.classList.toggle('selected', on);
      button.setAttribute('aria-checked', String(on));
    }
  };
  show();
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const weapon = Number(button.dataset.weapon);
      if (weapon === current) return;
      current = weapon;
      show();
      onPick(weapon);
    });
  }

  return {
    element,
    /** Shows another role as selected (e.g. picked elsewhere), without calling `onPick`. */
    select(weapon: number): void {
      current = weapon;
      show();
    },
  };
}
