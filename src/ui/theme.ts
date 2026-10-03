import { setStatusBarForTheme } from '@/platform/native';
import type { ThemePref } from '@/storage/db';

const LIGHT_QUERY = '(prefers-color-scheme: light)';

/** Dark is the default look; the system only switches it to light when it asks for light. */
export function resolveIsDark(pref: ThemePref): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return !window.matchMedia(LIGHT_QUERY).matches;
}

/** 'system' removes the attribute so tokens.css follows prefers-color-scheme. */
export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
  void setStatusBarForTheme(resolveIsDark(pref));
}

/** Re-applies the theme when the OS scheme flips while the preference is 'system'. */
export function watchSystemTheme(getPref: () => ThemePref): void {
  window.matchMedia(LIGHT_QUERY).addEventListener('change', () => {
    if (getPref() === 'system') applyTheme('system');
  });
}
