import { createInput, type PlayerInput } from '@paint-rush/shared/sim';
import { KeyboardMouse } from './KeyboardMouse';

/** Combines every input device into one PlayerInput per simulation tick. */
export class InputManager {
  readonly keyboardMouse: KeyboardMouse;
  private readonly input: PlayerInput = createInput();

  constructor(canvas: HTMLCanvasElement, onLockChange: (locked: boolean) => void) {
    this.keyboardMouse = new KeyboardMouse(canvas, onLockChange);
  }

  /** Look movement since the last call (pixels). The camera applies it every frame. */
  consumeLook(): { x: number; y: number } {
    return this.keyboardMouse.consumeLook();
  }

  /** Builds this tick's input. The aim comes from the camera. */
  sampleTick(aimYaw: number, aimPitch: number): PlayerInput {
    const km = this.keyboardMouse;
    const active = km.locked;
    const jumpPressed = km.consumeJumpPress();
    const input = this.input;
    input.moveX = active ? km.moveX : 0;
    input.moveY = active ? km.moveY : 0;
    input.jump = active && (km.jumpHeld || jumpPressed);
    input.aimYaw = aimYaw;
    input.aimPitch = aimPitch;
    input.fire = false;
    input.swim = false;
    return input;
  }
}
