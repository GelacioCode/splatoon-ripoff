import { CONFIG } from '@paint-rush/shared';
import { createInput, type PlayerInput } from '@paint-rush/shared/sim';
import type { Settings } from '../settings';
import { Gyro } from './Gyro';
import { KeyboardMouse } from './KeyboardMouse';
import { TouchControls } from './TouchControls';
import { lookDelta } from './touchMath';

/** Radians of turn per pixel of touch drag, before the player's sensitivity setting. */
const TOUCH_SENSITIVITY = 0.005;

/** Combines keyboard/mouse, touch and gyro into one PlayerInput per simulation tick. */
export class InputManager {
  readonly keyboardMouse: KeyboardMouse;
  readonly touch: TouchControls | null;
  readonly gyro = new Gyro();
  /** Set by the game: input only counts while actually playing (not paused). */
  playing = false;
  private readonly input: PlayerInput = createInput();

  constructor(
    canvas: HTMLCanvasElement,
    touchDevice: boolean,
    onLockChange: (locked: boolean) => void,
    onPause: () => void,
  ) {
    this.keyboardMouse = new KeyboardMouse(canvas, onLockChange);
    this.touch = touchDevice ? new TouchControls(onPause) : null;
  }

  /**
   * Camera turn since the last call, already scaled: pass to `camera.look(x, y, 1)`.
   * Called every frame, so aiming never waits for a tick.
   */
  consumeLook(settings: Settings): { x: number; y: number } {
    const mouse = this.keyboardMouse.consumeLook();
    const touch = this.touch?.consumeLook() ?? { x: 0, y: 0 };
    const gyro = this.gyro.consume();
    if (!this.playing) return { x: 0, y: 0 };
    const mouseScale = CONFIG.camera.mouseSensitivity * settings.mouseSensitivity;
    const touchScale = TOUCH_SENSITIVITY * settings.touchSensitivity;
    const m = lookDelta(mouse.x, mouse.y, mouseScale, settings.invertY);
    const t = lookDelta(touch.x, touch.y, touchScale, settings.invertY);
    // The camera turns left for negative x and up for negative y.
    const g = lookDelta(-gyro.yaw, -gyro.pitch, settings.gyroSensitivity, settings.invertY);
    return { x: m.x + t.x + g.x, y: m.y + t.y + g.y };
  }

  /** Builds this tick's input. The aim comes from the camera. */
  sampleTick(aimYaw: number, aimPitch: number): PlayerInput {
    const km = this.keyboardMouse;
    const touch = this.touch;
    // Read the one-shot presses even when paused, so they don't fire later.
    const jumpPressed = km.consumeJumpPress() || (touch?.consumeJumpPress() ?? false);
    const firePressed = km.consumeFirePress() || (touch?.consumeFirePress() ?? false);
    const reloadPressed = km.consumeReloadPress() || (touch?.consumeReloadPress() ?? false);
    const on = this.playing;

    const input = this.input;
    let moveX = km.moveX + (touch?.moveX ?? 0);
    let moveY = km.moveY + (touch?.moveY ?? 0);
    const amount = Math.hypot(moveX, moveY);
    if (amount > 1) {
      moveX /= amount;
      moveY /= amount;
    }
    input.moveX = on ? moveX : 0;
    input.moveY = on ? moveY : 0;
    input.jump = on && (km.jumpHeld || (touch?.jumpHeld ?? false) || jumpPressed);
    input.fire = on && (km.fireHeld || (touch?.fireHeld ?? false) || firePressed);
    input.swim = on && (km.swimHeld || (touch?.swimHeld ?? false));
    input.reload = on && reloadPressed;
    input.aimYaw = aimYaw;
    input.aimPitch = aimPitch;
    return input;
  }
}
