#!/usr/bin/env node
/**
 * One source of truth for the app's version: package.json. This writes it into the Android project
 * (versionName and versionCode in android/app/build.gradle).
 *
 *   node scripts/sync-version.mjs           write it
 *   node scripts/sync-version.mjs --check   fail if they differ (part of `npm run check`)
 *
 * versionCode must grow with every build handed to a store or a tester, so it is derived from the
 * version: 1.2.3 → 10203 (major*10000 + minor*100 + patch). Minor and patch stay below 100.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function versionCodeOf(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) throw new Error(`"${version}" is not a x.y.z version`);
  const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (minor > 99 || patch > 99) throw new Error('minor and patch must stay below 100 for the versionCode scheme');
  return major * 10000 + minor * 100 + patch;
}

/** The build.gradle text with the given version, or throws if its version lines are not where expected. */
export function withVersion(gradle, version) {
  const name = /^(\s*versionName\s+)"[^"]*"/m;
  const code = /^(\s*versionCode\s+)\d+/m;
  if (!name.test(gradle) || !code.test(gradle)) throw new Error('versionName/versionCode not found in build.gradle');
  return gradle.replace(name, `$1"${version}"`).replace(code, `$1${versionCodeOf(version)}`);
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const gradlePath = join(root, 'android/app/build.gradle');
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
  const current = readFileSync(gradlePath, 'utf-8');
  const next = withVersion(current, version);
  if (process.argv.includes('--check')) {
    if (next !== current) {
      console.error(`android/app/build.gradle is not at version ${version} (versionCode ${versionCodeOf(version)}). Run: node scripts/sync-version.mjs`);
      process.exit(1);
    }
    console.log(`Android version in sync: ${version} (versionCode ${versionCodeOf(version)}).`);
    return;
  }
  if (next === current) console.log(`Already at ${version} (versionCode ${versionCodeOf(version)}).`);
  else {
    writeFileSync(gradlePath, next);
    console.log(`android/app/build.gradle → versionName "${version}", versionCode ${versionCodeOf(version)}.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
