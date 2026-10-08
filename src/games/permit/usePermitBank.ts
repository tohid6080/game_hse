import { useEffect, useState } from 'react';
import { loadPermitPack } from '@/content/loader';
import type { PermitPack } from '@/content/schema';
import { getLocale } from '@/i18n';

let cached: Promise<PermitPack> | undefined;

/** The pack is a bundled module: load once per session, retry if the load ever failed. */
export function loadPermitBank(): Promise<PermitPack> {
  cached ??= loadPermitPack(getLocale().code).catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}

export function usePermitBank(): { pack: PermitPack | null; failed: boolean } {
  const [pack, setPack] = useState<PermitPack | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadPermitBank().then(
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
