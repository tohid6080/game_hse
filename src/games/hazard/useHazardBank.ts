import { useEffect, useState } from 'react';
import { loadHazardPack } from '@/content/loader';
import type { HazardPack } from '@/content/schema';
import { getLocale } from '@/i18n';

let cached: Promise<HazardPack> | undefined;

/** The pack is a bundled module: load once per session, retry if the load ever failed. */
export function loadHazardBank(): Promise<HazardPack> {
  cached ??= loadHazardPack(getLocale().code).catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}

export function useHazardBank(): { pack: HazardPack | null; failed: boolean } {
  const [pack, setPack] = useState<HazardPack | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadHazardBank().then(
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
