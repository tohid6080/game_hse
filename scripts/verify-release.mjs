#!/usr/bin/env node
/**
 * Release gate: is the content fit to put in front of players?
 *
 *   npm run verify:release                 fails while any item is still a draft
 *   npm run verify:release -- --allow-draft  prints the same table, exits 0 (for beta builds)
 *
 * HSE content that nobody qualified has checked must not ship as if it were checked. This is the
 * only place that says so out loud, and it is meant to fail until the review (docs/REVIEW.md) is done.
 */
import { fileURLToPath } from 'node:url';
import { PACKS, countStatus, readPacks } from './content-review.mjs';

// v1 content targets from docs/ROADMAP.md. Falling short is reported, not a failure.
const TARGETS = { quiz: 300, risk: 40, hazard: 8, permit: 30 };
const LABELS = { quiz: 'Quiz questions', risk: 'Risk scenarios', hazard: 'Hazard scenes', permit: 'Permit cases' };

const root = fileURLToPath(new URL('..', import.meta.url));
const allowDraft = process.argv.includes('--allow-draft');
const counts = countStatus(readPacks(root));

let drafts = 0;
console.log('Content review status (locale fa):');
for (const name of Object.keys(PACKS)) {
  const { total, reviewed } = counts[name];
  drafts += total - reviewed;
  const target = total < TARGETS[name] ? `   (v1 target ${TARGETS[name]})` : '';
  console.log(`  ${LABELS[name].padEnd(16)} ${String(reviewed).padStart(4)} reviewed / ${String(total).padStart(4)} total${target}`);
}

if (drafts === 0) {
  console.log('\nRelease gate passed: every item is reviewed.');
} else if (allowDraft) {
  console.log(`\n${drafts} draft item(s). Allowed for this build (--allow-draft): label it a beta and do not publish.`);
} else {
  console.error(`\nRelease gate FAILED: ${drafts} item(s) are still drafts. Have them reviewed (docs/REVIEW.md), or pass --allow-draft for a beta build.`);
  process.exit(1);
}
