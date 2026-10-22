/** Ignore single mouse moves larger than this (px): some browsers report a jump when the lock starts. */
const MAX_MOUSE_STEP = 400;

function axis(keys: Set<string>, positive: string[], negative: string[]): number {
  const plus = positive.some((code) => keys.has(code)) ? 1 : 0;
  const minus = negative.some((code) => keys.has(code)) ? 1 : 0;
  return plus - minus;
}

/**
 * Desktop controls: WASD or arrows to move, mouse to look (pointer lock), Space to jump.
 * Keys are read by physical position, so WASD works on any keyboard layout.
 */
export class KeyboardMouse {
  /** True while the mouse is captured by the game. */
  locked = false;
  private readonly canvas: HTMLCanvasElement;
  private readonly onLockChange: (locked: boolean) => void;
  private readonly keys = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private jumpPressed = false;
  private fireDown = false;
  private firePressed = false;
  private reloadPressed = false;

  constructor(canvas: HTMLCanvasElement, onLockChange: (locked: boolean) => void) {
    this.canvas = canvas;
    this.onLockChange = onLockChange;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.releaseAll);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('pointerlockchange', this.handleLockChange);
    canvas.addEventListener('click', () => {
      if (!this.locked) this.requestLock();
    });
  }

  get moveX(): number {
    return axis(this.keys, ['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
  }

  get moveY(): number {
    return axis(this.keys, ['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
  }

  get jumpHeld(): boolean {
    return this.keys.has('Space');
  }

  /** Left mouse button held. */
  get fireHeld(): boolean {
    return this.fireDown;
  }

  /** True once per click, even if it was released before the next tick. */
  consumeFirePress(): boolean {
    const pressed = this.firePressed;
    this.firePressed = false;
    return pressed;
  }

  /** True once per R press (reload). */
  consumeReloadPress(): boolean {
    const pressed = this.reloadPressed;
    this.reloadPressed = false;
    return pressed;
  }

  /** True once per Space press, even if it was released before the next tick. */
  consumeJumpPress(): boolean {
    const pressed = this.jumpPressed;
    this.jumpPressed = false;
    return pressed;
  }

  /** Mouse movement since the last call, in pixels. */
  consumeLook(): { x: number; y: number } {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  /** Captures the mouse. Asks for raw input (no OS acceleration) and falls back to plain lock. */
  requestLock(): void {
    const canvas = this.canvas;
    const raw: unknown = canvas.requestPointerLock({ unadjustedMovement: true });
    if (raw instanceof Promise) {
      raw.catch(() => {
        const plain: unknown = canvas.requestPointerLock();
        if (plain instanceof Promise) plain.catch(() => undefined);
      });
    }
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.locked) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) this.jumpPressed = true;
    }
    if (event.code === 'KeyR' && !event.repeat) this.reloadPressed = true;
    this.keys.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly releaseAll = (): void => {
    this.keys.clear();
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return;
    if (Math.abs(event.movementX) > MAX_MOUSE_STEP || Math.abs(event.movementY) > MAX_MOUSE_STEP) {
      return;
    }
    this.lookX += event.movementX;
    this.lookY += event.movementY;
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (!this.locked || event.button !== 0) return;
    this.fireDown = true;
    this.firePressed = true;
  };

  private readonly handleMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.fireDown = false;
  };

  private readonly handleLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked) {
      this.keys.clear();
      this.fireDown = false;
    }
    this.onLockChange(this.locked);
  };
}
