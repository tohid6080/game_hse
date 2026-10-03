#!/usr/bin/env node
/**
 * Offline / privacy guard. HSE Quest must never reach the network at runtime.
 * Run: `npm run verify:offline` (add `--require-dist` to also demand a built dist/).
 *
 * Checks (each failure exits non-zero):
 *  1. android/ manifest: no INTERNET or network-state permissions, no cleartext, no auto-backup
 *  2. capacitor.config.ts: no server.url (live-reload) left in
 *  3. src/: no network APIs and no external URLs in code, styles or html
 *  4. package.json: no backend / analytics / crash-reporting SDKs
 *  5. dist/index.html: Content-Security-Policy present and closed to external origins
 *  6. dist/: no development-only tools (the hazard hotspot editor) in the production bundle
 *  7. Capacitor plugins: every permission their Android manifests inject is on a short, documented
 *     allowlist (this closes most of the old "merged manifest" blind spot)
 *
 * Limits: this reads the app's own manifest and the plugins' manifests. What Gradle's merge adds on
 * top (androidx libraries, build tooling) is only visible in a real build: after one, run
 * `npm run verify:merged`, which checks the merged manifest that actually ships.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED_PERMISSIONS as PLUGIN_PERMISSIONS } from './permissions.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const requireDist = process.argv.includes('--require-dist');
const problems = [];
const notes = [];

const read = (path) => readFileSync(join(root, path), 'utf-8');
/** Permissions the app manifest explicitly removes from the merge (tools:node="remove"). */
const removedPermissions = new Set();

// 1. Android manifest ---------------------------------------------------------------------------
const manifestPath = 'android/app/src/main/AndroidManifest.xml';
if (!existsSync(join(root, manifestPath))) {
  problems.push(`${manifestPath} not found — run "npm run cap:add" first.`);
} else {
  // Comments are stripped so a documented value in a comment can never satisfy a check.
  const manifest = read(manifestPath).replace(/<!--[\s\S]*?-->/g, '');
  // The app declares no permission of its own. The only <uses-permission> allowed here is a
  // tools:node="remove" (it takes a permission injected by a plugin OUT of the merged manifest).
  for (const match of manifest.matchAll(/<uses-permission\b[^>]*>/g)) {
    const name = /android:name="([^"]+)"/.exec(match[0])?.[1] ?? '?';
    if (/tools:node="remove"/.test(match[0])) removedPermissions.add(name);
    else problems.push(`${manifestPath}: permission not allowed: ${name} (plugin permissions are allow-listed in check 7)`);
  }
  if (!/android:allowBackup="false"/.test(manifest)) {
    problems.push(`${manifestPath}: android:allowBackup must be "false" (data stays on device; use in-app export).`);
  }
  if (!/android:usesCleartextTraffic="false"/.test(manifest)) {
    problems.push(`${manifestPath}: android:usesCleartextTraffic must be "false".`);
  }
}

// 2. Capacitor config ---------------------------------------------------------------------------
if (/server\s*:\s*\{[^}]*\burl\b/s.test(read('capacitor.config.ts').replace(/\/\/.*$/gm, ''))) {
  problems.push('capacitor.config.ts: server.url must not be set in a shipped build.');
}

