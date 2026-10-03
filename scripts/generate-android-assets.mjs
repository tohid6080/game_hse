#!/usr/bin/env node
/**
 * Draws the launcher icon and the splash screen of the Android app from the shield mark in
 * public/icon.svg. Run `npm run assets:android` after changing the mark, then commit the PNGs.
 *
 * Uses the same Chromium as the E2E tests (CHROMIUM_PATH, or `npx playwright-core install chromium`).
 * The artwork carries no text on purpose: the app's name is not final, and the name is set in
 * Android's own label (strings.xml) anyway.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const res = join(root, 'android/app/src/main/res');
const NAVY = '#031b36';

const svg = readFileSync(join(root, 'public/icon.svg'), 'utf8');
// The mark inside the 64×64 viewBox spans y 4..60 (56 tall), x 8..56 (48 wide).
const MARK_RATIO = 56 / 64;
const mark = (heightPx) => svg.replace('<svg ', `<svg style="height:${heightPx}px;width:${heightPx}px;display:block" `);

const exe = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(
  (path) => path && existsSync(path),
);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage();

/** Renders `inner` centred on a `width`×`height` canvas and writes a PNG (transparent where `background` is null). */
async function draw(file, width, height, { background = null, radius = '0', markHeight }) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;background:transparent}
      .c{width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;
         background:${background ?? 'transparent'};border-radius:${radius};overflow:hidden}
    </style><div class="c">${mark(markHeight / MARK_RATIO)}</div>`,
  );
  const target = join(res, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, await page.screenshot({ omitBackground: true, type: 'png' }));
}

const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
let written = 0;
for (const [name, scale] of Object.entries(DENSITY)) {
  // Adaptive icon foreground: a 108dp canvas of which only the inner ~66dp is always visible.
  const layer = 108 * scale;
  await draw(`mipmap-${name}/ic_launcher_foreground.png`, layer, layer, { markHeight: 54 * scale });
  // Pre-Android-8 icons: a rounded square and a circle, 48dp.
  const legacy = 48 * scale;
  await draw(`mipmap-${name}/ic_launcher.png`, legacy, legacy, { background: NAVY, radius: '22%', markHeight: legacy * 0.7 });
  await draw(`mipmap-${name}/ic_launcher_round.png`, legacy, legacy, { background: NAVY, radius: '50%', markHeight: legacy * 0.62 });
  written += 3;
}

// Splash screens: the navy of the app with the mark in the middle (scaled CENTER_INSIDE by the plugin).
const SPLASH = {
  'drawable-port-mdpi': [320, 480],
  'drawable-port-hdpi': [480, 800],
  'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600],
  'drawable-port-xxxhdpi': [1280, 1920],
  'drawable-land-mdpi': [480, 320],
  'drawable-land-hdpi': [800, 480],
  'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960],
  'drawable-land-xxxhdpi': [1920, 1280],
  drawable: [480, 320],
};
for (const [dir, [width, height]] of Object.entries(SPLASH)) {
  await draw(`${dir}/splash.png`, width, height, { background: NAVY, markHeight: Math.min(width, height) * 0.3 });
  written += 1;
}

await browser.close();
console.log(`Wrote ${written} images under android/app/src/main/res.`);
