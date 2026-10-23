import type { Controller, GUI } from 'lil-gui';
import { CONFIG, WEAPON_KINDS, type WeaponKind } from '@paint-rush/shared';

export interface TuningActions {
  respawn: () => void;
  clearPaint: () => void;
  switchTeam: () => void;
  refillInk: () => void;
}

const COPY_LABEL = 'Copy tuning';

let panel: GUI | undefined;
let visible = false;
let loading = false;

/** Opens or closes the live tuning panel. lil-gui is only downloaded the first time. */
export function toggleTuningPanel(actions: TuningActions): void {
  if (panel) {
    visible = !visible;
    panel.show(visible);
    return;
  }
  if (loading) return;
  loading = true;
  import('lil-gui')
    .then(({ GUI }) => {
      panel = buildPanel(new GUI({ title: 'Tuning (changes apply live)' }), actions);
      visible = true;
    })
    .catch((error: unknown) => {
      loading = false;
      console.error('Could not load the tuning panel', error);
    });
}

function buildPanel(gui: GUI, actions: TuningActions): GUI {
  const m = CONFIG.movement;
  const movement = gui.addFolder('Movement');
  movement.add(m, 'walkSpeed', 2, 14, 0.1).name('walk speed (m/s)');
  movement.add(m, 'groundAccel', 10, 200, 1).name('acceleration');
  movement.add(m, 'groundDecel', 10, 200, 1).name('braking');
  movement.add(m, 'airControl', 0, 1, 0.05).name('air control');
  movement.add(m, 'gravity', 5, 60, 0.5).name('gravity');
  movement.add(m, 'jumpSpeed', 3, 20, 0.1).name('jump speed');
  movement.add(m, 'coyoteTime', 0, 0.3, 0.01).name('coyote time (s)');
  movement.add(m, 'jumpBuffer', 0, 0.3, 0.01).name('jump buffer (s)');

  const c = CONFIG.camera;
  const camera = gui.addFolder('Camera');
  camera.add(c, 'fov', 50, 100, 1).name('field of view');
  camera.add(c, 'distance', 1.5, 8, 0.1).name('distance');
  camera.add(c, 'shoulderOffset', -1.5, 1.5, 0.05).name('shoulder offset');
  camera.add(c, 'pivotHeight', 0.5, 2.5, 0.05).name('pivot height');
  camera.add(c, 'mouseSensitivity', 0.0005, 0.006, 0.0001).name('mouse sensitivity');
  camera.add(c, 'followSharpness', 2, 40, 1).name('follow sharpness');

  const w = CONFIG.weapon;
  const weapon = gui.addFolder('Weapons (all roles)');
  weapon.add(w, 'projectileGravity', 0, 80, 1).name('shot drop');
  weapon.add(w, 'aimProjectileSpeedMultiplier', 1, 2.5, 0.05).name('aimed shot speed ×');
  weapon.add(w, 'inkPerShot', 0, 10, 0.1).name('ink per shot');
  weapon.add(w, 'autoReloadAfterSeconds', 1, 30, 0.5).name('auto-reload after idle (s)');
  weapon.add(w, 'trailWidth', 0.05, 1, 0.01).name('trail line width, drawn (m)');
  for (const kind of WEAPON_KINDS) addRoleFolder(gui, kind);

  const sw = CONFIG.swim;
  const swim = gui.addFolder('Swim');
  swim.add(sw, 'transformTime', 0, 0.6, 0.01).name('melt time (s)');
  swim.add(sw, 'swimSpeed', 3, 20, 0.1).name('swim speed (m/s)');
  swim.add(sw, 'swimAccel', 10, 200, 1).name('swim acceleration');
  swim.add(sw, 'puddleSpeed', 0.5, 8, 0.1).name('puddle speed off paint');
  swim.add(sw, 'swimJumpSpeed', 3, 20, 0.1).name('jump out of paint');
  swim.add(sw, 'climbSpeed', 1, 15, 0.1).name('wall climb speed');
  swim.add(sw, 'climbTopPop', 0, 12, 0.1).name('pop at wall top');
  swim.add(sw, 'inkRefillRate', 1, 40, 0.5).name('ink refill / s in paint');

  const h = CONFIG.health;
  const health = gui.addFolder('Enemy paint & health');
  health.add(h, 'enemyPaintSpeedMultiplier', 0.1, 1, 0.05).name('speed in enemy paint');
  health.add(h, 'enemyPaintJumpMultiplier', 0.1, 1, 0.05).name('jump in enemy paint');
  health.add(h, 'enemyPaintDamagePerSecond', 0, 60, 1).name('damage / s');
  health.add(h, 'enemyPaintMinHp', 0, 100, 1).name('HP floor');
  health.add(h, 'regenDelay', 0, 5, 0.1).name('regen delay (s)');
  health.add(h, 'regenPerSecond', 0, 100, 1).name('regen / s');
  swim.close();
  health.close();

  const simulation = gui.addFolder('Simulation');
  simulation.add(CONFIG.net, 'tickRate', 10, 120, 1).name('tick rate (Hz)');

  const copyButton: Controller = gui.add({ copy: () => copyTuning(copyButton) }, 'copy');
  copyButton.name(COPY_LABEL);
  gui.add(actions, 'respawn').name('Respawn');
  gui.add(actions, 'clearPaint').name('Clear all paint');
  gui.add(actions, 'switchTeam').name('Switch team');
  gui.add(actions, 'refillInk').name('Refill ink');
  return gui;
}

