/** Voices that tend to sound light and bright, tried first (names differ per device). */
const PREFERRED = /female|samantha|zira|karen|moira|tessa|victoria|google us english|aria|jenny/i;

/**
 * The multi-kill announcer: the device's own speech voice (no audio files), pitched way up
 * and sped up so it sounds small and squeaky. It's an original cute voice, not any character's.
 * Devices without speech just stay quiet (the banner and jingle still play).
 */
export class CuteVoice {
  private voice: SpeechSynthesisVoice | null = null;
  private readonly supported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    'SpeechSynthesisUtterance' in window;

  constructor() {
    if (!this.supported) return;
    this.pickVoice();
    // Voices often load a moment after the page.
    window.speechSynthesis.addEventListener('voiceschanged', () => this.pickVoice());
  }

  /** Says `text` at `volume` (0–1); a new line cuts off the one before. */
  say(text: string, volume: number): void {
    if (!this.supported || volume <= 0) return;
    const line = new SpeechSynthesisUtterance(text);
    line.lang = this.voice?.lang ?? 'en-US';
    if (this.voice) line.voice = this.voice;
    line.pitch = 2;
    line.rate = 1.2;
    line.volume = Math.min(1, volume);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(line);
  }

  private pickVoice(): void {
    const english = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
    this.voice = english.find((v) => PREFERRED.test(v.name)) ?? english[0] ?? null;
  }
}
