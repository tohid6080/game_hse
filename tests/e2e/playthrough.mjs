// End-to-end playthrough of the app in a real Chromium, against the production build.
//
//   npm run e2e
//
// It serves dist/ with Vite's preview server, reads the real question bank, and plays like a user:
// onboarding, all four question types, a broken shield, weak-spot review, leaving a round, hints,
// profiles, the timed mode and reload persistence. It also asserts that the app makes zero external
// network requests and logs no console errors (which includes CSP violations).
//
// Needs a Chromium: set CHROMIUM_PATH, or run `npx playwright-core install chromium` once.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const SP = fileURLToPath(new URL('./out', import.meta.url));
mkdirSync(SP, { recursive: true });

const server = await preview({ root, preview: { port: 4173, strictPort: true, open: false } });
const BASE = server.resolvedUrls?.local[0] ?? 'http://localhost:4173/';

const bank = JSON.parse(readFileSync(`${root}src/content/packs/fa/quiz.json`, 'utf8')).questions;
const byPrompt = new Map(bank.map((q) => [q.prompt, q]));
const exe = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(
  (path) => path && existsSync(path),
);

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const fa2en = (s) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٬,]/g, '');

async function diagnose(error) {
  console.log(`\n!! script error: ${error.message.split('\n').slice(0, 4).join(' / ')}`);
  try {
    await page.screenshot({ path: `${SP}/p1-FAILURE.png`, fullPage: true });
    console.log('!! url:', page.url());
    console.log('!! body:', (await page.locator('body').innerText()).slice(0, 700).replace(/\n+/g, ' | '));
  } catch {}
  await server.close();
  process.exit(2);
}
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
// Counts what the app asks the browser to play and vibrate, so settings can be shown to take effect.
await context.addInitScript(() => {
  window.__audio = { contexts: 0, oscillators: 0 };
  window.__vibrations = [];
  const Original = window.AudioContext;
  if (Original) {
    const create = Original.prototype.createOscillator;
    Original.prototype.createOscillator = function (...args) {
      window.__audio.oscillators += 1;
      return create.apply(this, args);
    };
    window.AudioContext = class extends Original {
      constructor(...args) {
        super(...args);
        window.__audio.contexts += 1;
      }
    };
  }
  navigator.vibrate = (pattern) => {
    window.__vibrations.push(pattern);
    return true;
  };
});
const page = await context.newPage();
process.on('uncaughtException', (e) => { void diagnose(e); });
process.on('unhandledRejection', (e) => { void diagnose(e instanceof Error ? e : new Error(String(e))); });
page.setDefaultTimeout(8000);

const external = [];
const consoleProblems = [];
page.on('request', (req) => {
  const url = new URL(req.url());
  if (url.origin !== new URL(BASE).origin && !['data:', 'blob:'].includes(url.protocol)) external.push(req.url());
});
// Hash URLs typed by the test itself (page.goto) bypass the router; Android's WebView has no URL bar.
// That one router warning is therefore only tolerated in the phase that does this on purpose.
let manualUrlPhase = false;
page.on('console', (msg) => {
  if (!['error', 'warning'].includes(msg.type())) return;
  if (manualUrlPhase && msg.text().includes('blocker on a POP navigation')) return;
  consoleProblems.push(`${msg.type()}: ${msg.text()}`);
});
page.on('pageerror', (err) => consoleProblems.push(`pageerror: ${err.message}`));

// The router keeps the previous screen up until the (lazy) chunk of the next one has loaded, so a
// bare "some h2 exists" would match the screen being left. A play screen always has the shield.
const playScreen = async () => {
  await page.locator('[aria-label^="سپر:"]').first().waitFor();
  await page.waitForSelector('main h2');
};
// A tab counts as reached once it is marked current: the router commits the location only after the
// (lazy) screen has loaded, so what follows is the new screen and never the one being left.
const nav = (label) => ({
  click: async () => {
    await page.locator('nav').getByRole('link', { name: label, exact: true }).click();
    await page.locator('nav a[aria-current="page"]').filter({ hasText: label }).waitFor();
  },
});
const btn = (name) => page.getByRole('button', { name, exact: true });
const optionByText = (text) => page.locator(`main button:has(span:text-is("${text}"))`).first();