const ROLE_NAMES: Record<WeaponKind, string> = {
  assault: 'Assault',
  sniper: 'Sniper',
  machineGun: 'Machine gun',
};

/** One folder per role; a magazine change shows after the next reload. */
function addRoleFolder(gui: GUI, kind: WeaponKind): void {
  const r = CONFIG.weapons[kind];
  const role = gui.addFolder(`Role: ${ROLE_NAMES[kind]}`);
  role.add(r, 'magazine', 1, 100, 1).name('shots per reload');
  role.add(r, 'reloadSeconds', 0.2, 6, 0.1).name('reload time (s)');
  role.add(r, 'fireInterval', 0.04, 1.5, 0.005).name('seconds between shots');
  role.add(r, 'moveSpeedMultiplier', 0.5, 1.5, 0.05).name('walk speed ×');
  // The server decides damage from its own config.ts; copy the value there to keep it.
  role.add(r, 'damage', 1, 100, 1).name('damage per hit (copy to config)');
  role.add(r, 'spreadDeg', 0, 15, 0.1).name('spread (°)');
  role.add(r, 'aimSpreadDeg', 0, 5, 0.1).name('aimed spread (°)');
  role.add(r, 'projectileSpeed', 5, 80, 0.5).name('shot speed (m/s)');
  role.add(r, 'straightTime', 0, 1.5, 0.01).name('straight flight (s)');
  role.add(r, 'aimStraightTime', 0, 2, 0.01).name('aimed straight flight (s)');
  role.add(r, 'splatRadius', 0.2, 3, 0.05).name('splat radius (m)');
  role.add(r, 'dripEvery', 0.3, 6, 0.1).name('trail piece length (m)');
  role.add(r, 'dripRadius', 0, 1.5, 0.01).name('trail swim width (m, ≥ 0.36)');
  role.close();
}

/** Copies the current values as JSON, ready to paste back so they can go into config.ts. */
function copyTuning(button: Controller): void {
  const text = JSON.stringify(
    {
      movement: CONFIG.movement,
      camera: CONFIG.camera,
      weapon: CONFIG.weapon,
      weapons: CONFIG.weapons,
      swim: CONFIG.swim,
      health: CONFIG.health,
      player: CONFIG.player,
      net: { tickRate: CONFIG.net.tickRate },
    },
    null,
    2,
  );
  console.info(text);
  const showFallback = () => window.prompt('Copy these tuning values:', text);
  // The clipboard only works on https:// or localhost pages.
  if (!window.isSecureContext) {
    showFallback();
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    button.name('Copied!');
    setTimeout(() => button.name(COPY_LABEL), 1500);
  }, showFallback);
}
