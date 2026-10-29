import { joystickVector } from './touchMath';

/** How far the thumb can push the joystick (px). */
const STICK_RADIUS = 60;

/**
 * Phone and tablet controls, built with Pointer Events so several fingers work at once:
 * a floating joystick on the left half, drag on the right half to aim, and buttons for
 * SHOOT (hold, and drag it to aim while shooting), JUMP, SWIM (hold) and reload.
 */
export class TouchControls {
  private readonly root: HTMLDivElement;
  private readonly stick: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private stickPointer: number | null = null;
  private stickOriginX = 0;
  private stickOriginY = 0;
  private readonly aimPointers = new Map<number, { x: number; y: number }>();
  private move = { x: 0, y: 0 };
  private lookX = 0;
  private lookY = 0;
  private fireDown = false;
  private firePressed = false;
  private swimDown = false;
  private jumpDown = false;
  private jumpPressed = false;
  private reloadPressed = false;
  private aimOn = false;
  private aimButton: HTMLElement | null = null;
  private slotToggled = false;
  private bombButton: HTMLElement | null = null;
  private bombCount: HTMLElement | null = null;
  private bombShown = '';

  constructor(onPause: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="touch-zone touch-move-zone"></div>
      <div class="touch-zone touch-aim-zone"></div>
      <div class="touch-stick"><div class="touch-knob"></div></div>
      <button class="touch-button touch-fire" type="button">SHOOT</button>
      <button class="touch-button touch-jump" type="button">JUMP</button>
      <button class="touch-button touch-swim" type="button">SWIM</button>
      <button class="touch-button touch-reload" type="button">R</button>
      <button class="touch-button touch-aim" type="button">AIM</button>
      <button class="touch-button touch-bomb" type="button" aria-label="Bomb">💣<span class="touch-bomb-count">2</span></button>
      <button class="touch-pause" type="button" aria-label="Pause">II</button>`;
    document.body.appendChild(this.root);
    this.stick = this.part('.touch-stick');
    this.knob = this.part('.touch-knob');

    const moveZone = this.part('.touch-move-zone');
    moveZone.addEventListener('pointerdown', (event) => {
      if (this.stickPointer !== null) return;
      this.capture(moveZone, event);
      this.stickPointer = event.pointerId;
      this.stickOriginX = event.clientX;
      this.stickOriginY = event.clientY;
      this.stick.style.left = `${event.clientX}px`;
      this.stick.style.top = `${event.clientY}px`;
      this.stick.classList.add('active');
      this.updateStick(event);
    });
    moveZone.addEventListener('pointermove', (event) => {
      if (event.pointerId === this.stickPointer) this.updateStick(event);
    });
    const releaseStick = (event: PointerEvent) => {
      if (event.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.move = { x: 0, y: 0 };
      this.knob.style.transform = '';
      this.stick.classList.remove('active');
    };
    moveZone.addEventListener('pointerup', releaseStick);
    moveZone.addEventListener('pointercancel', releaseStick);

    this.makeAimSurface(this.part('.touch-aim-zone'));
    const fire = this.part('.touch-fire');
    this.makeAimSurface(fire);
    this.hold(fire, (down) => {
      this.fireDown = down;
      if (down) this.firePressed = true;
    });
    this.hold(this.part('.touch-swim'), (down) => {
      this.swimDown = down;
      // Swimming cancels aim mode.
      if (down) this.setAim(false);
    });
    // AIM is a toggle: tap to zoom in, tap again to zoom out.
    this.aimButton = this.part('.touch-aim');
    this.aimButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.setAim(!this.aimOn);
    });
    this.hold(this.part('.touch-jump'), (down) => {
      this.jumpDown = down;
      if (down) this.jumpPressed = true;
    });
    this.hold(this.part('.touch-reload'), (down) => {
      if (down) this.reloadPressed = true;
    });
    // 💣 switches between the weapon and a bomb; SHOOT then throws it.
    this.bombButton = this.part('.touch-bomb');
    this.bombCount = this.part('.touch-bomb-count');
    this.bombButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.slotToggled = true;
    });
    this.part('.touch-pause').addEventListener('click', onPause);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (!visible) this.releaseAll();
  }

  get moveX(): number {
    return this.move.x;
  }

  get moveY(): number {
    return this.move.y;
  }

  get fireHeld(): boolean {
    return this.fireDown;
  }

  get swimHeld(): boolean {
    return this.swimDown;
  }

  get jumpHeld(): boolean {
    return this.jumpDown;
  }

  /** Aim mode switched on with the AIM toggle. */
  get aimToggled(): boolean {
    return this.aimOn;
  }

  /** Switches the AIM toggle off (out of shots, or splatted). */
  releaseAim(): void {
    this.setAim(false);
  }

  /** True once per tap of 💣 (switch between the weapon and a bomb). */
  consumeSlotToggle(): boolean {
    const toggled = this.slotToggled;
    this.slotToggled = false;
    return toggled;
  }

  /** The 💣 button: lit while a bomb is in hand, with the bombs left (greyed out at none). */
  showBombs(inHand: boolean, bombs: number): void {
    const key = `${inHand}|${bombs}`;
    if (key === this.bombShown) return;
    this.bombShown = key;
    this.bombButton?.classList.toggle('pressed', inHand);
    this.bombButton?.classList.toggle('empty', bombs <= 0);
    if (this.bombCount) this.bombCount.textContent = String(bombs);
  }

  private setAim(on: boolean): void {
    this.aimOn = on;
    this.aimButton?.classList.toggle('pressed', on);
  }

  consumeFirePress(): boolean {
    const pressed = this.firePressed;
    this.firePressed = false;
    return pressed;
  }

  consumeJumpPress(): boolean {
    const pressed = this.jumpPressed;
    this.jumpPressed = false;
    return pressed;
  }

  consumeReloadPress(): boolean {
    const pressed = this.reloadPressed;
    this.reloadPressed = false;
    return pressed;
  }

  /** Aim drag since the last call (px). */
  consumeLook(): { x: number; y: number } {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  private part<T extends HTMLElement = HTMLDivElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Touch controls: missing ${selector}`);
    return element;
  }

  /** Keeps receiving a finger's moves even if it slides off the element. */
  private capture(element: HTMLElement, event: PointerEvent): void {
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
  }

  private updateStick(event: PointerEvent): void {
    const dx = event.clientX - this.stickOriginX;
    const dy = event.clientY - this.stickOriginY;
    this.move = joystickVector(dx, dy, STICK_RADIUS);
    const distance = Math.hypot(dx, dy);
    const shown = distance > STICK_RADIUS ? STICK_RADIUS / distance : 1;
    this.knob.style.transform = `translate(${dx * shown}px, ${dy * shown}px)`;
  }

  /** Dragging a finger across `element` turns the camera. */
  private makeAimSurface(element: HTMLElement): void {
    element.addEventListener('pointerdown', (event) => {
      this.capture(element, event);
      this.aimPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    });
    element.addEventListener('pointermove', (event) => {
      const last = this.aimPointers.get(event.pointerId);
      if (!last) return;
      this.lookX += event.clientX - last.x;
      this.lookY += event.clientY - last.y;
      last.x = event.clientX;
      last.y = event.clientY;
    });
    const release = (event: PointerEvent) => this.aimPointers.delete(event.pointerId);
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
  }

  /** Calls `onChange(true)` while a finger is on the button and `onChange(false)` after. */
  private hold(button: HTMLElement, onChange: (down: boolean) => void): void {
    button.addEventListener('pointerdown', (event) => {
      this.capture(button, event);
      button.classList.add('pressed');
      onChange(true);
    });
    const release = () => {
      button.classList.remove('pressed');
      onChange(false);
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
  }

  private releaseAll(): void {
    this.stickPointer = null;
    this.move = { x: 0, y: 0 };
    this.aimPointers.clear();
    this.fireDown = false;
    this.swimDown = false;
    this.jumpDown = false;
    this.aimOn = false;
    this.stick.classList.remove('active');
    for (const button of this.root.querySelectorAll('.pressed')) button.classList.remove('pressed');
  }
}
