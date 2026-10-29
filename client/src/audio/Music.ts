/** Which loop plays: calm for menus and the lobby, bouncy in matches. */
export type MusicTrack = 'menu' | 'match';

/** The audio output to play into (shared with the sound effects), once sound is allowed. */
type AudioSource = () => { context: AudioContext; output: AudioNode } | null;

interface Chord {
  /** Root note (MIDI number). */
  root: number;
  /** Chord tones above the root (semitones). */
  tones: number[];
}

interface Song {
  bpm: number;
  chords: Chord[];
  /** One character per 16th note: x = hit, . = rest. */
  kick: string;
  snare: string;
  hat: string;
  /** Bass: a number = which chord tone (0 = root), . = rest. */
  bass: string;
  /** Lead arpeggio: chord tone index (up an octave for 4–7), . = rest. */
  lead: string;
  /** Soft pad chords on each bar's first beat. */
  pad: boolean;
  leadWave: OscillatorType;
}

const MAJ7 = [0, 4, 7, 11];
const MIN7 = [0, 3, 7, 10];
const MAJ = [0, 4, 7, 12];
const MIN = [0, 3, 7, 12];

/** Original loops, made for this game (just chords and patterns, played by tiny synths). */
const SONGS: Record<MusicTrack, Song> = {
  menu: {
    bpm: 92,
    chords: [
      { root: 53, tones: MAJ7 },
      { root: 52, tones: MIN7 },
      { root: 50, tones: MIN7 },
      { root: 55, tones: MAJ },
    ],
    kick: 'x.......x..x....',
    snare: '....x.......x...',
    hat: '..x...x...x...x.',
    bass: '0.....2.0...1...',
    lead: '4.6.5...7.6.4...',
    pad: true,
    leadWave: 'triangle',
  },
  match: {
    bpm: 128,
    chords: [
      { root: 48, tones: MAJ },
      { root: 55, tones: MAJ },
      { root: 57, tones: MIN },
      { root: 53, tones: MAJ },
    ],
    kick: 'x...x...x...x...',
    snare: '....x.......x..x',
    hat: 'x.xxx.xxx.xxx.xx',
    bass: '0.0.2.0.3.0.2.1.',
    lead: '4.5.6.4.7...6.5.',
    pad: false,
    leadWave: 'square',
  },
};

/** Loudness at full music volume (kept under the effects). */
const MUSIC_GAIN = 0.22;
/** How far ahead notes are scheduled (s), and how often the scheduler wakes (ms). */
const LOOKAHEAD = 0.12;
const TICK_MS = 30;

function hz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Background music, generated with WebAudio (no files): a few tiny synths play a looping
 * song step by step, scheduled a little ahead so it stays in time.
 */
export class Music {
  private readonly source: AudioSource;
  private gain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private track: MusicTrack | null = null;
  private volume = 0.5;
  /** Plays a bit faster (the last 30 seconds of a match). */
  private hurry = false;
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(source: AudioSource) {
    this.source = source;
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.gain) this.gain.gain.value = MUSIC_GAIN * volume;
  }

  /** Switches to a loop (or silence with null); it starts once sound is allowed. */
  play(track: MusicTrack | null): void {
    if (track === this.track) return;
    this.track = track;
    this.step = 0;
    this.nextTime = 0;
    clearInterval(this.timer);
    this.timer = track ? setInterval(() => this.schedule(), TICK_MS) : undefined;
  }

  /** Speeds the match loop up a little (true in the last 30 seconds). */
  setHurry(hurry: boolean): void {
    this.hurry = hurry;
  }

  private schedule(): void {
    const audio = this.source();
    if (!audio || !this.track) return;
    const { context } = audio;
    this.ensureNodes(audio.context, audio.output);
    const song = SONGS[this.track];
    const stepSeconds = 60 / (song.bpm * (this.hurry ? 1.1 : 1)) / 4;
    if (this.nextTime < context.currentTime) this.nextTime = context.currentTime + 0.05;
    while (this.nextTime < context.currentTime + LOOKAHEAD) {
      this.playStep(context, song, this.step, this.nextTime, stepSeconds);
      this.step++;
      this.nextTime += stepSeconds;
    }
  }

  private ensureNodes(context: AudioContext, output: AudioNode): void {
    if (this.gain) return;
    this.gain = context.createGain();
    this.gain.gain.value = MUSIC_GAIN * this.volume;
    this.gain.connect(output);
    this.noise = context.createBuffer(1, context.sampleRate / 2, context.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  private playStep(ctx: AudioContext, song: Song, step: number, t: number, len: number): void {
    const pos = step % 16;
    const chord = song.chords[Math.floor(step / 16) % song.chords.length];
    const tone = (index: number) =>
      chord.root + chord.tones[index % chord.tones.length] + (index >= 4 ? 12 : 0);

    if (song.kick[pos] === 'x') this.kick(ctx, t);
    if (song.snare[pos] === 'x') this.hiss(ctx, t, 0.12, 1800, 0.35);
    if (song.hat[pos] === 'x') this.hiss(ctx, t, 0.03, 8000, 0.12);
    const bass = song.bass[pos];
    if (bass && bass !== '.') {
      this.note(ctx, t, hz(tone(Number(bass)) - 12), len * 1.8, 'triangle', 0.5);
    }
    const lead = song.lead[pos];
    if (lead && lead !== '.') {
      this.note(ctx, t, hz(tone(Number(lead)) + 12), len * 1.5, song.leadWave, 0.12);
    }
    if (song.pad && pos === 0) {
      for (const offset of chord.tones) {
        this.note(ctx, t, hz(chord.root + offset), len * 15, 'sine', 0.08, len * 3);
      }
    }
  }

  private note(
    ctx: AudioContext,
    t: number,
    frequency: number,
    duration: number,
    wave: OscillatorType,
    volume: number,
    attack = 0.01,
  ): void {
    if (!this.gain) return;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = frequency;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(volume, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(env).connect(this.gain);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private kick(ctx: AudioContext, t: number): void {
    if (!this.gain) return;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.9, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(env).connect(this.gain);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private hiss(ctx: AudioContext, t: number, duration: number, cutoff: number, volume: number) {
    if (!this.gain || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = cutoff;
    const env = ctx.createGain();
    env.gain.setValueAtTime(volume, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(env).connect(this.gain);
    src.start(t, Math.random() * 0.3);
    src.stop(t + duration + 0.02);
  }
}
