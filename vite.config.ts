import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

/**
 * Is any bundled content still a draft? The app says so in Settings until the expert review is done,
 * and `npm run verify:release` refuses a final build while this is true (docs/REVIEW.md).
 */
function contentIsUnreviewed(): boolean {
  const packs = new URL('./src/content/packs/', import.meta.url);
  return readdirSync(packs).some((locale) =>
    ['quiz.json:questions', 'risk.json:scenarios', 'hazard.json:scenes', 'permit.json:permits', 'emergency.json:cases'].some((entry) => {
      const [file, key] = entry.split(':') as [string, string];
      try {
        const pack = JSON.parse(readFileSync(new URL(`${locale}/${file}`, packs), 'utf-8')) as Record<string, { reviewStatus: string }[]>;
        return (pack[key] ?? []).some((item) => item.reviewStatus !== 'reviewed');
      } catch {
        return false; // a locale without that game's pack
      }
    }),
  );
}

/**
 * Production-only Content-Security-Policy. The app never talks to the network, so
 * `connect-src` stays on 'self' (the in-process Capacitor origin) and nothing external is allowed.
 * TODO(device-test): tighten `connect-src` to 'none' once verified on a real device that
 * Capacitor's WebView needs no same-origin fetch. The hard guarantee is the missing INTERNET
 * permission in AndroidManifest.xml (see scripts/verify-offline.mjs).
 * Not applied in dev: Vite HMR needs inline scripts and a websocket.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'hse-quest:csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [react(), cspPlugin()],
  // Relative base: the bundle is served from the Capacitor local origin, not a domain root.
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __CONTENT_UNREVIEWED__: JSON.stringify(contentIsUnreviewed()) },
  build: {
    // Older Android System WebViews are common; keep output conservative. Final minimum is a
    // Phase 4 decision made with real-device tests.
    target: 'chrome90',
    cssTarget: 'chrome90',
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'tests/**/*.test.mjs'],
    environment: 'node',
  },
});
