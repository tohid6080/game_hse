/**
 * Elapsed time that does not run while paused. The clock is passed in (never read here), so the
 * logic is plain data in, data out and tests need no fake timers.
 */
export interface Stopwatch {
  /** Millisecond timestamp of the (re)start. */
  startedAt: number;
  /** Total time spent paused since the start. */
  pausedTotal: number;
  /** When the current pause began, or null while running. */
  pausedAt: number | null;
}

export function startStopwatch(now: number): Stopwatch {
  return { startedAt: now, pausedTotal: 0, pausedAt: null };
}

export function pauseStopwatch(watch: Stopwatch, now: number): Stopwatch {
  return watch.pausedAt === null ? { ...watch, pausedAt: now } : watch;
}

export function resumeStopwatch(watch: Stopwatch, now: number): Stopwatch {
  if (watch.pausedAt === null) return watch;
  return { ...watch, pausedTotal: watch.pausedTotal + Math.max(0, now - watch.pausedAt), pausedAt: null };
}

/** Time that counted: while paused the value stays where it was when the pause began. */
export function elapsedOf(watch: Stopwatch, now: number): number {
  return Math.max(0, (watch.pausedAt ?? now) - watch.startedAt - watch.pausedTotal);
}
