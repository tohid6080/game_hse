import { create } from 'zustand';
import { dailyProgress, type DailyProgress } from '@/domain/daily';
import { levelProgress, type LevelProgress } from '@/domain/levels';
import { computeStreak, dayKey, type StreakInfo } from '@/domain/streak';
import { repos } from '@/storage/repositories';
import { useProfileStore } from './profileStore';

interface ProgressState {
  /** Profile the numbers belong to — guards against showing a previous profile's XP. */
  profileId: string | null;
  xp: number;
  streak: StreakInfo;
  daily: DailyProgress;
  loaded: boolean;
  /** Recomputes everything from the attempt log (the source of truth), for today's date. */
  refresh: (profileId: string | null) => Promise<void>;
}

function derive(attempts: Awaited<ReturnType<ReturnType<typeof repos>['attempts']['listAll']>>, now: number) {
  return {
    xp: attempts.reduce((total, attempt) => total + attempt.xp, 0),
    streak: computeStreak(
      attempts.map((attempt) => attempt.finishedAt),
      now,
    ),
    daily: dailyProgress(dayKey(now), attempts),
  };
}

export const useProgressStore = create<ProgressState>((set) => ({
  profileId: null,
  loaded: false,
  ...derive([], Date.now()),

  async refresh(profileId) {
    if (!profileId) {
      set({ profileId: null, loaded: true, ...derive([], Date.now()) });
      return;
    }
    try {
      const attempts = await repos().attempts.listAll(profileId);
      set({ profileId, loaded: true, ...derive(attempts, Date.now()) });
    } catch {
      set({ profileId, loaded: true, ...derive([], Date.now()) });
    }
  },
}));

/**
 * Numbers of the *active* profile. Right after a profile switch the store still holds the previous
 * profile's numbers until `refresh` finishes, so a mismatch reads as empty instead of leaking them.
 */
function useActive<T>(pick: (state: ProgressState) => T, empty: T): T {
  const activeId = useProfileStore((state) => state.activeId);
  return useProgressStore((state) => (state.profileId === activeId ? pick(state) : empty));
}

export function useActiveXp(): number {
  return useActive((state) => state.xp, 0);
}

export function useLevelProgress(): LevelProgress {
  return levelProgress(useActiveXp());
}

const EMPTY_STREAK = computeStreak([], Date.now());
const EMPTY_DAILY = dailyProgress(dayKey(Date.now()), []);

export function useActiveStreak(): StreakInfo {
  return useActive((state) => state.streak, EMPTY_STREAK);
}

export function useActiveDaily(): DailyProgress {
  return useActive((state) => state.daily, EMPTY_DAILY);
}
