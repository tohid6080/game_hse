import '@fontsource-variable/vazirmatn/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { applyLocale } from '@/i18n';
import { hideSplash } from '@/platform/native';
import { syncReminders } from '@/reminders/reminderService';
import { selectActiveProfile, useProfileStore } from '@/state/profileStore';
import { useProgressStore } from '@/state/progressStore';
import { useSettingsStore } from '@/state/settingsStore';
import { watchSystemTheme } from '@/ui/theme';
import '@/ui/tokens.css';
import '@/ui/global.css';

async function start(): Promise<void> {
  applyLocale();
  try {
    // Settings (theme), profiles and XP load before first paint: no flash of the wrong theme,
    // and no flash of the onboarding screen for returning players.
    await useSettingsStore.getState().load();
    await useProfileStore.getState().load();
    await useProgressStore.getState().refresh(selectActiveProfile(useProfileStore.getState())?.id ?? null);
    watchSystemTheme(() => useSettingsStore.getState().theme);
    void syncReminders();

    const container = document.getElementById('root');
    if (!container) throw new Error('Missing #root element');
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } finally {
    // Always release the native splash, even if startup failed, so the app never hangs on it.
    await hideSplash();
  }
}

void start();
