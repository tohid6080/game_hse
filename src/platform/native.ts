import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

/** Thin wrappers over Capacitor so the rest of the app never imports plugins directly. */

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Light status-bar icons on dark backgrounds and vice versa. No-op in the browser. */
export async function setStatusBarForTheme(isDark: boolean): Promise<void> {
  if (!isNative()) return;
  try {
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
  } catch {
    // Purely cosmetic; never block the app on it.
  }
}

/** The splash is configured with launchAutoHide:false; always call this once the UI is ready. */
export async function hideSplash(): Promise<void> {
  if (!isNative()) return;
  try {
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {
    // Nothing useful to do if the splash is already gone.
  }
}

/**
 * Calls `callback(true)` when the app comes to the foreground and `callback(false)` when it leaves
 * it (Android pause/resume, or the browser tab becoming hidden/visible). Returns the function that
 * stops listening.
 */
export function onAppActiveChange(callback: (active: boolean) => void): () => void {
  if (isNative()) {
    const handle = App.addListener('appStateChange', ({ isActive }) => callback(isActive));
    return () => {
      void handle.then((listener) => listener.remove());
    };
  }
  const onVisibility = () => callback(document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', onVisibility);
  return () => document.removeEventListener('visibilitychange', onVisibility);
}

/** Calls `callback` whenever the app comes back to the foreground. */
export function onAppResume(callback: () => void): () => void {
  return onAppActiveChange((active) => {
    if (active) callback();
  });
}
