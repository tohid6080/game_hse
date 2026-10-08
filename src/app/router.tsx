import { Loader } from 'lucide-react';
import { Navigate, createHashRouter, type RouteObject } from 'react-router-dom';
import { t } from '@/i18n';
import { HomePage } from '@/pages/HomePage';
import { AppShell } from './AppShell';
import { FocusLayout } from './FocusLayout';
import { RootLayout } from './RootLayout';

/**
 * Everything except the shell and Home is loaded on first visit: the main bundle stays small and
 * the app starts faster on an old phone. The chunks are local files, so this works offline; the
 * router waits for a chunk before it switches screens, so there is no blank flash between pages.
 * (`lazy` takes named exports, which is why each entry names its component.)
 */
const screen = (load: () => Promise<Record<string, unknown>>, name: string): Pick<RouteObject, 'lazy'> => ({
  lazy: async () => ({ Component: (await load())[name] as RouteObject['Component'] }),
});

/** Shown only when the app is opened straight onto a lazy screen (e.g. a restored `#/progress`). */
function StartupFallback() {
  return (
    <div role="status" style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', gap: 12 }}>
      <Loader size={28} aria-hidden="true" />
      <p>{t('quiz.play.loading')}</p>
    </div>
  );
}

/**
 * Development-only tools. `import.meta.env.DEV` is a build-time constant, so in a production build
 * this array is empty and the editor module is not part of the bundle (scripts/verify-offline.mjs
 * and the E2E check that).
 */
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: 'dev/hazard-editor', ...screen(() => import('@/dev/HazardEditor'), 'HazardEditor') }]
  : [];

/**
 * A *data* router (createHashRouter) so gameplay can block navigation with `useBlocker` and ask
 * before abandoning a round. Hash-based: the bundle is served from a static local origin with no
 * server-side route fallback.
 */
export const router = createHashRouter([
  {
    element: <RootLayout />,
    HydrateFallback: StartupFallback,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'games', ...screen(() => import('@/pages/GamesPage'), 'GamesPage') },
          { path: 'games/quiz', ...screen(() => import('@/games/quiz/QuizHub'), 'QuizHub') },
          { path: 'games/hazard', ...screen(() => import('@/games/hazard/HazardHub'), 'HazardHub') },
          { path: 'games/risk', ...screen(() => import('@/games/risk/RiskHub'), 'RiskHub') },
          { path: 'games/permit', ...screen(() => import('@/games/permit/PermitHub'), 'PermitHub') },
          { path: 'games/emergency', ...screen(() => import('@/games/emergency/EmergencyHub'), 'EmergencyHub') },
          { path: 'games/bowtie', ...screen(() => import('@/games/bowtie/BowtieHub'), 'BowtieHub') },
          { path: 'daily', ...screen(() => import('@/pages/DailyPage'), 'DailyPage') },
          { path: 'progress', ...screen(() => import('@/pages/ProgressPage'), 'ProgressPage') },
          { path: 'settings', ...screen(() => import('@/pages/SettingsPage'), 'SettingsPage') },
        ],
      },
      {
        element: <FocusLayout />,
        children: [
          { path: 'games/quiz/play', ...screen(() => import('@/games/quiz/QuizPlay'), 'QuizPlay') },
          { path: 'games/hazard/play', ...screen(() => import('@/games/hazard/HazardPlay'), 'HazardPlay') },
          { path: 'games/risk/play', ...screen(() => import('@/games/risk/RiskPlay'), 'RiskPlay') },
          { path: 'games/permit/play', ...screen(() => import('@/games/permit/PermitPlay'), 'PermitPlay') },
          { path: 'games/emergency/play', ...screen(() => import('@/games/emergency/EmergencyPlay'), 'EmergencyPlay') },
          { path: 'games/bowtie/play', ...screen(() => import('@/games/bowtie/BowtiePlay'), 'BowtiePlay') },
        ],
      },
      ...devRoutes,
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