/* ── accessibility audit: axe-core runs on every screen that is photographed ───────────────── */
const axeSource = readFileSync(`${root}node_modules/axe-core/axe.min.js`, 'utf8');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
/** `rule | element` → what is wrong and on which screens, so one defect is reported once. */
const a11yFindings = new Map();
let a11yScreens = 0;
async function audit(label) {
  // Injected through the debugger protocol, so the page's CSP (no eval, no inline) is untouched.
  if (!(await page.evaluate(() => Boolean(window.axe)))) await page.evaluate(axeSource);
  const violations = await page.evaluate(
    async (tags) => {
      const run = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
      return run.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 140), why: (n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 220) })),
      }));
    },
    AXE_TAGS,
  );
  // Touch targets: at least 44 CSS px each way (Android's own guidance is 48dp).
  const small = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && style.visibility !== 'hidden' && !el.closest('[hidden], [inert]');
    };
    const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('type') || '').replace(/\s+/g, ' ').trim().slice(0, 28);
    return [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=radio], [role=tab], [role=switch], [role=checkbox], summary')]
      .filter(visible)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width < 44 || r.height < 44)
      .map(({ el, r }) => `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''} "${name(el)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
  });
  if (small.length > 0) {
    violations.push({
      id: 'target-size-44',
      impact: 'moderate',
      help: 'Touch targets should be at least 44×44 CSS px',
      nodes: small.map((target) => ({ target, html: '', why: '' })),
    });
  }
  a11yScreens += 1;
  for (const v of violations) {
    for (const node of v.nodes) {
      const key = `${v.id} | ${node.target}`;
      const known = a11yFindings.get(key);
      if (known) known.screens.add(label);
      else a11yFindings.set(key, { id: v.id, impact: v.impact, help: v.help, ...node, screens: new Set([label]) });
    }
  }
}
const shot = async (name) => {
  await page.screenshot({ path: `${SP}/p1-${name}.png` });
  await audit(name);
};

const riskBank = JSON.parse(readFileSync(`${root}src/content/packs/fa/risk.json`, 'utf8')).scenarios;
const riskByPrompt = new Map(riskBank.map((scenario) => [scenario.prompt, scenario]));
const toFa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
/** A valid backup file for the app, with a correct checksum, built from `data` (and tweakable). */
const makeBackup = (data, extra = {}) => {
  const file = { format: 'hse-quest-backup', formatVersion: 1, schemaVersion: 2, appVersion: 'e2e', exportedAt: Date.now(), data, ...extra };
  file.checksum = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  return JSON.stringify(file);
};
const asUpload = (name, text) => ({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
const LEVEL_RANK = ['elimination', 'substitution', 'engineering', 'administrative', 'ppe'];

/* ── answering helpers ─────────────────────────────────────────────────────────────────── */
async function currentQuestion() {
  const prompt = (await page.locator('main h2').first().innerText()).trim();
  const q = byPrompt.get(prompt);
  if (!q) throw new Error(`unknown prompt on screen: ${prompt}`);
  return q;
}

async function answer(q, correct) {
  if (q.type === 'single-choice') {
    const idx = correct ? q.correctIndex : (q.correctIndex + 1) % q.choices.length;
    await optionByText(q.choices[idx]).click();
  } else if (q.type === 'true-false') {
    const value = correct ? q.answer : !q.answer;
    await page.getByRole('radio', { name: value ? 'درست' : 'غلط', exact: true }).click();
  } else if (q.type === 'matching') {
    const n = q.pairs.length;
    for (let i = 0; i < n; i += 1) {
      const target = correct ? i : (i + 1) % n;
      await optionByText(q.pairs[i].left).click();
      await optionByText(q.pairs[target].right).click();
    }
  } else if (q.type === 'ordering') {
    const order = q.items.map((_, i) => i);
    if (!correct) order.reverse();
    for (const i of order) await optionByText(q.items[i]).click();
  }
  await btn('ثبت پاسخ').click();
}

/** Plays until the result screen. `plan(i, q)` decides if question i is answered correctly. */
async function playRound(plan, log = []) {
  for (let i = 0; i < 20; i += 1) {
    if (await page.locator('main h1').filter({ hasText: /دور تمام شد|سپرت شکست/ }).count()) return log;
    const q = await currentQuestion();
    const correct = plan(i, q);
    await answer(q, correct);
    const verdict = await page.locator('[role=status]').first().innerText();
    log.push({ type: q.type, correct, verdict: verdict.includes('درست گفتی') ? 'right' : 'wrong' });
    await page.locator('[role=status]').getByRole('button').click();
    await page.waitForTimeout(60);
  }
  return log;
}

const resultXp = async () => {
  const text = await page.getByText(/^\+[۰-۹٬]+ XP$/).first().innerText();
  return Number(fa2en(text).replace(/\D/g, ''));
};

/* ── 1. onboarding ─────────────────────────────────────────────────────────────────────── */
await page.goto(BASE, { waitUntil: 'networkidle' });
check('first launch shows onboarding (no profile yet)', await page.getByRole('heading', { name: 'به سپر خوش آمدی' }).isVisible());
check('no bottom nav during onboarding', (await page.locator('nav a').count()) === 0);
await shot('onboarding-1');
await btn('بزن بریم').click();

await btn('ادامه').click();
check('empty nickname is rejected with a message', await page.getByRole('alert').filter({ hasText: 'دست‌کم ۲ نویسه' }).isVisible());
await page.getByLabel('نام مستعار').fill('علی');
await page.getByRole('radio', { name: 'شعله' }).click();
await shot('onboarding-2');
await btn('ادامه').click();

await page.getByLabel('صنعت').selectOption('construction');
await page.getByRole('radio', { name: 'با تجربه' }).click();
await shot('onboarding-3');
await btn('شروع').click();
await page.locator('nav a').first().waitFor();

check('after onboarding the tab bar appears', (await page.locator('nav a').count()) === 5);
check('home greets the player by name', await page.getByText('سلام علی!').isVisible());
await shot('home-new');

/* ── 2. quiz hub ───────────────────────────────────────────────────────────────────────── */
await page.getByRole('link', { name: /ادامه‌ی تمرین/ }).click();
await page.locator('main a[href*="mode=topic"]').first().waitFor();
check('quiz hub opens', await page.getByRole('heading', { name: 'آزمون HSE', level: 1 }).isVisible());
const topicCards = await page.locator('main a[href*="mode=topic"]').count();
check('hub lists the topics', topicCards === 15, `${topicCards} topics`);
check('weak-spot card is inactive before any round', await page.getByText('هنوز سؤالی برای مرور نیست').isVisible());
await shot('hub');

/* ── 3. round A: everything correct (all question types appear over the rounds) ───────── */
await page.getByRole('link', { name: /آزمون ترکیبی/ }).click();
await playScreen();
check('play screen has no bottom nav', (await page.locator('nav a').count()) === 0);
check('shield starts full', (await page.locator('[aria-label^="سپر:"]').getAttribute('aria-label')) === 'سپر: ۳ لایه از ۳');
await shot('play-first');
const seenTypes = new Set();
const logA = await playRound((i, q) => {
  seenTypes.add(q.type);
  return true;
});
check('round A: 10 questions answered', logA.length === 10, `${logA.length}`);
check('round A: every answer judged correct by the app', logA.every((l) => l.verdict === 'right'));
check('round A: finished with the completed title', await page.getByRole('heading', { name: 'دور تمام شد' }).isVisible());
const xpA = await resultXp();
check('round A: the first round unlocks two medals, shown on the result', (await page.getByTestId('new-badges').innerText()).includes('قدم اول: برنزی') && (await page.getByTestId('new-badges').innerText()).includes('استاد آزمون: برنزی'));
const starDuration = () => page.locator('[aria-label="۳ ستاره از ۳"] svg').first().evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
check('round A: the stars pop in with an animation…', (await starDuration()) >= 0.4);
await page.emulateMedia({ reducedMotion: 'reduce' });
check('…which collapses to nothing when the system asks for reduced motion', (await starDuration()) <= 0.001);
await page.emulateMedia({ reducedMotion: 'no-preference' });
check('round A: flawless 3 stars', (await page.locator('[aria-label="۳ ستاره از ۳"]').count()) === 1);
check('round A: bonuses listed (first time + flawless)', (await page.getByText('بونوس اولین بار').count()) === 1 && (await page.getByText('بونوس بی‌نقص').count()) === 1);
check('round A: perfect message instead of review list', await page.getByText('همه‌ی پاسخ‌ها درست بود').isVisible());
await shot('result-perfect');
console.log(`   types seen in round A: ${[...seenTypes].join(', ')}  | XP earned: ${xpA}`);

/* ── 4. progress persisted + survives reload ───────────────────────────────────────────── */
await btn('بازگشت به آزمون').click();
await nav('پیشرفت').click();
const totalText = fa2en(await page.getByText(/^جمع: /).innerText());
check('progress page total XP equals the XP shown on the result', Number(totalText.replace(/\D/g, '')) === xpA, `${totalText} vs ${xpA}`);
await page.getByText('۱۰۰٪').first().waitFor();
check('progress shows 1 round and 100% accuracy', (await page.locator('main').innerText()).includes('۱۰۰٪'));
await shot('progress');
await page.reload({ waitUntil: 'networkidle' });
check('reload keeps the profile (no onboarding)', (await page.locator('nav a').count()) === 5);
await nav('پیشرفت').click();
const afterReload = fa2en(await page.getByText(/^جمع: /).innerText());
check('reload keeps the XP', Number(afterReload.replace(/\D/g, '')) === xpA);

/* ── 5. round B: three mistakes break the shield ───────────────────────────────────────── */
await nav('بازی‌ها').click();
await page.getByRole('link', { name: /آزمون HSE/ }).first().click();
await page.getByRole('link', { name: /آزمون ترکیبی/ }).click();
await playScreen();
const logB = await playRound((i) => {
  // wrong, wrong, right, wrong → shield broken on the 4th question
  const plan = [false, false, true, false][i] ?? true;
  return plan;
});
check('round B: ended early after the third mistake', logB.length === 4, `${logB.length} questions`);
check('round B: shows the broken-shield result', await page.getByRole('heading', { name: 'سپرت شکست' }).isVisible());
check('round B: zero stars on a broken shield', (await page.locator('[aria-label="۰ ستاره از ۳"]').count()) === 1);
check('round B: no first-time/flawless bonus', (await page.getByText('بونوس').count()) === 0);
check('round B: missed questions are reviewed with explanation', (await page.locator('main section').last().innerText()).includes('پاسخ درست'));
const xpB = await resultXp();
await shot('result-broken');
console.log(`   round B XP earned: ${xpB}`);

/* ── 6. weak-spot review uses the questions just missed ────────────────────────────────── */
await btn('مرور نقاط ضعف').click();
await playScreen();
const weakQs = [];
const logW = await playRound((i, q) => {
  weakQs.push(q.id);
  return true;
});
check('weak mode: replays exactly the 3 missed questions', logW.length === 3 && new Set(weakQs).size === 3, `${logW.length}`);
check('weak mode: completes', await page.getByRole('heading', { name: 'دور تمام شد' }).isVisible());
check('weak mode: no first-time bonus', (await page.getByText('بونوس اولین بار').count()) === 0);
await btn('بازگشت به آزمون').click();

/* ── 7. leaving mid-round asks for confirmation ────────────────────────────────────────── */
await page.getByRole('link', { name: /آزمون ترکیبی/ }).click();
await playScreen();
await page.getByRole('button', { name: 'خروج از دور' }).click();
await page.getByRole('dialog').getByText('از دور خارج می‌شوی؟').waitFor();
check('exit shows a confirmation dialog', await page.getByRole('dialog').getByText('از دور خارج می‌شوی؟').isVisible());
await page.getByRole('dialog').getByRole('button', { name: 'ادامه‌ی دور' }).click();
check('"stay" keeps the round', await page.locator('main h2').first().isVisible());
await page.goBack();
await page.getByRole('dialog').getByText('از دور خارج می‌شوی؟').waitFor();
check('browser/Android back is intercepted too', await page.getByRole('dialog').getByText('از دور خارج می‌شوی؟').isVisible());
await shot('exit-dialog');
await page.getByRole('dialog').getByRole('button', { name: 'خروج', exact: true }).click();
check('confirming leaves the round', await page.getByRole('heading', { name: 'آزمون HSE', level: 1 }).isVisible());

/* ── 8. hint (50/50) ──────────────────────────────────────────────────────────────────── */
let hinted = false;
for (let attempt = 0; attempt < 6 && !hinted; attempt += 1) {
  await page.getByRole('link', { name: /آزمون ترکیبی/ }).click();
  await playScreen();
  const q = await currentQuestion();
  if (q.type === 'single-choice') {
    await page.getByRole('button', { name: /حذف دو گزینه/ }).click();
    check('hint leaves exactly two options', (await page.locator('main [role=radio]').count()) === 2);
    check('hint button disappears after use', (await page.getByRole('button', { name: /حذف دو گزینه/ }).count()) === 0);
    await shot('hint');
    hinted = true;
  }
  await page.getByRole('button', { name: 'خروج از دور' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'خروج', exact: true }).click();
}
check('hint scenario exercised', hinted);


/* ── 8b. Risk Assessment Challenge ────────────────────────────────────────────────────── */
async function currentScenario() {
  const prompt = (await page.locator('main h2').first().innerText()).trim();
  const scenario = riskByPrompt.get(prompt);
  if (!scenario) throw new Error(`unknown risk prompt on screen: ${prompt}`);
  return scenario;
}
const cell = (l, sev) => page.getByRole('button', { name: new RegExp(`^احتمال ${toFa(l)}، پیامد ${toFa(sev)}،`) });
const controlByRank = (scenario, which) => {
  const sorted = [...scenario.controls].sort((a, b) => LEVEL_RANK.indexOf(a.level) - LEVEL_RANK.indexOf(b.level));
  return which === 'best' ? sorted[0] : sorted[sorted.length - 1];
};

/** Plays one scenario. `rating`: {l, s} to tap, `control`: 'best' | 'worst'. Returns the verdict text. */
async function playScenario(scenario, rating, control) {
  await cell(rating.l, rating.s).click();
  await btn('ثبت ارزیابی').click();
  await page.locator(`main [role=radio]:has(span:text-is("${controlByRank(scenario, control).text}"))`).click();
  await btn('ثبت پاسخ').click();
  await page.locator('[role=status]').filter({ hasText: /خوب ارزیابی کردی|این بار دقیق نبود|زمان تمام شد/ }).waitFor();
  return (await page.locator('[role=status]').filter({ hasText: /خوب ارزیابی کردی|این بار دقیق نبود/ }).first().innerText());
}
/** Clicks "next" and waits until either the next scenario or the result screen is shown. */
async function nextAfterReview(previousPrompt) {
  await page.locator('[role=status]').getByRole('button', { name: /سؤال بعدی|مشاهده‌ی نتیجه/ }).click();
  await page.waitForFunction((previous) => {
    const h1 = document.querySelector('main h1');
    const h2 = document.querySelector('main h2');
    return (h1 && /دور تمام شد|سپرت شکست/.test(h1.textContent ?? '')) || (h2 && (h2.textContent ?? '').trim() !== previous);
  }, previousPrompt);
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await nav('بازی‌ها').click();
await page.getByRole('link', { name: /چالش ارزیابی ریسک/ }).click();
await page.getByRole('button', { name: 'شروع دور' }).waitFor();
check('risk hub opens with the legend and the scale guide', (await page.getByText('راهنمای مقیاس').count()) >= 1 && (await page.getByText('خیلی بالا').count()) >= 1);
await shot('risk-hub');

// Round A: expert rating + best control on every scenario → flawless
await btn('شروع دور').click();
await playScreen();
check('risk play has no bottom nav', (await page.locator('nav a').count()) === 0);
let first = true;
let verdictsA = [];
for (let i = 0; i < 6; i += 1) {
  const sc = await currentScenario();
  if (first) {
    // matrix mechanics: nothing selected → submit disabled; tap a cell → readout; change it
    check('risk: submit is disabled until a cell is chosen', await btn('ثبت ارزیابی').isDisabled());
    await cell(3, 4).click();
    check('risk: readout shows likelihood × severity = score and band', (await page.getByRole('status').filter({ hasText: 'انتخاب تو' }).first().innerText()).includes(`${toFa(12)} (متوسط)`));
    check('risk: chosen cell is pressed', (await cell(3, 4).getAttribute('aria-pressed')) === 'true');
    await shot('risk-rate');
    first = false;
  }
  verdictsA.push(await playScenario(sc, { l: sc.likelihood, s: sc.severity }, 'best'));
  if (i === 0) await shot('risk-review');
  await nextAfterReview(sc.prompt);
}
check('risk round A: every scenario judged right', verdictsA.every((v) => v.includes('خوب ارزیابی کردی')), `${verdictsA.length} scenarios`);
await page.getByRole('heading', { name: 'دور تمام شد' }).waitFor();
check('risk round A: flawless → three stars', (await page.locator('[aria-label="۳ ستاره از ۳"]').count()) === 1);
check('risk round A: flawless and first-time bonuses listed', (await page.getByText('بونوس بی‌نقص').count()) === 1 && (await page.getByText('بونوس اولین بار').count()) === 1);
await shot('risk-result');
await btn('بازگشت به چالش ریسک').click();

// Round B: near rating + worst control (partial credit shown), then wrong ratings → shield breaks
await btn('شروع دور').click();
await playScreen();
let partialChecked = false;
let played = 0;
for (let i = 0; i < 6; i += 1) {
  if (await page.locator('main h1').filter({ hasText: /دور تمام شد|سپرت شکست/ }).count()) break;
  const sc = await currentScenario();
  const near = { l: sc.likelihood === 5 ? 4 : sc.likelihood + 1, s: sc.severity };
  const far = { l: sc.likelihood <= 2 ? 5 : 1, s: sc.severity <= 2 ? 5 : 1 };
  const verdict = await playScenario(sc, partialChecked ? far : near, 'worst');
  played += 1;
  if (!partialChecked) {
    const text = await page.locator('main').innerText();
    check('risk review: 60% rating credit for a one-step miss, 0% for the worst control', text.includes('ارزیابی ریسک: ۶۰٪') && text.includes('انتخاب کنترل: ۰٪'));
    check('risk review: expert cell and your cell are both named on the matrix', (await page.locator('main [aria-label*="ارزیابی کارشناس"]').count()) === 1 && (await page.locator('main [aria-label*="انتخاب تو"]').count()) >= 1);
    check('risk review: controls are ranked with levels and the best one marked', (await page.getByText('مؤثرترین').count()) >= 1 && (await page.getByText('انتخاب تو').count()) >= 1);
    partialChecked = true;
  }
  check(`risk round B scenario ${played}: judged "not quite"`, verdict.includes('این بار دقیق نبود'));
  await nextAfterReview(sc.prompt);
}
await page.getByRole('heading', { name: 'سپرت شکست' }).waitFor();
check('risk round B: ended early after three misses', played === 3, `${played} scenarios`);
check('risk round B: broken-shield result with a scenario review', (await page.getByText('مرور سناریوها').count()) === 1 && (await page.getByText('مؤثرترین کنترل').count()) >= 1);
await btn('بازگشت به چالش ریسک').click();

// leaving mid-round asks, like the quiz
await btn('شروع دور').click();
await playScreen();
await page.getByRole('button', { name: 'خروج از دور' }).click();
await page.getByRole('dialog').getByText('از دور خارج می‌شوی؟').waitFor();
await page.getByRole('dialog').getByRole('button', { name: 'خروج', exact: true }).click();
await page.getByRole('button', { name: 'شروع دور' }).waitFor();
check('risk: leaving mid-round is confirmed and returns to the hub', await page.getByRole('button', { name: 'شروع دور' }).isVisible());

// progress counts risk answers
await nav('پیشرفت').click();
await page.getByText('آخرین دورها').waitFor();
check('progress now includes risk rounds (topics from risk scenarios appear)', (await page.locator('main').innerText()).includes('مدیریت ریسک'));

/* ── 8c. Find the Hazard ──────────────────────────────────────────────────────────────── */
const scene = JSON.parse(readFileSync(`${root}src/content/packs/fa/hazard.json`, 'utf8')).scenes[0];
const hz = (key) => scene.hazards.find((hazard) => hazard.id === `${scene.id}.${key}`);
const frame = () => page.getByTestId('scene-frame');
const layer = () => frame().locator('> div').first();
const NOWHERE = { x: 0.5, y: 0.03 };
/** Clicks the picture at a normalised point, wherever the zoomed picture currently is. */
async function tapScene(point) {
  const box = await layer().boundingBox();
  await page.mouse.click(box.x + box.width * point.x, box.y + box.height * point.y);
}
const layerScale = async () => Number(((await layer().getAttribute('style')) ?? '').match(/scale\(([\d.]+)\)/)?.[1] ?? 1);
const shield = () => page.locator('[aria-label^="سپر:"]').getAttribute('aria-label');
const hazardStatus = (text) => page.locator('[role=status]').filter({ hasText: text });
const hazardProgress = (n, total = scene.hazards.length) => page.getByText(`${toFa(n)} از ${toFa(total)} خطر`).first();

await page.goto(BASE, { waitUntil: 'networkidle' });
await nav('بازی‌ها').click();
check('games page lists Find the Hazard as playable (no "coming soon")', (await page.getByRole('link', { name: /خطر را پیدا کن/ }).count()) === 1);
await page.getByRole('link', { name: /خطر را پیدا کن/ }).click();
await btn('شروع صحنه').waitFor();
check('hazard hub explains the rules', (await page.getByText('چطور بازی می‌شود؟').count()) === 1 && (await page.getByText(/۱۵٪ امتیاز همان خطر/).count()) === 1);
await shot('hazard-hub');

// Round A: a miss, a find, a repeat tap, hints, zoom and pan, then everything found.
await btn('شروع صحنه').click();
await frame().waitFor();
check('hazard round starts with 0 found, three shield layers and three hints', (await hazardProgress(0).isVisible()) && (await shield()) === 'سپر: ۳ لایه از ۳' && (await btn('راهنما (۳ مانده)').isVisible()));
check('the scene picture is shown at the declared shape', await page.evaluate(([w, h]) => {
  const box = document.querySelector('[data-testid=scene-frame]').getBoundingClientRect();
  return Math.abs(box.width / box.height - w / h) < 0.03;
}, [scene.width, scene.height]));
await shot('hazard-play');

await tapScene(NOWHERE);
await hazardStatus('اینجا خطری نیست').waitFor();
check('tapping empty space breaks one shield layer', (await shield()) === 'سپر: ۲ لایه از ۳');
check('the broken layer cracks and flashes (animation)', (await page.locator('[aria-label^="سپر:"] > span').last().evaluate((el) => getComputedStyle(el).animationName)).includes('crack'));
await shot('hazard-miss');

await tapScene(hz('crane'));
await hazardStatus('خطر پیدا شد!').waitFor();
const foundText = await page.locator('[role=status]').first().innerText();
check('finding a hazard shows its title, risk and recommended control', foundText.includes(hz('crane').title) && foundText.includes('ریسک بدون کنترل') && foundText.includes(hz('crane').control.text));
check('finding a hazard scores points and moves the counter', foundText.includes('امتیاز') && (await hazardProgress(1).isVisible()));
await shot('hazard-found');

await tapScene(hz('crane'));
await hazardStatus('این خطر را قبلاً پیدا کرده‌ای').waitFor();
check('tapping a found hazard again costs nothing', (await shield()) === 'سپر: ۲ لایه از ۳' && (await hazardProgress(1).isVisible()));

await btn('راهنما (۳ مانده)').click();
await hazardStatus('محدوده‌ی یک خطر علامت خورد').waitFor();
check('a hint draws a ring and uses one of three', (await frame().locator('g[class*="hint"]').count()) === 1 && (await btn('راهنما (۲ مانده)').isVisible()));
await shot('hazard-hint');
await tapScene(hz('pipes'));
await hazardStatus('خطر پیدا شد!').waitFor();
check('the hinted hazard is the first unfound one, and its ring goes away once found', (await frame().locator('g[class*="hint"]').count()) === 0 && (await hazardProgress(2).isVisible()));

// zoom with the wheel around the pedestrian, tap it while zoomed, pan, then reset
const frameBox = await frame().boundingBox();
const pedestrian = hz('pedestrian');
await page.mouse.move(frameBox.x + frameBox.width * pedestrian.x, frameBox.y + frameBox.height * pedestrian.y);
await page.mouse.wheel(0, -600);
await page.waitForFunction(() => /scale\((?!1\))/.test(document.querySelector('[data-testid=scene-frame] > div')?.getAttribute('style') ?? ''));
const zoomed = await layerScale();
check('wheel zoom enlarges the picture (capped at 4×)', zoomed > 1.5 && zoomed <= 4, `scale ${zoomed.toFixed(2)}`);
await shot('hazard-zoomed');
await tapScene(pedestrian);
await hazardStatus('خطر پیدا شد!').waitFor();
check('a tap lands on the right hazard while zoomed in', (await hazardProgress(3).isVisible()) && (await shield()) === 'سپر: ۲ لایه از ۳');
const before = await layer().boundingBox();
await page.mouse.move(frameBox.x + 100, frameBox.y + 100);
await page.mouse.down();
await page.mouse.move(frameBox.x + 160, frameBox.y + 150, { steps: 6 });
await page.mouse.up();
const after = await layer().boundingBox();
check('dragging pans a zoomed picture, and a drag is not a tap', Math.abs(after.x - before.x) + Math.abs(after.y - before.y) > 20 && (await shield()) === 'سپر: ۲ لایه از ۳');
await page.getByRole('button', { name: 'کوچک‌نمایی' }).click();
await page.getByRole('button', { name: 'نمایش کامل صحنه' }).click();
check('reset returns the picture to fit size', (await layerScale()) === 1 && (await page.getByRole('button', { name: 'نمایش کامل صحنه' }).isDisabled()));

// Hazards already found are harmless repeat taps; once the last one is found further taps are ignored.
for (const hazard of scene.hazards) {
  await tapScene(hazard);
  await page.waitForTimeout(40);
}
await hazardProgress(scene.hazards.length).waitFor();
check('finding every hazard completes the round and says so', (await hazardStatus('همه‌ی خطرها را پیدا کردی!').count()) >= 1);
check('the finished scene numbers its hazards', (await frame().locator('g[class*="found"] text').count()) === scene.hazards.length);
await shot('hazard-complete');
await btn('مشاهده‌ی نتیجه').click();
await page.getByRole('heading', { name: 'دور تمام شد' }).waitFor();
const hazardResultText = await page.locator('main').innerText();
check('result: all found, one wrong tap reported, review of every hazard', hazardResultText.includes('خطر پیدا شده') && hazardResultText.includes('۱ لمس اشتباه') && hazardResultText.includes('همه‌ی خطرها را پیدا کردی. عالی!'));
check('result: a hint and a miss cost the flawless bonus, first time gives its bonus', !hazardResultText.includes('بونوس بی‌نقص') && hazardResultText.includes('بونوس اولین بار'));
check('result: three stars (a hint only costs part of one hazard)', (await page.getByRole('img', { name: '۳ ستاره از ۳' }).count()) === 1);
await page.getByText(/^پیدا شد \(/).click();
check('result: the review lists the lesson of each hazard', (await page.getByText(hz('generator').control.text).count()) === 1);
await page.screenshot({ path: `${SP}/p1-hazard-result.png`, fullPage: true });

// Round B: three wrong taps break the shield; every hazard is then reviewed as missed.
await btn('صحنه‌ی بعدی').click();
await frame().waitFor();
for (let i = 0; i < 3; i += 1) {
  await tapScene({ x: NOWHERE.x + i * 0.05, y: NOWHERE.y });
  await page.waitForTimeout(80);
}
await hazardStatus('سپرت کاملاً شکست').waitFor();
check('three misses break the shield and stop the round', (await shield()) === 'سپر: ۰ لایه از ۳' && (await btn('مشاهده‌ی نتیجه').isVisible()));
await tapScene(hz('drum'));
check('taps are ignored once the round is over', (await hazardProgress(0).isVisible()));
check('missed hazards are marked on the scene', (await frame().locator('g[class*="missed"]').count()) === scene.hazards.length);
await btn('مشاهده‌ی نتیجه').click();
await page.getByRole('heading', { name: 'سپرت شکست' }).waitFor();
check('broken-shield result lists every hazard as not found', (await page.getByText(`پیدا نشد (${toFa(scene.hazards.length)})`).count()) === 1 && (await page.getByText('۳ لمس اشتباه').count()) === 1);

// Round C: give up after two finds (with confirmation).
await btn('صحنه‌ی بعدی').click();
await frame().waitFor();
await tapScene(hz('puddle'));
await tapScene(hz('ladder'));
await hazardProgress(2).waitFor();
await btn('پایان و نمایش پاسخ‌ها').click();
await page.getByRole('dialog').getByText('دور را تمام کنیم؟').waitFor();
await page.getByRole('dialog').getByRole('button', { name: 'ادامه می‌دهم' }).click();
check('"keep playing" on the give-up dialog keeps the round', (await btn('راهنما (۳ مانده)').isVisible()));
await btn('پایان و نمایش پاسخ‌ها').click();
await page.getByRole('dialog').getByRole('button', { name: 'پایان دور' }).click();
await hazardStatus('خطرهای پیدا‌نشده با رنگ قرمز').waitFor();
await btn('مشاهده‌ی نتیجه').click();
await page.getByRole('heading', { name: 'دور زودتر تمام شد' }).waitFor();
check('giving up shows the unfound hazards and a reduced result', (await page.getByText(`پیدا نشد (${toFa(scene.hazards.length - 2)})`).count()) === 1);
await btn('بازگشت به بازی خطر').click();

/* ── 8d. Find the Hazard without touching the picture: keyboard and on-screen arrows ───── */
{
  const target = (key) => hz(key);
  const reticle = () => frame().locator('span[aria-hidden="true"]').first();
  /** Moves the aiming mark with `press('left'|'right'|'up'|'down')` until it sits on the hazard. */
  async function steerTo(hazard, press) {
    for (let i = 0; i < 120; i += 1) {
      const b = await layer().boundingBox();
      const m = await reticle().boundingBox();
      const dx = b.x + b.width * hazard.x - (m.x + m.width / 2);
      const dy = b.y + b.height * hazard.y - (m.y + m.height / 2);
      // a tap hits within the hazard's radius plus 14px of finger tolerance; stay a little inside that
      if (Math.hypot(dx, dy) <= hazard.radius * b.width + 8) return true;
      if (Math.abs(dx) >= Math.abs(dy)) await press(dx < 0 ? 'left' : 'right');
      else await press(dy < 0 ? 'up' : 'down');
    }
    return false;
  }
  const reticleOpacity = () => reticle().evaluate((el) => getComputedStyle(el).opacity);
  const reticleSize = async () => (await reticle().boundingBox()).width;

  await btn('شروع صحنه').click();
  await frame().waitFor();
  check('the scene is a focusable group with keyboard instructions', (await frame().getAttribute('tabindex')) === '0' && Boolean(await frame().getAttribute('aria-describedby')));
  check('the aiming mark is hidden until the keyboard or the button controls are used', (await reticleOpacity()) === '0');

  // keyboard: + to zoom, arrows to move, Enter to register the point under the reticle
  await frame().focus();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('+');
  check('keyboard: + zooms in', (await layerScale()) > 3);
  const markSize = await reticleSize();
  check('the aiming mark keeps its size however far the picture is zoomed', Math.abs(markSize - 44) < 4, `${markSize.toFixed(1)}px`);
  check('keyboard: the aiming mark shows while the picture has focus', (await reticleOpacity()) === '1');
  const keyboardFound = await steerTo(target('crane'), (dir) => page.keyboard.press(`Arrow${dir[0].toUpperCase()}${dir.slice(1)}`));
  check('keyboard: arrow keys can bring a hazard under the aiming mark', keyboardFound);
  await page.keyboard.press('Enter');
  await hazardStatus('خطر پیدا شد!').waitFor();
  check('keyboard: Enter registers the point under the mark and finds the hazard', (await hazardProgress(1).isVisible()) && (await shield()) === 'سپر: ۳ لایه از ۳');
  await page.keyboard.press('Enter'); // the same spot again: found already, so harmless
  await hazardStatus('این خطر را قبلاً پیدا کرده‌ای').waitFor();
  await page.keyboard.press('0');
  check('keyboard: 0 shows the whole scene again', (await layerScale()) === 1);
  // At fit size, every hazard of the scene can be reached — the ones at the edge included.
  const unreachable = [];
  for (const hazard of scene.hazards) {
    if (!(await steerTo(hazard, (dir) => page.keyboard.press(`Arrow${dir[0].toUpperCase()}${dir.slice(1)}`)))) unreachable.push(hazard.id);
  }
  check('keyboard: every hazard of the scene can be aimed at', unreachable.length === 0, unreachable.join(', '));

  // on-screen arrows: the same, for switch access and screen readers
  await page.getByRole('button', { name: 'کنترل با دکمه‌ها' }).click();
  check('buttons: the toggle is pressed and the aiming mark shows', (await page.getByRole('button', { name: 'کنترل با دکمه‌ها' }).getAttribute('aria-pressed')) === 'true' && (await reticleOpacity()) === '1');
  await page.waitForTimeout(500); // let the previous hazard's feedback panel finish its entrance animation
  await page.screenshot({ path: `${SP}/p1-hazard-assist.png`, fullPage: true });
  await audit('hazard-assist');
  const padFound = await steerTo(target('pipes'), (dir) => page.getByRole('button', { name: { up: 'رفتن به بالای صحنه', down: 'رفتن به پایین صحنه', left: 'رفتن به سمت چپ صحنه', right: 'رفتن به سمت راست صحنه' }[dir] }).click());
  check('buttons: the arrows can bring a hazard under the aiming mark', padFound);
  await btn('ثبت در نقطه‌ی هدف').click();
  await hazardStatus('خطر پیدا شد!').waitFor();
  check('buttons: "register" finds the hazard under the mark', (await hazardProgress(2).isVisible()) && (await shield()) === 'سپر: ۳ لایه از ۳');
  await btn('ثبت در نقطه‌ی هدف').click(); // still on the same hazard
  await hazardStatus('این خطر را قبلاً پیدا کرده‌ای').waitFor();
  await page.getByRole('button', { name: 'کنترل با دکمه‌ها' }).click();
  check('buttons: switching the controls off hides the pad and the mark', (await page.getByRole('button', { name: 'ثبت در نقطه‌ی هدف' }).count()) === 0 && (await reticleOpacity()) === '0');
  await page.getByRole('button', { name: 'خروج از دور' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'خروج', exact: true }).click();
  await btn('شروع صحنه').waitFor();
}

// leaving mid-round asks first
await btn('شروع صحنه').click();
await frame().waitFor();
await page.getByRole('button', { name: 'خروج از دور' }).click();
await page.getByRole('dialog').getByText('از دور خارج می‌شوی؟').waitFor();
await page.getByRole('dialog').getByRole('button', { name: 'خروج', exact: true }).click();
await btn('شروع صحنه').waitFor();
check('hazard: leaving mid-round is confirmed and returns to the hub', await btn('شروع صحنه').isVisible());
check('hazard pages never scroll sideways', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

manualUrlPhase = true;
/* ── 9. a topic round shows every other question type ─────────────────────────────────── */
for (const topic of ['hazard-identification', 'fire-safety', 'electrical']) {
  await page.goto(`${BASE}#/games/quiz/play?mode=topic&topic=${topic}`, { waitUntil: 'networkidle' });
  await playScreen();
  const types = new Set();
  await playRound((i, q) => {
    types.add(q.type);
    return true;
  });
  check(`topic ${topic}: completes`, await page.getByRole('heading', { name: /دور تمام شد/ }).isVisible(), [...types].join('+'));
  [...types].forEach((t) => seenTypes.add(t));
}
console.log(`   all types answered correctly through the UI: ${[...seenTypes].sort().join(', ')}`);
check('all four question types were played', ['matching', 'ordering', 'single-choice', 'true-false'].every((t) => seenTypes.has(t)));

