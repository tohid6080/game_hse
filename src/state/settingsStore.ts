import { create } from 'zustand';
import { DEFAULT_REMINDER_TIME } from '@/domain/reminder';
import type { SettingsMap, ThemePref } from '@/storage/db';
import { repos } from '@/storage/repositories';
import { applyTheme } from '@/ui/theme';

type Preferences = Pick<SettingsMap, 'theme' | 'timedMode' | 'soundEnabled' | 'hapticsEnabled' | 'reminderEnabled' | 'reminderTime'>;

interface SettingsState extends Preferences {
  /** Local storage failed this session (private mode, cleared site data…): changes are temporary. */
  storageError: boolean;
  load: () => Promise<void>;
  setTheme: (theme: ThemePref) => Promise<void>;
  setTimedMode: (timedMode: boolean) => Promise<void>;
  setSoundEnabled: (enabled: boolean) => Promise<void>;
  setHapticsEnabled: (enabled: boolean) => Promise<void>;
  setReminderEnabled: (enabled: boolean) => Promise<void>;
  setReminderTime: (time: string) => Promise<void>;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  timedMode: false,
  soundEnabled: false,
  hapticsEnabled: true,
  reminderEnabled: false,
  reminderTime: DEFAULT_REMINDER_TIME,
};

export const useSettingsStore = create<SettingsState>((set, get) => {
  /** Applies a preference at once, then saves it; a storage failure only marks the session. */
  async function persist<K extends keyof Preferences>(key: K, value: SettingsMap[K]): Promise<void> {
    set({ [key]: value } as unknown as Pick<Preferences, K>);
    try {
      await repos().settings.set(key, value);
    } catch {
      set({ storageError: true });
    }
  }

  return {
    ...DEFAULT_PREFERENCES,
    storageError: false,

    async load() {
      try {
        const keys = Object.keys(DEFAULT_PREFERENCES) as Array<keyof Preferences>;
        const values = await Promise.all(keys.map((key) => repos().settings.get(key)));
        set(Object.fromEntries(keys.map((key, index) => [key, values[index] ?? DEFAULT_PREFERENCES[key]])) as Preferences);
      } catch {
        set({ storageError: true });
      }
      applyTheme(get().theme);
    },

    async setTheme(theme) {
      applyTheme(theme);
      await persist('theme', theme);
    },
    setTimedMode: (timedMode) => persist('timedMode', timedMode),
    setSoundEnabled: (enabled) => persist('soundEnabled', enabled),
    setHapticsEnabled: (enabled) => persist('hapticsEnabled', enabled),
    setReminderEnabled: (enabled) => persist('reminderEnabled', enabled),
    setReminderTime: (time) => persist('reminderTime', time),
  };
});
