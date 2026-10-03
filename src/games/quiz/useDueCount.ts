import { useEffect, useState } from 'react';
import { selectActiveProfile, useProfileStore } from '@/state/profileStore';
import { useActiveXp } from '@/state/progressStore';
import { repos } from '@/storage/repositories';
import { dueQuestions } from './engine';
import { loadBank } from './useQuizBank';

/**
 * How many quiz questions are due for spaced-repetition review for the active profile.
 * Re-reads when XP changes, i.e. right after a round was recorded.
 */
export function useDueCount(): number {
  const profile = useProfileStore(selectActiveProfile);
  const xp = useActiveXp();
  const [count, setCount] = useState(0);
  const profileId = profile?.id;
  const industry = profile?.industry ?? 'general';

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    Promise.all([loadBank(), repos().questionStats.getAll(profileId)])
      .then(([bank, stats]) => {
        if (!cancelled) setCount(dueQuestions(bank.questions, stats, Date.now(), industry).length);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, industry, xp]);

  return count;
}
