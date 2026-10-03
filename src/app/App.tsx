import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { onAppResume } from '@/platform/native';
import { Onboarding } from '@/profile/Onboarding';
import { syncReminders } from '@/reminders/reminderService';
import { selectActiveProfile, useProfileStore } from '@/state/profileStore';
import { useProgressStore } from '@/state/progressStore';
import { router } from './router';

export function App() {
  const activeProfile = useProfileStore(selectActiveProfile);
  const activeId = activeProfile?.id ?? null;

  // XP always belongs to the active profile; re-derive it whenever the profile changes.
  useEffect(() => {
    void useProgressStore.getState().refresh(activeId);
  }, [activeId]);

  // Back from the background (maybe on a new day): recompute today's progress and re-plan reminders.
  useEffect(
    () =>
      onAppResume(() => {
        void useProgressStore
          .getState()
          .refresh(useProfileStore.getState().activeId)
          .then(syncReminders);
      }),
    [],
  );

  // No profile yet (first launch, or the last one was deleted): the first-run flow creates one.
  if (!activeProfile) return <Onboarding />;
  return <RouterProvider router={router} />;
}
