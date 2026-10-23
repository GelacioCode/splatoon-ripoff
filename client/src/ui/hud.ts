const RING_RADIUS = 26;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * Crosshair with an ink gauge ring around it. The ring empties as you shoot; while
 * reloading it fills back up and a "RELOADING" label appears.
 */
export function createHud() {
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.innerHTML = `
    <svg class="ink-ring" viewBox="0 0 64 64" aria-hidden="true">
      <circle class="ink-track" cx="32" cy="32" r="${RING_RADIUS}" />
      <circle class="ink-fill" cx="32" cy="32" r="${RING_RADIUS}"
        stroke-dasharray="${RING_LENGTH}" stroke-dashoffset="0" />
    </svg>
    <div class="crosshair"></div>
    <div class="hit-marker"></div>
    <div class="reload-label">RELOADING</div>`;
  document.body.appendChild(hud);
  const fill = hud.querySelector<SVGCircleElement>('.ink-fill');
  const hitMarker = hud.querySelector<HTMLDivElement>('.hit-marker');

  // Screen edges tint toward the enemy's color as health drops.
  const vignette = document.createElement('div');
  vignette.className = 'damage-vignette';
  document.body.appendChild(vignette);

  // A quick red flash when a shot hits you.
  const flash = document.createElement('div');
  flash.className = 'hurt-flash';
  document.body.appendChild(flash);

  // "Splatted by …" while waiting to respawn.
  const splatted = document.createElement('div');
  splatted.className = 'splatted';
  splatted.hidden = true;
  document.body.appendChild(splatted);
  let splattedText = '';

  /** Restarts a CSS animation by toggling its class. */
  const replay = (element: HTMLElement | null, className: string) => {
    if (!element) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  };

  return {
    /** Your shot hit someone (bigger and red when it splatted them). */
    showHit(splat: boolean): void {
      hitMarker?.classList.toggle('splat', splat);
      replay(hitMarker, 'show');
    },
    /** You were hit by a shot. */
    flashHurt(): void {
      replay(flash, 'show');
    },
    /** Shows "Splatted by NAME · back in N" (or hides it with null). */
    setSplatted(text: string | null): void {
      if ((text ?? '') === splattedText) return;
      splattedText = text ?? '';
      splatted.hidden = text === null;
      splatted.textContent = splattedText;
    },
    /** Aim mode tightens the crosshair. */
    setAiming(aiming: boolean): void {
      hud.classList.toggle('aiming', aiming);
    },
    /** `health` from 0 to 1; `enemyColor` tints the edges while hurt. */
    updateHealth(health: number, enemyColor: string): void {
      vignette.style.opacity = String(Math.min(1, (1 - health) * 1.6));
      vignette.style.setProperty('--damage-color', enemyColor);
    },

    /**
     * `ink` from 0 (empty) to 1 (full). `reload` is the reload progress (0–1), or null when
     * not reloading. `low` makes the ring flash.
     */
    update(ink: number, reload: number | null, color: string, low: boolean): void {
      if (!fill) return;
      const amount = reload ?? ink;
      fill.style.strokeDashoffset = String(RING_LENGTH * (1 - Math.max(0, Math.min(1, amount))));
      fill.style.stroke = color;
      hud.classList.toggle('reloading', reload !== null);
      hud.classList.toggle('ink-low', reload === null && low);
    },
  };
}