/* ── 8d. Streak + daily challenge ─────────────────────────────────────────────────────── */
const totalXp = async () => {
  await nav('پیشرفت').click();
  const text = fa2en(await page.getByText(/^جمع: /).innerText());
  return Number(text.replace(/\D/g, ''));
};
const dailyTask = (name) => page.locator('li').filter({ hasText: name });

await page.goto(BASE, { waitUntil: 'networkidle' });
check('home shows the daily card with 0 of 3 missions', await page.getByText('۰ از ۳ مأموریت').first().isVisible());
check('home shows the day streak once something was played today', (await page.getByText('۱ روز پیاپی').count()) >= 1);
await nav('روزانه').click();
await page.getByRole('heading', { name: 'مأموریت‌های امروز' }).waitFor();
check('daily page: three missions, each with a start button', (await page.getByRole('button', { name: 'شروع', exact: true }).count()) === 3);
check('daily page: streak counts today and says it is safe', (await page.getByText('۱ روز پیاپی').count()) >= 1 && (await page.getByText('امروز بازی کردی؛ روزهای پیاپی‌ات امن است.').count()) === 1);
check('daily page: seven days with today marked and played', (await page.locator('ol[aria-label="هفت روز گذشته"] > li').count()) === 7 && (await page.locator('ol[aria-label="هفت روز گذشته"] li[aria-label*="امروز"][aria-label*="بازی شد"]').count()) === 1);
check('daily page: shows a Jalali date', /[۰-۹]{4}/.test(await page.locator('main header, main h1').first().innerText().then(async () => page.locator('main').innerText())));
await shot('daily');

