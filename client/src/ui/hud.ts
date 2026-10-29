/** What the bottom bar shows each frame. */
export interface HudStatus {
  /** Shots left, and a full tank. */
  ammo: number;
  magazine: number;
  /** Reload progress (0–1), or null when not reloading. */
  reload: number | null;
  hp: number;
  maxHp: number;
  /** Health is coming back (calm, or swimming in own paint). */
  recovering: boolean;
  /** Your team's color (CSS). */
  color: string;
  /** "Assault", "Sniper", "Machine gun". */
  role: string;
  /** Bombs left and the most you can carry, and whether one is in hand (key 2). */
  bombs: number;
  maxBombs: number;
  bombInHand: boolean;
}

/** Below this share of health the number turns red and pulses. */
const LOW_HP = 0.35;
/** Below this share of the tank the ammo turns red. */
const LOW_AMMO = 0.2;

/**
 * The in-match HUD: the crosshair and hit marker in the middle, the sniper's scope, and a
 * bottom bar with health on the left and ammo on the right (like a tactical shooter, in the
 * game's own cartoon style). Shown only while a match is on screen.
 */
export function createHud(touch: boolean) {
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.innerHTML = `
    <div class="crosshair"></div>
    <div class="hit-marker"></div>
    <div class="reload-label">RELOADING</div>`;
  const hitMarker = hud.querySelector<HTMLDivElement>('.hit-marker');

  // The sniper's scope: a dark ring with a fine reticle, faded in while scoped.
  const scope = document.createElement('div');
  scope.className = 'scope';
  scope.innerHTML = `<div class="scope-reticle"></div>`;

  // The assault's 2× sight: a big lens with a chunky rim and a glowing dot, the view around it
  // dimmed but still visible (over the shoulder, not first person).
  const optic = document.createElement('div');
  optic.className = 'optic';
  optic.innerHTML = `<div class="optic-lens"><div class="optic-dot"></div></div>`;

  // Bottom bar: health (left) and ammo (right).
  const bar = document.createElement('div');
  bar.className = `hud-bar${touch ? ' touch' : ''}`;
  bar.innerHTML = `
    <div class="hud-health">
      <span class="hud-health-icon" aria-hidden="true">✚</span>
      <span class="hud-health-value">100</span>
      <div class="hud-meter"><div class="hud-meter-fill"></div></div>
    </div>
    <div class="hud-ammo">
      <div class="hud-ammo-numbers">
        <span class="hud-ammo-value">20</span><span class="hud-ammo-max">/ 20</span>
      </div>
      <div class="hud-ammo-role"></div>
      <div class="hud-meter"><div class="hud-meter-fill"></div></div>
    </div>
    <div class="hud-bombs" aria-label="Bombs"></div>`;
  const bombsBox = bar.querySelector<HTMLDivElement>('.hud-bombs');
  const healthValue = bar.querySelector<HTMLSpanElement>('.hud-health-value');
  const healthBox = bar.querySelector<HTMLDivElement>('.hud-health');
  const healthFill = bar.querySelector<HTMLDivElement>('.hud-health .hud-meter-fill');
  const ammoBox = bar.querySelector<HTMLDivElement>('.hud-ammo');
  const ammoValue = bar.querySelector<HTMLSpanElement>('.hud-ammo-value');
  const ammoMax = bar.querySelector<HTMLSpanElement>('.hud-ammo-max');
  const ammoRole = bar.querySelector<HTMLDivElement>('.hud-ammo-role');
  const ammoFill = bar.querySelector<HTMLDivElement>('.hud-ammo .hud-meter-fill');

  // Screen edges tint toward the enemy's color as health drops.
  const vignette = document.createElement('div');
  vignette.className = 'damage-vignette';

  // A quick red flash when a shot hits you.
  const flash = document.createElement('div');
  flash.className = 'hurt-flash';

  document.body.append(scope, optic, vignette, flash, hud, bar);
  let shown = '';

  /** Restarts a CSS animation by toggling its class. */
  const replay = (element: HTMLElement | null, className: string) => {
    if (!element) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  };

  return {
    /** Only while a match (or the sandbox) is being played. */
    setVisible(visible: boolean): void {
      hud.hidden = !visible;
      bar.hidden = !visible;
      if (!visible) {
        scope.style.opacity = '0';
        optic.style.opacity = '0';
      }
    },
    /** Your shot hit someone (bigger and red when it splatted them). */
    showHit(splat: boolean): void {
      hitMarker?.classList.toggle('splat', splat);
      replay(hitMarker, 'show');
    },
    /** You were hit by a shot. */
    flashHurt(): void {
      replay(flash, 'show');
      replay(healthBox, 'hit');
    },
    /** Aim mode tightens the crosshair. */
    setAiming(aiming: boolean): void {
      hud.classList.toggle('aiming', aiming);
    },
    /**
     * How far into the sniper's scope view (`scopeBlend`) or the assault's 2× sight
     * (`opticBlend`) we are, each 0 none … 1 fully in. Either one replaces the crosshair.
     */
    setSights(scopeBlend: number, opticBlend: number): void {
      const scopeOpacity = scopeBlend < 0.5 ? 0 : Math.min(1, (scopeBlend - 0.5) * 2.5);
      scope.style.opacity = String(scopeOpacity);
      // The lens grows into place as the zoom comes in.
      const opticOpacity = Math.min(1, opticBlend * 1.6);
      optic.style.opacity = String(opticOpacity);
      optic.style.setProperty('--grow', String(0.82 + 0.18 * opticBlend));
      hud.classList.toggle('scoped', scopeOpacity > 0.5 || opticOpacity > 0.6);
    },
    /** `health` from 0 to 1; `enemyColor` tints the edges while hurt. */
    updateHealth(health: number, enemyColor: string): void {
      vignette.style.opacity = String(Math.min(1, (1 - health) * 1.6));
      vignette.style.setProperty('--damage-color', enemyColor);
    },
    /** The bottom bar's health and ammo, and the reload label. */
    update(s: HudStatus): void {
      const hp = Math.ceil(Math.max(0, s.hp));
      const ammo = Math.floor(Math.max(0, s.ammo));
      const key = `${hp}|${s.maxHp}|${s.recovering}|${ammo}|${s.magazine}|${s.reload?.toFixed(2)}|${s.color}|${s.role}|${s.bombs}|${s.bombInHand}`;
      if (key === shown) return;
      shown = key;
      // Bombs: one icon per bomb you can carry (empty ones faded), with the key to press.
      if (bombsBox) {
        bombsBox.replaceChildren();
        for (let i = 0; i < s.maxBombs; i++) {
          const icon = document.createElement('span');
          icon.className = `hud-bomb${i < s.bombs ? '' : ' used'}`;
          icon.textContent = '💣';
          bombsBox.append(icon);
        }
        const hint = document.createElement('span');
        hint.className = 'hud-bomb-key';
        hint.textContent = s.bombInHand ? '1 weapon' : '2 bomb';
        if (!touch) bombsBox.append(hint);
        bombsBox.classList.toggle('in-hand', s.bombInHand);
      }
      hud.classList.toggle('bomb-in-hand', s.bombInHand);
      const hpShare = s.maxHp > 0 ? hp / s.maxHp : 0;
      if (healthValue) healthValue.textContent = String(hp);
      if (healthFill) healthFill.style.width = `${hpShare * 100}%`;
      healthBox?.classList.toggle('low', hpShare < LOW_HP);
      healthBox?.classList.toggle('recovering', s.recovering && hp < s.maxHp);

      const reloading = s.reload !== null;
      if (ammoValue) ammoValue.textContent = reloading ? '—' : String(ammo);
      if (ammoMax) ammoMax.textContent = `/ ${s.magazine}`;
      if (ammoRole) ammoRole.textContent = reloading ? 'RELOADING' : s.role;
      if (ammoFill) {
        ammoFill.style.width = `${(reloading ? (s.reload ?? 0) : ammo / s.magazine) * 100}%`;
        ammoFill.style.background = s.color;
      }
      ammoBox?.classList.toggle('reloading', reloading);
      ammoBox?.classList.toggle('low', !reloading && ammo / s.magazine < LOW_AMMO);
      hud.classList.toggle('reloading', reloading);
    },
  };
}