// 3. Source scan --------------------------------------------------------------------------------
const FORBIDDEN_CODE = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bnew\s+WebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bsendBeacon\b/, 'navigator.sendBeacon'],
  [/\bimportScripts\s*\(/, 'importScripts()'],
];
const ALLOWED_URL_PREFIXES = ['http://www.w3.org/'];
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.html']);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const scanTargets = [...walk(join(root, 'src')), join(root, 'index.html')].filter((file) =>
  SCANNED_EXTENSIONS.has(extname(file)),
);
for (const file of scanTargets) {
  const text = readFileSync(file, 'utf-8');
  const rel = relative(root, file);
  const isTest = /\.test\.tsx?$/.test(file);
  if (!isTest) {
    for (const [pattern, label] of FORBIDDEN_CODE) {
      if (pattern.test(text)) problems.push(`${rel}: forbidden network API ${label}`);
    }
  }
  for (const url of text.match(/https?:\/\/[^\s'")`<>]+/g) ?? []) {
    if (!ALLOWED_URL_PREFIXES.some((prefix) => url.startsWith(prefix))) {
      problems.push(`${rel}: external URL not allowed: ${url}`);
    }
  }
}
notes.push(`scanned ${scanTargets.length} source files`);

// 4. Dependencies -------------------------------------------------------------------------------
const pkg = JSON.parse(read('package.json'));
const BANNED_DEPENDENCY = /supabase|firebase|axios|socket\.io|sentry|analytics|amplitude|mixpanel|posthog|bugsnag/i;
for (const section of ['dependencies', 'devDependencies']) {
  for (const name of Object.keys(pkg[section] ?? {})) {
    if (BANNED_DEPENDENCY.test(name)) problems.push(`package.json: banned dependency ${name} (${section})`);
  }
}

// 5. Built output -------------------------------------------------------------------------------
const distIndex = 'dist/index.html';
if (!existsSync(join(root, distIndex))) {
  if (requireDist) problems.push(`${distIndex} not found — run "npm run build" first.`);
  else notes.push('dist/ not built — CSP check skipped (use --require-dist to enforce)');
} else {
  const html = read(distIndex);
  const rawCsp = /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"/.exec(html)?.[1];
  // Vite HTML-escapes attribute values (&#39; for '), browsers decode them — do the same here.
  const csp = rawCsp?.replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  if (!csp) {
    problems.push(`${distIndex}: Content-Security-Policy meta tag is missing.`);
  } else {
    const connect = /connect-src\s+([^;]*)/.exec(csp)?.[1] ?? '';
    if (/(https?:|wss?:|\*)/.test(connect)) problems.push(`${distIndex}: CSP connect-src allows external origins: ${connect}`);
    if (!/default-src\s+'self'/.test(csp)) problems.push(`${distIndex}: CSP default-src must be 'self'.`);
  }
  notes.push('dist/index.html CSP checked');

  // 6. Development tools are registered only when import.meta.env.DEV; none may reach a release build.
  const DEV_MARKERS = ['ویرایشگر نقاط خطر', 'dev/hazard-editor'];
  const assets = join(root, 'dist/assets');
  const leaked = existsSync(assets)
    ? readdirSync(assets).filter(
        (file) => ['.js', '.css'].includes(extname(file)) && DEV_MARKERS.some((marker) => read(`dist/assets/${file}`).includes(marker)),
      )
    : [];
  for (const file of leaked) problems.push(`dist/assets/${file}: contains a development-only tool (hotspot editor).`);
  if (leaked.length === 0) notes.push('dist/ has no development-only tools');
}

// 7. Plugin permissions -------------------------------------------------------------------------
// Capacitor plugins declare permissions in their own Android manifests, which Gradle merges into the
// app. Anything not on the allowlist (scripts/permissions.mjs) — INTERNET above all — fails the guard.
// Adding one is a decision: add it there with its reason AND in docs/DECISIONS.md.
if (!existsSync(join(root, 'node_modules/@capacitor'))) {
  notes.push('node_modules/@capacitor not installed — plugin permission check skipped');
} else {
  const found = new Map();
  for (const name of Object.keys(pkg.dependencies ?? {}).filter((dep) => dep.startsWith('@capacitor/'))) {
    const candidates = [`node_modules/${name}/android/src/main/AndroidManifest.xml`, `node_modules/${name}/android/capacitor/src/main/AndroidManifest.xml`, `node_modules/${name}/capacitor/src/main/AndroidManifest.xml`];
    const manifestFile = candidates.find((candidate) => existsSync(join(root, candidate)));
    if (!manifestFile) {
      notes.push(`${name}: no Android manifest found (not an Android plugin?)`);
      continue;
    }
    const text = read(manifestFile).replace(/<!--[\s\S]*?-->/g, '');
    for (const match of text.matchAll(/<uses-permission\b[^>]*android:name="([^"]+)"/g)) found.set(match[1], name);
  }
  for (const [permission, plugin] of found) {
    if (removedPermissions.has(permission)) continue;
    if (!(permission in PLUGIN_PERMISSIONS)) problems.push(`${plugin}: injects permission ${permission}, which is not on the allowlist (scripts/verify-offline.mjs).`);
  }
  notes.push(`plugin permissions: ${[...found.keys()].filter((permission) => !removedPermissions.has(permission)).map((permission) => permission.replace('android.permission.', '')).sort().join(', ') || 'none'}`);
}

// Report ----------------------------------------------------------------------------------------
for (const note of notes) console.log(`  · ${note}`);
if (problems.length > 0) {
  console.error(`\nOffline guard FAILED (${problems.length}):`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}
console.log('Offline guard passed.');
