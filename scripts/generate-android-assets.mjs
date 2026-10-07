#!/usr/bin/env node
/**
 * Draws the launcher icon, the splash screen and the favicon from the brand logo, branding/logo.svg.
 * Run `npm run assets:android` after changing the logo, then commit the PNGs it writes.
 *
 * The logo is a full lockup (emblem + "IHMS GAMES" + tagline + three small labels) on a white backdrop.
 *  - Launcher icons and the favicon use the EMBLEM only: the writing is unreadable at 48px.
 *  - The splash screen uses the whole lockup, which is big enough there.
 *
 * Uses the same Chromium as the E2E tests (CHROMIUM_PATH, or `npx playwright-core install chromium`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const res = join(root, 'android/app/src/main/res');

/** The logo's own backdrop (the first path of the traced SVG is a rectangle of exactly this colour). */
const WHITE = '#fdfdfd';
/** The part of the 1000×1000 artwork that holds the emblem and none of the text below it. */
const EMBLEM = { x: 120, y: 30, width: 760, height: 640 };

const source = readFileSync(join(root, 'branding/logo.svg'), 'utf8');
const ROOT_ATTRS = 'width="1000" height="1000" viewBox="0 0 1000 1000"';
if (!source.includes(ROOT_ATTRS)) throw new Error(`branding/logo.svg must start with <svg ${ROOT_ATTRS}> (a 1000×1000 artboard).`);

/** The artwork at `widthPx`, showing only the `view` rectangle of the artboard. */
function artwork(view, widthPx) {
  const heightPx = (widthPx * view.height) / view.width;
  return source.replace(ROOT_ATTRS, `width="${widthPx}" height="${heightPx}" viewBox="${view.x} ${view.y} ${view.width} ${view.height}"`);
}
const FULL = { x: 0, y: 0, width: 1000, height: 1000 };

const exe = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(
  (path) => path && existsSync(path),
);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage();

/** Centres `markup` on a `width`×`height` canvas and writes it as a PNG, to `target` (absolute path). */
async function draw(target, width, height, markup, { radius = '0' } = {}) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;background:transparent}
      .c{width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;
         background:${WHITE};border-radius:${radius};overflow:hidden}
      svg{display:block}
    </style><div class="c">${markup}</div>`,
  );
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, await page.screenshot({ omitBackground: true, type: 'png' }));
}
const inRes = (file) => join(res, file);

const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
let written = 0;
for (const [name, scale] of Object.entries(DENSITY)) {
  // Adaptive icon foreground: a 108dp canvas of which only the inner ~66dp circle is always visible.
  // The emblem is roughly round, so 64dp wide keeps its circle inside that.
  const layer = 108 * scale;
  await draw(inRes(`mipmap-${name}/ic_launcher_foreground.png`), layer, layer, artwork(EMBLEM, 64 * scale));
  // Pre-Android-8 icons: a rounded square and a circle, 48dp.
  const legacy = 48 * scale;
  await draw(inRes(`mipmap-${name}/ic_launcher.png`), legacy, legacy, artwork(EMBLEM, legacy * 0.86), { radius: '22%' });
  await draw(inRes(`mipmap-${name}/ic_launcher_round.png`), legacy, legacy, artwork(EMBLEM, legacy * 0.72), { radius: '50%' });
  written += 3;
}

// Splash screens: the whole lockup on the logo's white (scaled CENTER_INSIDE by the splash plugin).
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
  await draw(inRes(`${dir}/splash.png`), width, height, artwork(FULL, Math.round(Math.min(width, height) * 0.74)));
  written += 1;
}

// The browser/web favicon (the Android app itself never shows it).
await draw(join(root, 'public/favicon.png'), 192, 192, artwork(EMBLEM, 176));
written += 1;

await browser.close();
console.log(`Wrote ${written} images (android/app/src/main/res and public/favicon.png).`);
