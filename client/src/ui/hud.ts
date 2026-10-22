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
    <div class="reload-label">RELOADING</div>`;
  document.body.appendChild(hud);
  const fill = hud.querySelector<SVGCircleElement>('.ink-fill');

  return {
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
