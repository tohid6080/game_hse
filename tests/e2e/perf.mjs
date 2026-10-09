// Low-end phone simulation: the production build in a real Chromium whose CPU is slowed down
// (Chrome DevTools "CPU throttling"), measuring how long the player waits.
//
//   npm run perf
//
// A 4× slowdown is roughly a budget phone from a few years ago; 6× is the worst case we aim to stay
// usable on. The numbers are printed so they can be compared between builds; the budgets below are
// deliberately loose (shared CI machines vary), they only catch a real regression such as the
// whole app being loaded up front again.
//
// Needs a Chromium: set CHROMIUM_PATH, or run `npx playwright-core install chromium` once.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const server = await preview({ root, preview: { port: 4174, strictPort: true, open: false } });
const BASE = server.resolvedUrls?.local[0] ?? 'http://localhost:4174/';
const exe = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(
  (path) => path && existsSync(path),
);

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// The entry bundle is what every launch must download, parse and run before the first screen.
const assets = fileURLToPath(new URL('../../dist/assets/', import.meta.url));
const entry = readdirSync(assets)
  .filter((file) => /^index-.*\.js$/.test(file))
  .map((file) => ({ file, kb: statSync(`${assets}${file}`).size / 1024 }))
  .sort((a, b) => b.kb - a.kb)[0];
check('the entry bundle stays small (lazy screens are split out)', entry.kb < 450, `${entry.file}: ${entry.kb.toFixed(0)} KB`);

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

async function run(rate) {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const timings = {};
  const time = async (name, action) => {
    const started = Date.now();
    await action();
    timings[name] = Date.now() - started;
  };
  const btn = (name) => page.getByRole('button', { name, exact: true });

  await time('cold start → welcome screen', async () => {
    await page.goto(BASE);
    await page.getByRole('heading', { name: 'به IHMS Shield خوش آمدی' }).waitFor();
  });
  await btn('بزن بریم').click();
  await page.getByLabel('نام مستعار').fill('علی');
  await btn('ادامه').click();
  await time('finish onboarding → home', async () => {
    await btn('شروع').click();
    await page.getByText('سلام علی!').waitFor();
  });
  await time('warm start (reload) → home', async () => {
    await page.reload();
    await page.getByText('سلام علی!').waitFor();
  });
  await time('home → quiz hub', async () => {
    await page.getByRole('link', { name: /ادامه‌ی تمرین/ }).click();
    await page.locator('main a[href*="mode=topic"]').first().waitFor();
  });
  await time('quiz hub → first question', async () => {
    await page.getByRole('link', { name: /آزمون ترکیبی/ }).click();
    await page.locator('[aria-label^="سپر:"]').waitFor();
    await page.locator('main h2').first().waitFor();
  });
  await page.getByRole('button', { name: 'خروج از دور' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'خروج', exact: true }).click();
  await page.getByRole('heading', { name: 'آزمون HSE', level: 1 }).waitFor();
  await page.locator('nav').getByRole('link', { name: 'بازی‌ها', exact: true }).click();
  await time('games → hazard hub → scene (picture decoded)', async () => {
    await page.getByRole('link', { name: /خطر را پیدا کن/ }).click();
    await btn('شروع صحنه').waitFor();
    await btn('شروع صحنه').click();
    await page.getByTestId('scene-frame').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid=scene-frame] img')?.complete === true);
  });

  // Dragging a zoomed picture must keep up with a finger: count animation frames while panning.
  const frame = await page.getByTestId('scene-frame').boundingBox();
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(200);
  // Counts frames over one second while the drag below is under way.
  const dragFrames = page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const started = performance.now();
        const tick = (now) => {
          frames += 1;
          if (now - started < 1000) requestAnimationFrame(tick);
          else resolve(frames);
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.mouse.move(frame.x + 60, frame.y + 60);
  await page.mouse.down();
  for (let i = 0; i < 40; i += 1) {
    await page.mouse.move(frame.x + 60 + i * 4, frame.y + 60 + i * 3);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  timings['frames per second while dragging the zoomed picture'] = await dragFrames;

  await context.close();
  return timings;
}

// Loose ceilings in milliseconds, per slowdown (they scale with the throttle).
const BUDGET = { 4: 4500, 6: 7000 };
for (const rate of [1, 4, 6]) {
  const timings = await run(rate);
  console.log(`\n── CPU ${rate}× slower ──`);
  for (const [name, value] of Object.entries(timings)) {
    const isFps = name.startsWith('frames');
    const detail = isFps ? `${value} fps` : `${value} ms`;
    if (rate === 1 || isFps) {
      console.log(`  ${name}: ${detail}`);
      continue;
    }
    check(`${rate}× slower: ${name}`, value <= BUDGET[rate], detail);
  }
  if (rate > 1) check(`${rate}× slower: dragging the zoomed picture stays above 20 frames/s`, timings['frames per second while dragging the zoomed picture'] >= 20, `${timings['frames per second while dragging the zoomed picture']} fps`);
}

await browser.close();
await server.close();
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
