import { describe, expect, it } from 'vitest';
import { SOUNDS, type SoundKind } from './sounds';

const kinds = Object.keys(SOUNDS) as SoundKind[];

describe('sound effects', () => {
  it('every effect has notes in the audible, pleasant range', () => {
    for (const kind of kinds) {
      expect(SOUNDS[kind].length, kind).toBeGreaterThan(0);
      for (const note of SOUNDS[kind]) {
        expect(note.frequency, kind).toBeGreaterThanOrEqual(60);
        expect(note.frequency, kind).toBeLessThanOrEqual(2000);
        expect(note.duration, kind).toBeGreaterThan(0);
        expect(note.at, kind).toBeGreaterThanOrEqual(0);
        expect(note.gain, kind).toBeGreaterThan(0);
        expect(note.gain, kind).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps every effect short: a result sound never makes the player wait', () => {
    for (const kind of kinds) {
      const end = Math.max(...SOUNDS[kind].map((note) => note.at + note.duration));
      expect(end, kind).toBeLessThan(1.2);
    }
  });

  it('rises for good news and falls for the shield breaking', () => {
    const first = (kind: SoundKind) => SOUNDS[kind][0]!.frequency;
    const last = (kind: SoundKind) => SOUNDS[kind].at(-1)!.frequency;
    for (const kind of ['correct', 'found', 'complete', 'levelUp', 'medal'] as const) expect(last(kind), kind).toBeGreaterThan(first(kind));
    expect(last('shield')).toBeLessThan(first('shield'));
  });
});
