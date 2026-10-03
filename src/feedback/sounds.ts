/**
 * Sound effects, synthesised with WebAudio: no audio files in the bundle, nothing to download, and
 * every effect is a few short notes. Quiet by design (master gain 0.25).
 */

export type SoundKind = 'correct' | 'shield' | 'found' | 'complete' | 'levelUp' | 'medal' | 'preview';

export interface Note {
  /** Hz */
  frequency: number;
  /** Seconds from the start of the effect. */
  at: number;
  /** Seconds. */
  duration: number;
  wave: OscillatorType;
  /** 0..1, before the master gain. */
  gain: number;
}

const note = (frequency: number, at: number, duration: number, wave: OscillatorType = 'sine', gain = 0.8): Note => ({
  frequency,
  at,
  duration,
  wave,
  gain,
});

// Equal-tempered pitches used below.
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880;
const C6 = 1046.5;
const E6 = 1318.5;
const G6 = 1568;

/** The notes of each effect (exported so tests can check them without an audio device). */
export const SOUNDS: Record<SoundKind, readonly Note[]> = {
  preview: [note(C5, 0, 0.12, 'triangle'), note(G5, 0.1, 0.16, 'triangle')],
  correct: [note(C5, 0, 0.1, 'triangle'), note(G5, 0.09, 0.18, 'triangle')],
  // A falling sweep plus a low thud: a layer of the shield breaking.
  shield: [note(440, 0, 0.1, 'sawtooth', 0.45), note(294, 0.08, 0.12, 'sawtooth', 0.45), note(196, 0.17, 0.2, 'sawtooth', 0.45), note(98, 0.17, 0.25, 'sine', 0.9)],
  found: [note(E5, 0, 0.09, 'triangle'), note(A5, 0.08, 0.2, 'triangle')],
  complete: [note(C5, 0, 0.12, 'triangle'), note(E5, 0.11, 0.12, 'triangle'), note(G5, 0.22, 0.12, 'triangle'), note(C6, 0.33, 0.3, 'triangle')],
  levelUp: [note(C5, 0, 0.12), note(E5, 0.11, 0.12), note(G5, 0.22, 0.12), note(C6, 0.33, 0.14), note(E6, 0.45, 0.14), note(G6, 0.57, 0.4)],
  medal: [note(G5, 0, 0.1), note(C6, 0.09, 0.1), note(E6, 0.18, 0.1), note(G6, 0.27, 0.45)],
};

const MASTER_GAIN = 0.25;

let context: AudioContext | null = null;

type AudioContextConstructor = typeof AudioContext;

/**
 * Creates (once) and wakes the audio context. Browsers only allow audio after the user has touched
 * the page, so before that this does nothing — and never creates a context that would log an
 * autoplay warning.
 */
export function unlockAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!context) {
    if (!navigator.userActivation?.hasBeenActive) return null;
    const Constructor: AudioContextConstructor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
    if (!Constructor) return null;
    try {
      context = new Constructor();
    } catch {
      return null;
    }
  }
  if (context.state === 'suspended') void context.resume().catch(() => undefined);
  return context;
}

/** Plays an effect. Silent (and harmless) when audio is unavailable or not yet allowed. */
export function playSound(kind: SoundKind): void {
  const audio = unlockAudio();
  if (!audio || audio.state === 'closed') return;
  try {
    const start = audio.currentTime + 0.02;
    for (const { frequency, at, duration, wave, gain } of SOUNDS[kind]) {
      const oscillator = audio.createOscillator();
      const envelope = audio.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = frequency;
      const from = start + at;
      envelope.gain.setValueAtTime(0.0001, from);
      envelope.gain.exponentialRampToValueAtTime(gain * MASTER_GAIN, from + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, from + duration);
      oscillator.connect(envelope).connect(audio.destination);
      oscillator.start(from);
      oscillator.stop(from + duration + 0.03);
    }
  } catch {
    // Audio is decoration: never let it break a round.
  }
}