const xp0 = await totalXp();

// A daily round that does NOT complete earns nothing extra and the mission stays open.
await nav('روزانه').click();
await dailyTask('چالش ارزیابی ریسک').getByRole('button', { name: 'شروع' }).click();
await playScreen();
check('a daily round is labelled while playing', (await page.getByText('چالش روزانه · XP دوبرابر').count()) === 1);
const far = (scenario) => ({ l: scenario.likelihood <= 3 ? 5 : 1, s: scenario.severity <= 3 ? 5 : 1 });
for (let i = 0; i < 3; i += 1) {
  const sc = await currentScenario();
  await playScenario(sc, far(sc), 'worst');
  await nextAfterReview(sc.prompt);
}
await page.getByRole('heading', { name: 'سپرت شکست' }).waitFor();
check('a broken-shield daily round gets no daily bonus', (await page.getByText('چالش روزانه (دوبرابر)').count()) === 0);
const failedDailyXp = await resultXp();
await btn('بازگشت به چالش ریسک').click();
await nav('روزانه').click();
await page.getByRole('heading', { name: 'مأموریت‌های امروز' }).waitFor();
check('…and the mission is still open', (await page.getByText('۰ از ۳ مأموریت').count()) >= 1 && (await page.getByRole('button', { name: 'شروع', exact: true }).count()) === 3);

