import { useEffect, useState } from 'react';
import { loadQuizPack } from '@/content/loader';
import type { QuizPack } from '@/content/schema';
import { getLocale } from '@/i18n';

let cached: Promise<QuizPack> | undefined;

/** The pack is a bundled module: load once per session, retry if the load ever failed. */
export function loadBank(): Promise<QuizPack> {
  cached ??= loadQuizPack(getLocale().code).catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}

export function useQuizBank(): { pack: QuizPack | null; failed: boolean } {
  const [pack, setPack] = useState<QuizPack | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadBank().then(
      (loaded) => {
        if (!cancelled) setPack(loaded);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return { pack, failed };
}
