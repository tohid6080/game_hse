import { useEffect, useState } from 'react';
import { loadBowtiePack } from '@/content/loader';
import type { BowtiePack } from '@/content/schema';
import { getLocale } from '@/i18n';

let cached: Promise<BowtiePack> | undefined;

/** The pack is a bundled module: load once per session, retry if the load ever failed. */
export function loadBowtieBank(): Promise<BowtiePack> {
  cached ??= loadBowtiePack(getLocale().code).catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}

export function useBowtieBank(): { pack: BowtiePack | null; failed: boolean } {
  const [pack, setPack] = useState<BowtiePack | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadBowtieBank().then(
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
