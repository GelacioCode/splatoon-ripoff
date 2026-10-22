const RING_RADIUS = 26;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Crosshair with an ink gauge ring around it (the ring empties as you shoot). */
export function createHud() {
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.innerHTML = `
    <svg class="ink-ring" viewBox="0 0 64 64" aria-hidden="true">
      <circle class="ink-track" cx="32" cy="32" r="${RING_RADIUS}" />
      <circle class="ink-fill" cx="32" cy="32" r="${RING_RADIUS}"
        stroke-dasharray="${RING_LENGTH}" stroke-dashoffset="0" />
    </svg>
    <div class="crosshair"></div>`;
  document.body.appendChild(hud);
  const fill = hud.querySelector<SVGCircleElement>('.ink-fill');

  return {
    /** `ink` from 0 (empty) to 1 (full). `low` makes the ring flash. */
    update(ink: number, color: string, low: boolean): void {
      if (!fill) return;
      fill.style.strokeDashoffset = String(RING_LENGTH * (1 - Math.max(0, Math.min(1, ink))));
      fill.style.stroke = color;
      hud.classList.toggle('ink-low', low);
    },
  };
}
