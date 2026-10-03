import { useEffect, useState } from 'react';
import { loadRiskPack } from '@/content/loader';
import type { RiskPack } from '@/content/schema';
import { getLocale } from '@/i18n';

let cached: Promise<RiskPack> | undefined;

/** The pack is a bundled module: load once per session, retry if the load ever failed. */
export function loadRiskBank(): Promise<RiskPack> {
  cached ??= loadRiskPack(getLocale().code).catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}

export function useRiskBank(): { pack: RiskPack | null; failed: boolean } {
  const [pack, setPack] = useState<RiskPack | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadRiskBank().then(
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