// Mission 1: risk, played perfectly → double XP.
await dailyTask('چالش ارزیابی ریسک').getByRole('button', { name: 'شروع' }).click();
await playScreen();
for (let i = 0; i < 6; i += 1) {
  if (await page.locator('main h1').filter({ hasText: /دور تمام شد|سپرت شکست/ }).count()) break;
  const sc = await currentScenario();
  await playScenario(sc, { l: sc.likelihood, s: sc.severity }, 'best');
  await nextAfterReview(sc.prompt);
}
await page.getByRole('heading', { name: 'دور تمام شد' }).waitFor();
const riskText = await page.locator('main').innerText();
check('daily risk mission: result shows the ×2 row', riskText.includes('چالش روزانه (دوبرابر)') && riskText.includes('×۲'));
check('daily risk mission: no completion bonus yet', !riskText.includes('پاداش کامل شدن چالش روزانه'));
const riskDailyXp = await resultXp();
await shot('daily-result');
await btn('بازگشت به چالش ریسک').click();
await nav('روزانه').click();
await page.getByRole('heading', { name: 'مأموریت‌های امروز' }).waitFor();
check('daily: mission 1 done, 1 of 3', (await page.getByText('۱ از ۳ مأموریت').count()) >= 1 && (await dailyTask('چالش ارزیابی ریسک').getByText('انجام شد').count()) === 1);

// Mission 2: today's quiz topic.
const quizTitle = await dailyTask('آزمون موضوعی').locator('strong').innerText();
await dailyTask('آزمون موضوعی').getByRole('button', { name: 'شروع' }).click();
await playScreen();
check('daily quiz mission plays the topic of the day', (await page.getByText('چالش روزانه · XP دوبرابر').count()) === 1, quizTitle);
await playRound(() => true);
await page.getByRole('heading', { name: 'دور تمام شد' }).waitFor();
check('daily quiz mission: ×2 row, still no completion bonus', (await page.getByText('چالش روزانه (دوبرابر)').count()) === 1 && (await page.getByText('پاداش کامل شدن چالش روزانه').count()) === 0);
const quizDailyXp = await resultXp();
await btn('بازگشت به آزمون').click();

// Mission 3: a hazard scene → completes the challenge and pays +100.
await nav('روزانه').click();
await dailyTask('خطر را پیدا کن').getByRole('button', { name: 'شروع' }).click();
await frame().waitFor();
for (const hazard of scene.hazards) {
  await tapScene(hazard);
  await page.waitForTimeout(40);
}
await hazardProgress(scene.hazards.length).waitFor();
await btn('مشاهده‌ی نتیجه').click();
await page.getByRole('heading', { name: 'دور تمام شد' }).waitFor();
const hazardDailyText = await page.locator('main').innerText();
check('daily hazard mission: unlocks the daily-hero and eagle-eye medals', hazardDailyText.includes('مدال تازه!') && hazardDailyText.includes('قهرمان روزانه: برنزی') && hazardDailyText.includes('چشم عقاب: برنزی'));
check('daily hazard mission: ×2 row and the +100 completion bonus', hazardDailyText.includes('چالش روزانه (دوبرابر)') && hazardDailyText.includes('پاداش کامل شدن چالش روزانه') && hazardDailyText.includes('+۱۰۰'));
const hazardDailyXp = await resultXp();
await shot('daily-complete-result');
await btn('بازگشت به بازی خطر').click();

await nav('روزانه').click();
await page.getByText('چالش امروز کامل شد!').waitFor();
check('daily page celebrates all three missions', (await page.getByText('۳ از ۳ مأموریت').count()) >= 1 && (await page.getByRole('button', { name: 'شروع', exact: true }).count()) === 0);
await shot('daily-complete');
const xp1 = await totalXp();
check('total XP is exactly the sum of the four rounds just played (bonus and doubling persisted)', xp1 - xp0 === failedDailyXp + riskDailyXp + quizDailyXp + hazardDailyXp, `${xp1 - xp0} vs ${failedDailyXp}+${riskDailyXp}+${quizDailyXp}+${hazardDailyXp}`);
await nav('خانه').click();
await page.getByText('۳ از ۳ مأموریت').first().waitFor();
check('home reflects 3 of 3 missions', (await page.getByText('۳ از ۳ مأموریت').count()) >= 1);

/* ── 8e. Progress tabs: medals and the competency radar ───────────────────────────────── */
const badgeTier = async (id) => Number(await page.locator(`li[data-badge="${id}"]`).getAttribute('data-tier'));
await nav('پیشرفت').click();
await page.getByRole('tablist', { name: 'بخش‌های پیشرفت' }).waitFor();
check('progress has four tabs, "my score" selected first', (await page.getByRole('tab').count()) === 4 && (await page.getByRole('tab', { name: 'امتیاز من' }).getAttribute('aria-selected')) === 'true');
check('progress score tab lists rounds of every game by name', (await page.locator('main').innerText()).includes('خطر را پیدا کن') && (await page.locator('main').innerText()).includes('چالش ارزیابی ریسک'));

