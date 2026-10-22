/** Splats closer together than this (s) only make one sound, so bursts don't get noisy. */
const SPLAT_SOUND_GAP = 0.04;

/**
 * Sound effects synthesized with WebAudio (no audio files). Browsers only allow sound after
 * the player clicks or presses a key, so audio starts on the first input.
 */
export class Sfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastSplat = 0;

  constructor() {
    const unlock = () => this.ready();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  /** Paint blaster: a short wet "pew". */
  shoot(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noiseBurst(ctx, t, 0.07, 'bandpass', 2200, 700, 0.35);
    this.tone(ctx, t, 'triangle', 900, 260, 0.06, 0.12);
  }

  /** Paint hitting a surface. `volume` 0–1 (quieter when far away). */
  splat(volume: number): void {
    const ctx = this.ready();
    if (!ctx || volume <= 0.02) return;
    const t = ctx.currentTime;
    if (t - this.lastSplat < SPLAT_SOUND_GAP) return;
    this.lastSplat = t;
    this.noiseBurst(ctx, t, 0.13, 'lowpass', 1400, 300, 0.5 * volume);
    this.tone(ctx, t, 'sine', 170, 70, 0.1, 0.35 * volume);
  }

  /** Dry click when the ink tank is empty. */
  empty(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.tone(ctx, ctx.currentTime, 'square', 1300, 1100, 0.03, 0.06);
  }

  /** Diving into your own paint: a falling bubbly "bloop". */
  swimIn(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, t, 'sine', 520, 160, 0.14, 0.25);
    this.noiseBurst(ctx, t, 0.12, 'lowpass', 1800, 400, 0.25);
  }

  /** Popping back out of the paint: a rising "plip". */
  swimOut(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, t, 'sine', 220, 640, 0.1, 0.22);
    this.noiseBurst(ctx, t, 0.08, 'bandpass', 900, 2400, 0.18);
  }

  /** Rising two-note chime when a reload finishes. */
  reloaded(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, t, 'triangle', 520, 700, 0.07, 0.15);
    this.tone(ctx, t + 0.08, 'triangle', 780, 1050, 0.09, 0.15);
  }

  /** Creates (or wakes up) the audio context; null if the browser has no WebAudio. */
  private ready(): AudioContext | null {
    if (!this.context) {
      if (typeof AudioContext === 'undefined') return null;
      const ctx = new AudioContext();
      this.master = ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(ctx.destination);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.context = ctx;
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => undefined);
    return this.context;
  }

  private noiseBurst(
    ctx: AudioContext,
    start: number,
    duration: number,
    filterType: BiquadFilterType,
    fromHz: number,
    toHz: number,
    volume: number,
  ): void {
    if (!this.noise || !this.master) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(fromHz, start);
    filter.frequency.exponentialRampToValueAtTime(toHz, start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(start, Math.random() * 0.5);
    source.stop(start + duration);
  }

  private tone(
    ctx: AudioContext,
    start: number,
    type: OscillatorType,
    fromHz: number,
    toHz: number,
    duration: number,
    volume: number,
  ): void {
    if (!this.master) return;
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(fromHz, start);
    oscillator.frequency.exponentialRampToValueAtTime(toHz, start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }
}
