import type { Controller, GUI } from 'lil-gui';
import { CONFIG } from '@paint-rush/shared';

export interface TuningActions {
  respawn: () => void;
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

  const simulation = gui.addFolder('Simulation');
  simulation.add(CONFIG.net, 'tickRate', 10, 120, 1).name('tick rate (Hz)');

  const copyButton: Controller = gui.add({ copy: () => copyTuning(copyButton) }, 'copy');
  copyButton.name(COPY_LABEL);
  gui.add(actions, 'respawn').name('Respawn');
  return gui;
}

/** Copies the current values as JSON, ready to paste back so they can go into config.ts. */
function copyTuning(button: Controller): void {
  const text = JSON.stringify(
    { movement: CONFIG.movement, camera: CONFIG.camera, net: { tickRate: CONFIG.net.tickRate } },
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