await page.getByRole('tab', { name: 'امتیاز من' }).focus();
await page.keyboard.press('ArrowLeft');
await page.getByRole('tab', { name: 'مدال‌ها', selected: true }).waitFor();
check('arrow keys move between tabs following the RTL reading direction', page.url().includes('tab=badges'));
await page.locator('li[data-badge]').first().waitFor();
check('medals tab: all eight medals are listed', (await page.locator('li[data-badge]').count()) === 8);
check('medals tab: played-for medals are unlocked, unreached ones stay locked', (await badgeTier('first-steps')) >= 2 && (await badgeTier('quiz-ace')) >= 1 && (await badgeTier('daily-hero')) === 1 && (await badgeTier('eagle-eye')) === 1 && (await badgeTier('streak')) === 0);
check('a medal hexagon is a labelled image naming its tier', (await page.getByRole('img', { name: /^قدم اول، سطح/ }).count()) === 1 && (await page.getByRole('img', { name: 'قهرمان روزانه، سطح برنزی' }).count()) === 1 && (await page.getByRole('img', { name: 'استمرار، سطح قفل' }).count()) === 1);
check('a locked medal shows how far the next tier is', (await page.locator('li[data-badge="streak"]').innerText()).includes('۱ از ۳'));
await shot('badges');

await page.getByRole('tab', { name: 'رادار' }).click();
await page.getByTestId('radar').waitFor();
check('radar tab: one labelled image with the six domains', (await page.locator('[data-testid=radar] svg[role=img]').getAttribute('aria-label')).includes('بهداشت حرفه‌ای') && (await page.locator('circle[data-axis]').count()) === 6);
check('radar tab: a data table twin lists all six domains with values', (await page.locator('table tbody tr').count()) === 6 && (await page.locator('table').innerText()).includes('٪'));
const radarText = ((await page.locator('[data-testid=radar] svg').textContent()) ?? '').replace(/\s+/g, '');
check('radar tab: every axis is labelled with its domain name', ['ایمنی', 'ارزیابی ریسک', 'مدیریت بحران', 'قوانین و مقررات', 'محیط زیست', 'بهداشت حرفه‌ای'].every((name) => radarText.includes(name.replace(/\s+/g, ''))));
await page.locator('circle[data-axis="safety"]').hover();
await page.getByTestId('radar').getByRole('status').waitFor();
check('hovering a vertex shows its value, name and sample size', (await page.getByTestId('radar').getByRole('status').innerText()).includes('پاسخ اخیر'));
for (const axis of ['occupationalHealth', 'environment', 'riskAssessment', 'crisis']) {
  await page.locator(`circle[data-axis="${axis}"]`).hover();
  const tip = await page.getByTestId('radar').getByRole('status').boundingBox();
  check(`radar tooltip for ${axis} stays inside the screen`, tip !== null && tip.x >= 0 && tip.x + tip.width <= 390, tip ? `x ${Math.round(tip.x)}..${Math.round(tip.x + tip.width)}` : 'missing');
}
await page.locator('circle[data-axis="safety"]').hover();
check('the recommendation names a domain and leads to practice', (await page.getByText('پیشنهاد ویژه').count()) === 1 && (await btn('شروع تمرین').isVisible()));
await shot('radar');

await page.getByRole('tab', { name: 'رتبه‌بندی' }).click();
await page.locator('li[data-profile]').first().waitFor();
check('ranking with one profile: it is first and the hint to add another is shown', (await page.locator('li[data-profile="علی"]').getAttribute('data-rank')) === '1' && (await page.getByText(/فقط یک پروفایل داری/).count()) === 1);
await shot('ranking-single');

