import type { CapacitorConfig } from '@capacitor/cli';

// Working name / appId — both are placeholders until the brand is finalized.
// NOTE: changing appId after a release installs as a *different* app on the device.
const BRAND_BG = '#031b36';

const config: CapacitorConfig = {
  appId: 'app.hsequest.separ',
  appName: 'IHMS Shield',
  webDir: 'dist',
  backgroundColor: BRAND_BG,
  loggingBehavior: 'none',
  // Never add `server.url` (live reload) to a shipped build: scripts/verify-offline.mjs rejects it.
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      // Hidden explicitly from src/main.tsx once settings are loaded (see platform/native.ts).
      launchAutoHide: false,
      // The logo is drawn on white (branding/logo.svg), so the splash is white all the way to the edges.
      backgroundColor: '#fdfdfd',
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
    },
    LocalNotifications: {
      // White silhouette in android/app/src/main/res/drawable (see platform/reminders.ts).
      smallIcon: 'ic_stat_separ',
    },
  },
};

export default config;
