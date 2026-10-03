import { useCallback, useEffect, useRef, useState } from 'react';
import { onAppActiveChange } from '@/platform/native';
import { elapsedOf, pauseStopwatch, resumeStopwatch, startStopwatch, type Stopwatch } from './stopwatch';

interface TimerOptions {
  /** Timed mode switched on in settings. */
  enabled: boolean;
  /** True while the player is actually answering (not while reading feedback). */
  active: boolean;
  limitMs: number;
  /** Changes with every new item so the countdown restarts. */
  resetKey: number;
  onExpire: () => void;
}

/**
 * Per-item countdown for the timed mode. `elapsedMs()` works in untimed mode too (speed is only
 * rewarded when a limit applies). Call `restart()` from an event handler when a new item starts.
 *
 * The clock stops while the app is in the background (a phone call, a notification, the home
 * button): coming back must never cost the player time they did not have.
 */
export function useQuestionTimer({ enabled, active, limitMs, resetKey, onExpire }: TimerOptions) {
  const watchRef = useRef<Stopwatch>(startStopwatch(0));
  const foregroundRef = useRef(true);
  const [remainingMs, setRemainingMs] = useState(limitMs);

  // The interval must always call the latest callback (it closes over fresh round state).
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(
    () =>
      onAppActiveChange((visible) => {
        foregroundRef.current = visible;
        const now = performance.now();
        watchRef.current = visible ? resumeStopwatch(watchRef.current, now) : pauseStopwatch(watchRef.current, now);
      }),
    [],
  );

  const restart = useCallback(() => {
    const now = performance.now();
    const fresh = startStopwatch(now);
    watchRef.current = foregroundRef.current ? fresh : pauseStopwatch(fresh, now);
    setRemainingMs(limitMs);
  }, [limitMs]);

  const elapsedMs = useCallback(() => elapsedOf(watchRef.current, performance.now()), []);

  useEffect(() => {
    if (!enabled || !active) return;
    const timer = window.setInterval(() => {
      const left = limitMs - elapsedOf(watchRef.current, performance.now());
      if (left <= 0) {
        window.clearInterval(timer);
        setRemainingMs(0);
        onExpireRef.current();
      } else {
        setRemainingMs(left);
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [enabled, active, limitMs, resetKey]);

  return { remainingMs, restart, elapsedMs };
}
