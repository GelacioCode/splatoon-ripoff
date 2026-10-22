const DEG_TO_RAD = Math.PI / 180;

/** iPhone-only extra on DeviceMotionEvent: motion data needs the player's permission. */
interface MotionPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/**
 * Optional aiming by turning the phone, from the gyroscope's rotation rate. Works in portrait
 * and landscape. Browsers only provide motion data on https:// pages.
 */
export class Gyro {
  private enabled = false;
  private yaw = 0;
  private pitch = 0;
  private lastTime = 0;

  /**
   * Turns gyro aim on. Must be called from a tap (iPhone shows a permission prompt).
   * Resolves to false when the device or page can't provide motion data.
   */
  async enable(): Promise<boolean> {
    if (typeof DeviceMotionEvent === 'undefined' || !window.isSecureContext) return false;
    const motion = DeviceMotionEvent as unknown as MotionPermission;
    if (motion.requestPermission) {
      const answer = await motion.requestPermission().catch(() => 'denied' as const);
      if (answer !== 'granted') return false;
    }
    if (!this.enabled) window.addEventListener('devicemotion', this.handleMotion);
    this.enabled = true;
    this.lastTime = 0;
    return true;
  }

  disable(): void {
    window.removeEventListener('devicemotion', this.handleMotion);
    this.enabled = false;
    this.yaw = 0;
    this.pitch = 0;
  }

  /** Turn since the last call, in radians (positive yaw = left, positive pitch = up). */
  consume(): { yaw: number; pitch: number } {
    const turn = { yaw: this.yaw, pitch: this.pitch };
    this.yaw = 0;
    this.pitch = 0;
    return turn;
  }

  private readonly handleMotion = (event: DeviceMotionEvent): void => {
    const rate = event.rotationRate;
    const now = event.timeStamp;
    const dt = this.lastTime === 0 ? 0 : Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    if (!rate || dt === 0) return;
    // Rotation rates are degrees per second around the phone's own axes (in portrait: x to
    // the right, y up the screen). Which axis is "turn" and which is "tilt" depends on how
    // the phone is held.
    const beta = (rate.beta ?? 0) * DEG_TO_RAD;
    const gamma = (rate.gamma ?? 0) * DEG_TO_RAD;
    const angle = screen.orientation?.angle ?? 0;
    let yawRate = gamma;
    let pitchRate = beta;
    if (angle === 90) {
      yawRate = beta;
      pitchRate = -gamma;
    } else if (angle === 270) {
      yawRate = -beta;
      pitchRate = gamma;
    }
    this.yaw += yawRate * dt;
    this.pitch += pitchRate * dt;
  };
}