// the tab lives in the URL (deep link), and the other tabs still work after it
await page.goto(`${BASE}#/progress?tab=radar`, { waitUntil: 'networkidle' });
await page.getByTestId('radar').waitFor();
check('?tab=radar opens the radar directly', (await page.getByRole('tab', { name: 'رادار' }).getAttribute('aria-selected')) === 'true');
await page.getByRole('tab', { name: 'امتیاز من' }).click();
await page.getByText('آخرین دورها').waitFor();
await page.waitForFunction(() => !location.hash.includes('tab='));
check('back on "my score" the rounds list is shown again', (await page.getByText('آخرین دورها').count()) === 1 && !page.url().includes('tab='));
check('no horizontal overflow on the radar page', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

/* ── 8f. Backup and restore ───────────────────────────────────────────────────────────── */
const settingsRestoreInput = () => page.getByTestId('backup-file');
const xpBackup = await totalXp();
await nav('تنظیمات').click();
await page.getByRole('heading', { name: 'پشتیبان‌گیری' }).waitFor();
const [download] = await Promise.all([page.waitForEvent('download'), btn('ساخت فایل پشتیبان').click()]);
const backupText = readFileSync(await download.path(), 'utf8');
const backup = JSON.parse(backupText);
check('backup: a dated .json file is downloaded', /^hse-quest-backup-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
check('backup: it carries the format, schema version, one profile and every round', backup.format === 'hse-quest-backup' && backup.schemaVersion === 2 && backup.data.profiles.length === 1 && backup.data.attempts.length > 10 && /^[0-9a-f]{64}$/.test(backup.checksum), `${backup.data.profiles.length} profile(s), ${backup.data.attempts.length} rounds`);
check('backup: the rounds in the file add up to the XP shown in the app', backup.data.attempts.reduce((sum, a) => sum + a.xp, 0) === xpBackup, `${backup.data.attempts.reduce((sum, a) => sum + a.xp, 0)} vs ${xpBackup}`);
check('backup: the app confirms the download', (await page.getByText('فایل پشتیبان دانلود شد.').count()) === 1);

// restoring this device's own file adds nothing, after a confirmation that says what is inside
await nav('تنظیمات').click();
await settingsRestoreInput().setInputFiles(asUpload('own.json', backupText));
await page.getByRole('dialog').getByText('این پشتیبان اضافه شود؟').waitFor();
check('restore: the confirmation names the profiles and rounds in the file', (await page.getByRole('dialog').innerText()).includes(`${toFa(backup.data.attempts.length)} دور`) && (await page.getByRole('dialog').innerText()).includes('۱ پروفایل'));
await page.getByRole('dialog').getByRole('button', { name: 'انصراف' }).click();
await settingsRestoreInput().setInputFiles(asUpload('own.json', backupText));
await page.getByRole('dialog').getByRole('button', { name: 'افزودن به داده‌هایم' }).click();
await page.getByText('همه‌ی این داده‌ها از قبل روی این دستگاه بود.').waitFor();
check('restore: importing a device\'s own backup changes nothing', (await page.getByRole('button', { name: 'ویرایش' }).count()) === 1);

// bad files are refused with a reason, and nothing is written
const reject = async (label, text, expected) => {
  await settingsRestoreInput().setInputFiles(asUpload('bad.json', text));
  await page.getByRole('alert').filter({ hasText: expected }).waitFor();
  check(`restore refuses ${label}`, true);
};
await reject('text that is not JSON', 'definitely not json', 'خوانا نیست');
await reject('a JSON file that is not a backup', JSON.stringify({ hello: 'world' }), 'پشتیبان این برنامه نیست');
await reject('a file edited after it was made', backupText.replace(/"xp":(\d+)/, '"xp":99999'), 'ناقص یا دست‌خورده');
await reject('a backup from a newer app', makeBackup(backup.data, { schemaVersion: 99 }), 'جدیدتری');
await reject('well-formed data that is inconsistent', makeBackup({ ...backup.data, attempts: [{ ...backup.data.attempts[0], profileId: 'ghost' }] }), 'معتبر نیست');
check('refused files leave the data untouched', (await totalXp()) === xpBackup);

// a backup from another device: a profile with the same nickname is renamed, its rounds are added
const other = {
  profiles: [{ id: 'e2e-other', nickname: 'علی', avatarId: 'zap', industry: 'general', experience: 'beginner', createdAt: 1, updatedAt: 1 }],
  attempts: [{ id: 'e2e-a1', profileId: 'e2e-other', gameId: 'quiz', contentId: 'quiz.mixed', startedAt: 1, finishedAt: Date.now() - 1000, score: 770, stars: 2, xp: 77, durationMs: 1000, detail: { mode: 'mixed', endedBy: 'completed', answers: [{ questionId: 'x.1', topic: 'ppe', difficulty: 1, correct: true, hintsUsed: 0, elapsedMs: 500, credit: 1 }] } }],
  questionStats: [],
};
await nav('تنظیمات').click();
await settingsRestoreInput().setInputFiles(asUpload('other.json', makeBackup(other)));
await page.getByRole('dialog').getByRole('button', { name: 'افزودن به داده‌هایم' }).click();
await page.getByText(/۱ پروفایل و ۱ دور اضافه شد\./).waitFor();
check('restore from another device: profile and round added, duplicate nickname renamed', (await page.getByText('۱ پروفایل به‌خاطر نام تکراری تغییر نام داد.').count()) === 1 && (await page.getByText('علی (2)').count()) >= 1);
await shot('backup-restored');
await nav('پیشرفت').click();
await page.getByRole('tab', { name: 'رتبه‌بندی' }).click();
await page.locator('li[data-profile="علی (2)"]').waitFor();
check('the restored profile shows up in the local ranking with its XP', (await page.locator('li[data-profile="علی (2)"]').innerText()).includes('۷۷') && (await page.locator('li[data-profile="علی (2)"]').getAttribute('data-rank')) === '2');
check('the active player\'s own XP is unaffected by the import', (await totalXp()) === xpBackup);

// clean up: delete the imported profile again so the rest of the run starts from one profile
await nav('تنظیمات').click();
// The list is ordered by creation time, and the imported profile (createdAt 1) is the oldest.
await page.getByRole('button', { name: 'ویرایش' }).nth(0).click();
await page.getByLabel('نام مستعار').waitFor();
check('the editor opened for the imported profile, not the active one', (await page.getByLabel('نام مستعار').inputValue()) === 'علی (2)');
await btn('حذف پروفایل').click();
await page.getByRole('dialog').getByRole('button', { name: 'حذف', exact: true }).click();
await page.waitForTimeout(200);
check('imported profile removed again', (await page.getByRole('button', { name: 'ویرایش' }).count()) === 1);

/* ── 8g. Sound, vibration and reminder settings ───────────────────────────────────────── */
const audioCount = () => page.evaluate(() => window.__audio.oscillators);
const vibrationCount = () => page.evaluate(() => window.__vibrations.length);
check('sound was off all along: no audio context was ever created', (await page.evaluate(() => window.__audio.contexts)) === 0);

await nav('تنظیمات').click();
await page.getByRole('heading', { name: 'صدا و لرزش' }).waitFor();
const soundSwitch = page.getByRole('switch', { name: /^صدا/ });
const hapticsSwitch = page.getByRole('switch', { name: /^لرزش/ });
check('settings: sound is off by default and vibration is on', (await soundSwitch.getAttribute('aria-checked')) === 'false' && (await hapticsSwitch.getAttribute('aria-checked')) === 'true');
const reminderSwitch = page.getByRole('switch', { name: /^یادآور روزانه/ });
check('settings: the reminder needs the Android app, so in a browser it is explained and disabled', (await reminderSwitch.isDisabled()) && (await page.getByText('یادآور فقط در برنامه‌ی Android کار می‌کند.').count()) === 1);
await shot('settings-feedback');

const beforePreview = await audioCount();
await soundSwitch.click();
check('turning sound on plays a short preview', (await soundSwitch.getAttribute('aria-checked')) === 'true' && (await audioCount()) > beforePreview && (await page.evaluate(() => window.__audio.contexts)) === 1);

await nav('بازی‌ها').click();
await page.getByRole('link', { name: /خطر را پیدا کن/ }).click();
await btn('شروع صحنه').click();
await frame().waitFor();
const audio0 = await audioCount();
const vibe0 = await vibrationCount();
await tapScene(hz('crane'));
await hazardStatus('خطر پیدا شد!').waitFor();
const audio1 = await audioCount();
const vibe1 = await vibrationCount();
check('finding a hazard plays its sound and vibrates', audio1 > audio0 && vibe1 > vibe0);
await tapScene(NOWHERE);
await hazardStatus('اینجا خطری نیست').waitFor();
check('a wrong tap plays the shield sound and a heavy vibration', (await audioCount()) > audio1 && (await vibrationCount()) > vibe1);

// each setting really switches its own effect off
await page.getByRole('button', { name: 'خروج از دور' }).click();
await page.getByRole('dialog').getByRole('button', { name: 'خروج', exact: true }).click();
await nav('تنظیمات').click();
await soundSwitch.click();
await hapticsSwitch.click();
check('both switches turn off', (await soundSwitch.getAttribute('aria-checked')) === 'false' && (await hapticsSwitch.getAttribute('aria-checked')) === 'false');
const audioOff = await audioCount();
const vibeOff = await vibrationCount();
await nav('بازی‌ها').click();
await page.getByRole('link', { name: /خطر را پیدا کن/ }).click();
await btn('شروع صحنه').click();
await frame().waitFor();
await tapScene(hz('crane'));
await hazardStatus('خطر پیدا شد!').waitFor();
await tapScene(NOWHERE);
await hazardStatus('اینجا خطری نیست').waitFor();
check('with both off, nothing is played or vibrated', (await audioCount()) === audioOff && (await vibrationCount()) === vibeOff);
await page.getByRole('button', { name: 'خروج از دور' }).click();
await page.getByRole('dialog').getByRole('button', { name: 'خروج', exact: true }).click();

// the choices survive a restart
await nav('تنظیمات').click();
await hapticsSwitch.click();
await page.waitForTimeout(300); // let the setting reach IndexedDB before the page goes away
await page.reload({ waitUntil: 'networkidle' });
await nav('تنظیمات').click();
check('sound off and vibration on are remembered after a reload', (await soundSwitch.getAttribute('aria-checked')) === 'false' && (await hapticsSwitch.getAttribute('aria-checked')) === 'true');

await page.goto(`${BASE}#/dev/hazard-editor`, { waitUntil: 'networkidle' });
await page.getByRole('link', { name: 'خانه' }).first().waitFor();
check('the dev-only hotspot editor does not exist in a production build', (await page.getByText('ویرایشگر نقاط خطر').count()) === 0 && page.url().endsWith('#/'));

/* ── 10. screenshots of matching / ordering mid-question ──────────────────────────────── */
async function leaveRound() {
  await page.getByRole('button', { name: 'خروج از دور' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'خروج', exact: true }).click();
  await page.getByRole('heading', { name: 'آزمون HSE', level: 1 }).waitFor();
}

// Topic rounds contain every question of the topic, so the wanted type is guaranteed to appear.
// `view`: 'mid' = half-finished interaction, 'review' = wrong answer submitted (feedback visible).
async function shootType(type, topic, view) {
  await page.goto(`${BASE}#/games/quiz/play?mode=topic&topic=${topic}`, { waitUntil: 'networkidle' });
  await playScreen();
  for (let i = 0; i < 10; i += 1) {
    const q = await currentQuestion();
    if (q.type === type) {
      if (view === 'mid') {
        if (type === 'matching') {
          await optionByText(q.pairs[0].left).click();
          await optionByText(q.pairs[0].right).click();
          await optionByText(q.pairs[1].left).click();
        } else {
          await optionByText(q.items[0]).click();
          await optionByText(q.items[1]).click();
        }
        await shot(`mid-${type}`);
      } else {
        await answer(q, false);
        await page.locator('[role=status]').waitFor();
        await page.screenshot({ path: `${SP}/p1-review-${type}.png`, fullPage: true });
        if (type === 'ordering') {
          // The wrong answer is the reversed order: the first item of the key was placed last.
          const n = q.items.length;
          const first = await optionByText(q.items[0]).innerText();
          check(
            'ordering review shows where the player put an item and where it belongs',
            fa2en(first).includes(`جایگاه تو: ${n}`) && fa2en(first).includes('جایگاه درست: 1'),
            first.replace(/\n+/g, ' | '),
          );
        }
      }
      await leaveRound();
      return true;
    }
    await answer(q, true);
    await page.locator('[role=status]').getByRole('button').click();
  }
  return false;
}
check('captured matching mid-interaction', await shootType('matching', 'hazard-identification', 'mid'));
check('captured matching review', await shootType('matching', 'hazard-identification', 'review'));
check('captured ordering mid-interaction', await shootType('ordering', 'fire-safety', 'mid'));
check('captured ordering review', await shootType('ordering', 'fire-safety', 'review'));

/* ── 11. profiles: add, switch, edit, delete ──────────────────────────────────────────── */
await page.goto(BASE, { waitUntil: 'networkidle' });
await nav('تنظیمات').click();
await btn('افزودن پروفایل').click();
await page.getByLabel('نام مستعار').fill('علی');
await btn('ذخیره').click();
await page.getByRole('alert').filter({ hasText: 'پروفایل دیگری' }).waitFor();
check('duplicate nickname is rejected', await page.getByRole('alert').filter({ hasText: 'پروفایل دیگری' }).isVisible());
await page.getByLabel('نام مستعار').fill('سارا');
await btn('ذخیره').click();
await page.getByText('سارا').first().waitFor();
check('new profile becomes active', (await page.getByText('سارا').count()) >= 1);
await nav('خانه').click();
await page.getByText('۰ از ۱۰۰ XP').waitFor();
check('new profile starts at level 1 with 0 XP', (await page.locator('main').innerText()).includes('۰ از ۱۰۰ XP'));
await nav('پیشرفت').click();
await page.getByRole('tab', { name: 'رتبه‌بندی' }).click();
await page.locator('li[data-profile="سارا"]').waitFor();
check('ranking with two profiles: the veteran is 1st, the newcomer is unranked and marked "you"', (await page.locator('li[data-profile="علی"]').getAttribute('data-rank')) === '1' && (await page.locator('li[data-profile="سارا"]').getAttribute('data-rank')) === '' && (await page.locator('li[data-profile="سارا"]').getByText('تو', { exact: true }).count()) === 1 && (await page.getByText(/فقط یک پروفایل داری/).count()) === 0);
await page.getByRole('radio', { name: '۷ روز اخیر' }).click();
check('ranking over the last 7 days keeps the player who played today first', (await page.locator('li[data-profile="علی"]').getAttribute('data-rank')) === '1');
await shot('ranking');
await nav('تنظیمات').click();
await shot('settings-profiles');
await page.getByRole('button', { name: 'استفاده از این پروفایل' }).click();
await nav('پیشرفت').click();
const switchedBack = fa2en(await page.getByText(/^جمع: /).innerText());
check('switching back restores the first profile\'s XP', Number(switchedBack.replace(/\D/g, '')) > 0, switchedBack);

await nav('تنظیمات').click();
await page.getByRole('button', { name: 'ویرایش' }).nth(1).click();
await btn('حذف پروفایل').click();
await page.getByRole('dialog').getByText(/برگشت‌پذیر نیست/).waitFor();
check('deleting asks for confirmation', await page.getByRole('dialog').getByText(/برگشت‌پذیر نیست/).isVisible());
await page.getByRole('dialog').getByRole('button', { name: 'حذف', exact: true }).click();
await page.waitForTimeout(200);
check('profile deleted: only one profile left', (await page.getByRole('button', { name: 'ویرایش' }).count()) === 1);

/* ── 12. timed mode ───────────────────────────────────────────────────────────────────── */
await page.getByRole('switch', { name: /چالش زمان‌دار/ }).click();
check('timed switch turns on', (await page.getByRole('switch', { name: /چالش زمان‌دار/ }).getAttribute('aria-checked')) === 'true');
await page.goto(`${BASE}#/games/quiz/play?mode=mixed`, { waitUntil: 'networkidle' });
await playScreen();
check('timer shows while answering', (await page.getByText(/^[۰-۹]+ ثانیه$/).count()) >= 1);
await shot('timed');
// Sending the app to the background stops the clock; coming back must not cost the time away.
const secondsLeft = async () => Number(fa2en(await page.getByText(/^[۰-۹]+ ثانیه$/).first().innerText()).replace(/\D/g, ''));
const setVisibility = (state) =>
  page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
await page.waitForTimeout(1200);
await setVisibility('hidden');
await page.waitForTimeout(400);
const beforeAway = await secondsLeft();
await page.waitForTimeout(3500);
const afterAway = await secondsLeft();
check('the countdown stands still while the app is in the background', beforeAway === afterAway, `${beforeAway}s → ${afterAway}s`);
await setVisibility('visible');
await page.waitForTimeout(2300);
const afterBack = await secondsLeft();
check('…and runs again when the app comes back', afterBack < afterAway && afterBack >= afterAway - 3, `${afterAway}s → ${afterBack}s`);
await page.waitForTimeout(31500);
check('unanswered question times out as wrong', await page.locator('[role=status]').filter({ hasText: 'زمان تمام شد' }).isVisible());
check('timeout cost a shield layer', (await page.locator('[aria-label^="سپر:"]').getAttribute('aria-label')) === 'سپر: ۲ لایه از ۳');
await page.getByRole('button', { name: 'خروج از دور' }).click();
await page.getByRole('dialog').getByRole('button', { name: 'خروج', exact: true }).click();

/* ── 12b. A new phone: first launch with no profile, restored from a backup file ───────── */
await nav('تنظیمات').click();
await page.getByRole('button', { name: 'ویرایش' }).first().click();
await btn('حذف پروفایل').click();
await page.getByRole('dialog').getByRole('button', { name: 'حذف', exact: true }).click();
await page.getByRole('heading', { name: 'به سپر خوش آمدی' }).waitFor();
check('with no profile left the welcome screen offers to restore a backup', await btn('قبلاً پروفایل داشته‌ام؛ بازیابی از فایل پشتیبان').isVisible());
await page.getByTestId('backup-file').setInputFiles(asUpload('new-phone.json', backupText));
await page.getByRole('dialog').getByRole('button', { name: 'افزودن به داده‌هایم' }).click();
await page.locator('nav a').first().waitFor();
await nav('خانه').click(); // the router kept its place (Settings); Home greets by name
await page.getByText('سلام علی!').waitFor();
check('restored on a "new phone": the app opens as the same player, no onboarding', await page.getByText('سلام علی!').isVisible());
check('…with all rounds back, so XP is exactly what it was', (await totalXp()) === xpBackup);
await shot('new-phone-restored');

/* ── 12c. Light theme and large text (system font size up to 200%) ────────────────────── */
const tabs = ['خانه', 'بازی‌ها', 'روزانه', 'پیشرفت', 'تنظیمات'];
async function visitAll(prefix) {
  for (const label of tabs) {
    await nav(label).click();
    await page.waitForTimeout(150);
    await audit(`${prefix}-${label}`);
  }
  await nav('پیشرفت').click();
  const tabCount = await page.getByRole('tab').count();
  for (let i = 0; i < tabCount; i += 1) {
    await page.getByRole('tab').nth(i).click();
    await page.waitForTimeout(150);
    await audit(`${prefix}-progress-tab-${i + 1}`);
  }
  await nav('بازی‌ها').click();
  for (const hub of [/آزمون HSE/, /خطر را پیدا کن/, /چالش ارزیابی ریسک/]) {
    await page.getByRole('link', { name: hub }).first().click();
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    await page.waitForTimeout(250);
    await audit(`${prefix}-hub-${hub.source.slice(0, 6)}`);
    await nav('بازی‌ها').click();
  }
  // one question, answered, so the question and the feedback panel are both audited
  await page.goto(`${BASE}#/games/quiz/play?mode=topic&topic=fire-safety`, { waitUntil: 'networkidle' });
  await playScreen();
  await audit(`${prefix}-question`);
  const q = await currentQuestion();
  await answer(q, false);
  await page.locator('[role=status]').first().waitFor();
  await page.waitForTimeout(350);
  await audit(`${prefix}-feedback`);
  await leaveRound();
}

await nav('تنظیمات').click();
check('settings tell the player that part of the content is not reviewed yet', (await page.getByTestId('unreviewed-notice').innerText()).includes('بازبینی نشده'));
await page.emulateMedia({ colorScheme: 'light' });
manualUrlPhase = true;
await visitAll('light');
await page.emulateMedia({ colorScheme: 'dark' });

// Large text: Android's "font size" setting scales text; rem-based sizes follow the root size.
const clipping = () =>
  page.evaluate(() => {
    const out = [];
    const label = (el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24)}"`;
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.sr-only') || el.closest('svg')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const style = getComputedStyle(el);
      const clipsX = ['hidden', 'clip'].includes(style.overflowX) || style.textOverflow === 'ellipsis';
      const clipsY = ['hidden', 'clip'].includes(style.overflowY);
      const hasOwnText = [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
      if ((clipsX && el.scrollWidth > el.clientWidth + 1 && hasOwnText) || (clipsY && el.scrollHeight > el.clientHeight + 1 && hasOwnText)) out.push(label(el));
    }
    // the bottom bar: every label stays inside its own tab
    for (const link of document.querySelectorAll('nav a')) {
      const box = link.getBoundingClientRect();
      for (const span of link.querySelectorAll('span:not([aria-hidden])')) {
        // the text itself, not the box around it (a box can be narrower than its overflowing text)
        const range = document.createRange();
        range.selectNodeContents(span);
        const text = range.getBoundingClientRect();
        if (text.right > box.right + 1 || text.left < box.left - 1) out.push(`nav label "${span.textContent}" spills out of its tab`);
      }
    }
    return out;
  });
const bigTextProblems = [];
async function bigTextPass(name) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) {
    const culprits = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((el) => !el.closest('svg') && !el.closest('.sr-only'))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 1 && (r.left < -1 || r.right > window.innerWidth + 1))
        // the innermost offenders: elements none of whose children also stick out
        .filter(({ el }) => ![...el.children].some((child) => {
          const c = child.getBoundingClientRect();
          return c.width > 1 && (c.left < -1 || c.right > window.innerWidth + 1);
        }))
        .slice(0, 4)
        .map(({ el, r }) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} [${Math.round(r.left)}..${Math.round(r.right)}] "${(el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 20)}"`),
    );
    bigTextProblems.push(`${name}: page scrolls sideways by ${overflow}px — ${culprits.join('; ')}`);
  }
  for (const item of await clipping()) bigTextProblems.push(`${name}: ${item}`);
}
for (const scale of [130, 200]) {
  await page.evaluate((value) => {
    document.documentElement.style.fontSize = `${value}%`;
  }, scale);
  for (const label of tabs) {
    await nav(label).click();
    await page.waitForTimeout(150);
    await bigTextPass(`${scale}% ${label}`);
  }
  await nav('پیشرفت').click();
  const bigTabCount = await page.getByRole('tab').count();
  for (let i = 0; i < bigTabCount; i += 1) {
    await page.getByRole('tab').nth(i).click();
    await page.waitForTimeout(150);
    await bigTextPass(`${scale}% progress tab ${i + 1}`);
  }
  await page.goto(`${BASE}#/games/quiz/play?mode=topic&topic=fire-safety`, { waitUntil: 'networkidle' });
  await playScreen();
  await bigTextPass(`${scale}% question`);
  if (scale === 200) await page.screenshot({ path: `${SP}/p1-large-text-question.png` });
  await leaveRound();
  await nav('تنظیمات').click();
  if (scale === 200) await page.screenshot({ path: `${SP}/p1-large-text-settings.png` });
}
await page.evaluate(() => {
  document.documentElement.style.fontSize = '';
});
for (const problem of bigTextProblems) console.log(`  large-text: ${problem}`);
check('large text (130% and 200%): no sideways scrolling and no clipped text or labels', bigTextProblems.length === 0, bigTextProblems.slice(0, 6).join(' | '));
manualUrlPhase = false;

/* ── 13. layout + network ─────────────────────────────────────────────────────────────── */
check('no horizontal overflow on the hub', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
const a11yList = [...a11yFindings.values()];
writeFileSync(`${SP}/a11y.json`, JSON.stringify(a11yList.map((f) => ({ ...f, screens: [...f.screens] })), null, 2));
for (const f of a11yList) console.log(`  a11y [${f.impact}] ${f.id}: ${f.target} — ${f.help} (${[...f.screens].join(', ')})\n      ${f.why}`);
check(`accessibility: axe-core finds no violations on ${a11yScreens} screens`, a11yList.length === 0, `${a11yList.length} findings`);
check('zero external network requests', external.length === 0, external.join(', '));
check('no console errors/warnings (incl. CSP violations)', consoleProblems.length === 0, consoleProblems.join(' | '));

await browser.close();
await server.close();
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
