import { describe, expect, it } from 'vitest';
import { elapsedOf, pauseStopwatch, resumeStopwatch, startStopwatch } from './stopwatch';

describe('stopwatch', () => {
  it('counts time while running', () => {
    const watch = startStopwatch(1_000);
    expect(elapsedOf(watch, 1_000)).toBe(0);
    expect(elapsedOf(watch, 4_500)).toBe(3_500);
  });

  it('stands still while paused', () => {
    const paused = pauseStopwatch(startStopwatch(0), 2_000);
    expect(elapsedOf(paused, 2_000)).toBe(2_000);
    expect(elapsedOf(paused, 60_000)).toBe(2_000);
  });

  it('continues from where it stopped, without the time spent paused', () => {
    let watch = startStopwatch(0);
    watch = pauseStopwatch(watch, 2_000);
    watch = resumeStopwatch(watch, 32_000);
    expect(elapsedOf(watch, 32_000)).toBe(2_000);
    expect(elapsedOf(watch, 35_000)).toBe(5_000);
  });

  it('adds up several pauses', () => {
    let watch = startStopwatch(0);
    watch = resumeStopwatch(pauseStopwatch(watch, 1_000), 11_000);
    watch = resumeStopwatch(pauseStopwatch(watch, 13_000), 20_000);
    expect(elapsedOf(watch, 21_000)).toBe(1_000 + 2_000 + 1_000);
  });

  it('ignores a second pause, a resume without a pause, and a backwards clock', () => {
    const paused = pauseStopwatch(startStopwatch(0), 1_000);
    expect(pauseStopwatch(paused, 5_000)).toBe(paused);
    const running = startStopwatch(0);
    expect(resumeStopwatch(running, 5_000)).toBe(running);
    expect(elapsedOf(running, -10)).toBe(0);
    expect(elapsedOf(resumeStopwatch(paused, 500), 2_000)).toBeGreaterThanOrEqual(0);
  });
});
