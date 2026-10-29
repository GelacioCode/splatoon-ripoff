/** Splats closer together than this (s) only make one sound, so bursts don't get noisy. */
const SPLAT_SOUND_GAP = 0.04;
/** Loudness at full volume; kept below 1 so overlapping sounds don't clip. */
const MASTER_GAIN = 0.35;

/**
 * Sound effects synthesized with WebAudio (no audio files). Browsers only allow sound after
 * the player clicks or presses a key, so audio starts on the first input.
 */
export class Sfx {
  private context: AudioContext | null = null;
  /** Everything (effects and music) goes through this: the master volume. */
  private output: GainNode | null = null;
  /** Sound effects only. */
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastSplat = 0;
  private volume = 1;
  private effects = 1;

  /** Master loudness and the effects' share of it, each 0–1. */
  setVolume(volume: number, effects = this.effects): void {
    this.volume = volume;
    this.effects = effects;
    if (this.output) this.output.gain.value = volume;
    if (this.master) this.master.gain.value = MASTER_GAIN * effects;
  }

  constructor() {
    const unlock = () => this.ready();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  /** Paint blaster: a short wet "pew". `volume` 0–1 (quieter for other players far away). */
  shoot(volume = 1): void {
    const ctx = this.ready();
    if (!ctx || volume <= 0.02) return;
    const t = ctx.currentTime;
    this.noiseBurst(ctx, t, 0.07, 'bandpass', 2200, 700, 0.35 * volume);
    this.tone(ctx, t, 'triangle', 900, 260, 0.06, 0.12 * volume);
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

  /** Your shot hit an enemy: a short bright tick (a two-note ping for a splat). */
  hit(splat: boolean): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, t, 'square', 1800, 1500, 0.04, 0.1);
    if (splat) this.tone(ctx, t + 0.06, 'triangle', 1200, 1900, 0.12, 0.18);
  }

  /** Someone bursting into paint. `volume` 0–1 (quieter far away). */
  splatBurst(volume: number): void {
    const ctx = this.ready();
    if (!ctx || volume <= 0.02) return;
    const t = ctx.currentTime;
    this.noiseBurst(ctx, t, 0.3, 'lowpass', 2400, 200, 0.7 * volume);
    this.tone(ctx, t, 'sine', 320, 60, 0.25, 0.4 * volume);
  }

  /** A short rising fanfare: a capture (or someone taking the flag, quieter). */
  fanfare(volume = 1): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    [523, 659, 784].forEach((hz, i) => {
      this.tone(ctx, t + i * 0.09, 'triangle', hz, hz * 1.01, 0.14, 0.2 * volume);
    });
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

  /**
   * A sparkly rising jingle for a multi-kill: longer and higher for bigger streaks
   * (2 = double … 5 = penta).
   */
  streak(level: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = [523, 659, 784, 1047, 1319, 1568].slice(0, Math.min(6, level + 1));
    notes.forEach((hz, i) => {
      this.tone(ctx, t + i * 0.07, 'square', hz, hz * 1.02, 0.11, 0.09);
      this.tone(ctx, t + i * 0.07, 'triangle', hz * 2, hz * 2.03, 0.14, 0.12);
    });
  }

  /**
   * The audio context and master output, once sound is allowed and running (shared with the
   * music), or null. It never starts the audio itself: the first tap or key press does.
   */
  audio(): { context: AudioContext; output: AudioNode } | null {
    const ctx = this.context;
    if (!ctx || !this.output || ctx.state !== 'running') return null;
    return { context: ctx, output: this.output };
  }

  /** Throwing a bomb: a quick whoosh. */
  bombThrow(volume = 1): void {
    const ctx = this.ready();
    if (!ctx || volume <= 0.02) return;
    const t = ctx.currentTime;
    this.noiseBurst(ctx, t, 0.18, 'bandpass', 600, 2600, 0.3 * volume);
  }

  /** A bomb's fuse ticking (faster as it runs out). */
  bombTick(volume: number): void {
    const ctx = this.ready();
    if (!ctx || volume <= 0.02) return;
    this.tone(ctx, ctx.currentTime, 'square', 2100, 1900, 0.03, 0.05 * volume);
  }

  /** A bomb going off: a deep wet boom. `volume` 0–1 (quieter far away). */
  boom(volume: number): void {
    const ctx = this.ready();
    if (!ctx || volume <= 0.02) return;
    const t = ctx.currentTime;
    this.noiseBurst(ctx, t, 0.55, 'lowpass', 1800, 90, 0.9 * volume);
    this.tone(ctx, t, 'sine', 140, 38, 0.5, 0.6 * volume);
    this.tone(ctx, t + 0.02, 'triangle', 420, 90, 0.25, 0.2 * volume);
  }

  /** Taking a bomb crate: a bright little pickup arpeggio. */
  pickup(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    [660, 880, 1320].forEach((hz, i) => {
      this.tone(ctx, t + i * 0.05, 'triangle', hz, hz * 1.02, 0.1, 0.16);
    });
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
      this.output = ctx.createGain();
      this.output.gain.value = this.volume;
      this.output.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = MASTER_GAIN * this.effects;
      this.master.connect(this.output);
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
