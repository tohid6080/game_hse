import { useEffect, useState } from 'react';
import { loadEmergencyPack } from '@/content/loader';
import type { EmergencyPack } from '@/content/schema';
import { getLocale } from '@/i18n';

let cached: Promise<EmergencyPack> | undefined;

/** The pack is a bundled module: load once per session, retry if the load ever failed. */
export function loadEmergencyBank(): Promise<EmergencyPack> {
  cached ??= loadEmergencyPack(getLocale().code).catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}

export function useEmergencyBank(): { pack: EmergencyPack | null; failed: boolean } {
  const [pack, setPack] = useState<EmergencyPack | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadEmergencyBank().then(
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
