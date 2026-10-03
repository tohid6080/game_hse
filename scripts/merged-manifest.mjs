#!/usr/bin/env node
/**
 * Checks the MERGED Android manifest of a real build — the one that ships — against the offline and
 * privacy rules. `verify:offline` can only read the plugins' own manifests; Gradle's merge adds
 * more (androidx libraries, build tooling), and this is the check that sees the result.
 *
 *   npm run verify:merged                          finds the manifest of the latest build itself
 *   node scripts/merged-manifest.mjs <file> [--release]
 *
 * `--release` additionally refuses a debuggable build. Build first (docs/RELEASE.md).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ALLOWED_PERMISSIONS, FORBIDDEN_PERMISSIONS } from './permissions.mjs';

/** AndroidX adds a signature-level permission named after the app id; it grants nothing to anyone else. */
const OWN_RECEIVER_PERMISSION = /^(.+)\.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION$/;

/**
 * @param {string} xml merged AndroidManifest.xml
 * @param {{ release?: boolean }} [options]
 * @returns {{ problems: string[], notes: string[] }}
 */
export function checkMergedManifest(xml, { release = false } = {}) {
  const text = xml.replace(/<!--[\s\S]*?-->/g, '');
  const problems = [];
  const notes = [];

  const applicationId = /<manifest\b[^>]*\bpackage="([^"]+)"/.exec(text)?.[1] ?? null;
  if (!/<manifest\b/.test(text)) return { problems: ['not an Android manifest (no <manifest> element)'], notes };

  const permissions = [...text.matchAll(/<uses-permission(?:-sdk-23)?\b[^>]*android:name="([^"]+)"/g)].map((match) => match[1]);
  for (const name of new Set(permissions)) {
    const own = OWN_RECEIVER_PERMISSION.exec(name);
    if (own && applicationId && own[1] === applicationId) continue;
    if (name in FORBIDDEN_PERMISSIONS) problems.push(`permission ${name} must not be present: ${FORBIDDEN_PERMISSIONS[name]}.`);
    else if (!(name in ALLOWED_PERMISSIONS)) problems.push(`permission ${name} is not on the allowlist (scripts/permissions.mjs).`);
  }
  notes.push(`permissions: ${[...new Set(permissions)].map((name) => name.replace('android.permission.', '')).sort().join(', ') || 'none'}`);

  const application = /<application\b[^>]*>/.exec(text)?.[0] ?? '';
  if (!/android:allowBackup="false"/.test(application)) problems.push('android:allowBackup must be "false".');
  if (!/android:usesCleartextTraffic="false"/.test(application)) problems.push('android:usesCleartextTraffic must be "false".');
  if (release && /android:debuggable="true"/.test(application)) problems.push('a release build must not be debuggable.');
  if (/android:networkSecurityConfig=/.test(application)) problems.push('a network security config is not expected in an offline app.');

  // Components other apps could start. Not a failure: listed so a person can read them once.
  const exported = [...text.matchAll(/<(activity|service|receiver|provider)\b[^>]*>/g)]
    .filter((match) => /android:exported="true"/.test(match[0]))
    .map((match) => `${match[1]} ${/android:name="([^"]+)"/.exec(match[0])?.[1] ?? '?'}`);
  notes.push(`exported components: ${exported.join('; ') || 'none'}`);

  return { problems, notes };
}

/** The newest merged manifest under the Gradle build output, or null. */
export function findMergedManifest(root) {
  const base = join(root, 'android/app/build/intermediates');
  if (!existsSync(base)) return null;
  const found = [];
  const walk = (dir, depth) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (depth < 5) walk(full, depth + 1);
      } else if (entry === 'AndroidManifest.xml' && /merged_manifest/.test(full)) found.push(full);
    }
  };
  walk(base, 0);
  return found.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const args = process.argv.slice(2);
  const release = args.includes('--release');
  const file = args.find((arg) => !arg.startsWith('--')) ?? findMergedManifest(root);
  if (!file || !existsSync(file)) {
    console.error('No merged manifest found. Build the app first (see docs/RELEASE.md), or pass the file path.');
    process.exit(2);
  }
  const { problems, notes } = checkMergedManifest(readFileSync(file, 'utf-8'), { release });
  console.log(`  · ${file}`);
  for (const note of notes) console.log(`  · ${note}`);
  if (problems.length > 0) {
    console.error(`\nMerged manifest check FAILED (${problems.length}):`);
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    process.exit(1);
  }
  console.log('Merged manifest check passed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
