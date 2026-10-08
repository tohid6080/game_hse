#!/usr/bin/env node
/**
 * The expert-review loop for the game content (quiz questions, risk scenarios, hazard scenes, permits, emergency cases).
 *
 *   npm run content:export                         writes review-sheets/*.csv (one row per item)
 *   npm run content:apply -- <sheet.csv> --reviewer "Name" [--date YYYY-MM-DD] [--write]
 *
 * The reviewer opens a sheet in Excel/Sheets, fills `verdict` (approved | changes | reject) and
 * `notes`, and sends it back. `apply` turns "approved" into reviewStatus "reviewed" together with the
 * reviewer's name and date, and sends everything else back to "draft". It only PRINTS what it would do
 * unless `--write` is given: this changes content that players will trust.
 *
 * Nothing here ever decides what is correct. It records a person's decision, and refuses to record
 * "approved" for an item that cites no reference.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PACKS = {
  quiz: { file: 'quiz.json', key: 'questions' },
  risk: { file: 'risk.json', key: 'scenarios' },
  hazard: { file: 'hazard.json', key: 'scenes' },
  permit: { file: 'permit.json', key: 'permits' },
  emergency: { file: 'emergency.json', key: 'cases' },
};

export const COLUMNS = ['game', 'id', 'topic', 'difficulty', 'item', 'content', 'explanation', 'references', 'add_references', 'status', 'verdict', 'notes'];

/* ── CSV ───────────────────────────────────────────────────────────────────────────────────── */

const cell = (value) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** Excel needs the byte-order mark to read UTF-8 (and so Persian) correctly. */
export const toCsv = (rows) => `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;

/** RFC 4180: quoted cells may hold commas, quotes ("") and line breaks. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(value);
      value = '';
      if (row.some((entry) => entry !== '')) rows.push(row);
      row = [];
    } else value += char;
  }
  row.push(value);
  if (row.some((entry) => entry !== '')) rows.push(row);
  return rows;
}

/* ── export ────────────────────────────────────────────────────────────────────────────────── */

const references = (list) =>
  list.map((ref) => `${ref.standard}${ref.clause ? ` §${ref.clause}` : ''}${ref.note ? ` (${ref.note})` : ''}`).join('\n');

function quizContent(question) {
  switch (question.type) {
    case 'single-choice':
      return [question.prompt, '', ...question.choices.map((choice, i) => `${i + 1}) ${choice}${i === question.correctIndex ? '  ✔' : ''}`)].join('\n');
    case 'true-false':
      return `${question.prompt}\n\nپاسخ درست: ${question.answer ? 'درست' : 'غلط'}`;
    case 'matching':
      return [question.prompt, '', ...question.pairs.map((pair) => `${pair.left}  ⟷  ${pair.right}`)].join('\n');
    case 'ordering':
      return [question.prompt, '', 'ترتیب درست:', ...question.items.map((item, i) => `${i + 1}. ${item}`)].join('\n');
    default:
      return question.prompt;
  }
}

/**
 * Reference lines as a reviewer writes them, one per line: `ISO 45001:2018`, or with a clause after a
 * § sign, `ISO 45001:2018 §8.1.2`, or with a note after the clause, `ISO 45001:2018 §8.1.2 (note)`.
 * Without a § the whole line is the standard's name (so `ILO C155 (1981)` stays one name). Whether a
 * citation is right is the reviewer's judgement, never ours.
 */
export function parseReferenceLines(text) {
  const refs = [];
  for (const line of (text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const at = trimmed.indexOf('§');
    if (at === -1) {
      refs.push({ standard: trimmed });
      continue;
    }
    const standard = trimmed.slice(0, at).trim();
    const rest = /^([^()]*?)\s*(?:\((.*)\))?$/.exec(trimmed.slice(at + 1).trim());
    if (!standard) continue;
    const ref = { standard };
    if (rest?.[1]?.trim()) ref.clause = rest[1].trim();
    if (rest?.[2]?.trim()) ref.note = rest[2].trim();
    refs.push(ref);
  }
  return refs;
}

/** Adds the reviewer's references to an item, skipping any it already cites. Returns how many were new. */
function addReferences(item, text) {
  let added = 0;
  for (const ref of parseReferenceLines(text)) {
    if (item.references.some((known) => known.standard === ref.standard && (known.clause ?? '') === (ref.clause ?? ''))) continue;
    item.references.push(ref);
    added += 1;
  }
  return added;
}

const pct = (fraction) => `${Math.round(fraction * 100)}٪`;

/** The permit as the reviewer should read it: the form, which lines are planted defects, and the right decision. */
function permitContent(permit) {
  const defectOf = new Map();
  permit.defects.forEach((defect, index) => defect.fieldIds.forEach((id) => defectOf.set(id, { defect, index })));
  const lines = [permit.prompt, '', `نوع مجوز: ${permit.permitType}`];
  for (const section of permit.sections) {
    lines.push('', `# ${section.title}`);
    for (const field of section.fields) {
      const hit = defectOf.get(field.id);
      lines.push(`- ${field.label}: ${field.value}${hit ? `   ⚠ خطای ${hit.index + 1}${hit.defect.critical ? ' (بحرانی)' : ''}` : ''}`);
    }
  }
  lines.push('', permit.defects.length === 0 ? 'پاسخ درست: مجوز سالم است و باید تأیید شود.' : 'پاسخ درست: مجوز باید رد شود. خطاها:');
  permit.defects.forEach((defect, index) => lines.push(`${index + 1}. ${defect.critical ? '[بحرانی] ' : ''}${defect.why}`));
  return lines.join('\n');
}

/** The emergency case as the reviewer should read it: every step with each option, its grade and what follows. */
function emergencyContent(item) {
  const lines = [item.prompt, '', `نوع: ${item.emergencyType}`];
  item.steps.forEach((step, index) => {
    lines.push('', `# مرحله‌ی ${index + 1}: ${step.situation}`);
    for (const option of step.options) lines.push(`- [${option.grade}] ${option.text}  ⟶  ${option.consequence}`);
    lines.push(`چرا بهترین: ${step.why}`);
  });
  return lines.join('\n');
}

/** One flat row per reviewable item: a question, a scenario, a single hazard of a scene, a permit, or an emergency case. */
export function buildRows(packs) {
  const rows = [];
  for (const question of packs.quiz?.questions ?? []) {
    rows.push({
      game: 'quiz',
      id: question.id,
      topic: question.topic,
      difficulty: String(question.difficulty),
      item: question.type,
      content: quizContent(question),
      explanation: question.explanation,
      references: references(question.references),
      status: question.reviewStatus,
    });
  }
  for (const scenario of packs.risk?.scenarios ?? []) {
    rows.push({
      game: 'risk',
      id: scenario.id,
      topic: scenario.topic,
      difficulty: String(scenario.difficulty),
      item: scenario.title,
      content: [
        scenario.prompt,
        '',
        `ارزیابی کارشناس: احتمال ${scenario.likelihood} × پیامد ${scenario.severity} (هر دو از ۵)`,
        'کنترل‌ها (سطح در سلسله‌مراتب کنترل):',
        ...scenario.controls.map((control) => `- [${control.level}] ${control.text}`),
      ].join('\n'),
      explanation: scenario.explanation,
      references: references(scenario.references),
      status: scenario.reviewStatus,
    });
  }
  for (const permit of packs.permit?.permits ?? []) {
    rows.push({
      game: 'permit',
      id: permit.id,
      topic: permit.topic,
      difficulty: String(permit.difficulty),
      item: permit.title,
      content: permitContent(permit),
      explanation: permit.explanation,
      references: references(permit.references),
      status: permit.reviewStatus,
    });
  }
  for (const item of packs.emergency?.cases ?? []) {
    rows.push({
      game: 'emergency',
      id: item.id,
      topic: item.topic,
      difficulty: String(item.difficulty),
      item: item.title,
      content: emergencyContent(item),
      explanation: item.explanation,
      references: references(item.references),
      status: item.reviewStatus,
    });
  }
  for (const scene of packs.hazard?.scenes ?? []) {
    for (const hazard of scene.hazards) {
      rows.push({
        game: 'hazard',
        id: hazard.id,
        topic: hazard.topic,
        difficulty: String(hazard.difficulty),
        item: `${scene.title} — ${hazard.title}`,
        content: [
          `صحنه: ${scene.description}`,
          `خطر: ${hazard.title}`,
          `جای خطر در تصویر: ${pct(hazard.x)} از چپ، ${pct(hazard.y)} از بالا، شعاع ${pct(hazard.radius)} عرض تصویر`,
          `ریسک بدون کنترل: احتمال ${hazard.likelihood} × پیامد ${hazard.severity} (هر دو از ۵)`,
          `کنترل پیشنهادی [${hazard.control.level}]: ${hazard.control.text}`,
        ].join('\n'),
        explanation: hazard.explanation,
        references: references(hazard.references),
        status: scene.reviewStatus,
      });
    }
  }
  return rows;
}

/** The CSV text for one game's rows (with an empty verdict and notes column for the reviewer). */
export const sheetFor = (rows) => toCsv([COLUMNS, ...rows.map((row) => COLUMNS.map((column) => row[column] ?? ''))]);

/* ── apply ─────────────────────────────────────────────────────────────────────────────────── */

const VERDICTS = {
  approved: ['approved', 'approve', 'ok', 'yes', '✓', '✔', 'تایید', 'تأیید', 'تاییدشد', 'تأییدشد', 'تایید شد', 'تأیید شد'],
  changes: ['changes', 'change', 'edit', 'fix', 'اصلاح', 'نیازبهاصلاح', 'نیاز به اصلاح'],
  reject: ['reject', 'rejected', 'no', 'رد', 'ردشد', 'رد شد'],
};

/** 'approved' | 'changes' | 'reject' | null (left empty: not reviewed yet) | 'unknown'. */
export function parseVerdict(raw) {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === '') return null;
  for (const [verdict, words] of Object.entries(VERDICTS)) if (words.includes(value)) return verdict;
  return 'unknown';
}

/**
 * @param {{quiz?: any, risk?: any, hazard?: any, permit?: any, emergency?: any}} packs  parsed JSON packs (not modified)
 * @param {Array<Record<string,string>>} rows            sheet rows as objects keyed by COLUMNS
 * @param {{reviewer: string, date: string}} options
 */
export function applyVerdicts(packs, rows, { reviewer, date }) {
  if (!reviewer || !reviewer.trim()) throw new Error('A reviewer name is required (--reviewer "Name").');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('The date must be YYYY-MM-DD.');
  const next = structuredClone(packs);
  const report = { approved: [], revoked: [], changes: [], rejected: [], skipped: [], unknownIds: [], unknownVerdicts: [], untouched: 0, referencesAdded: 0 };
  const record = { by: reviewer.trim(), at: date };

  const items = new Map();
  for (const question of next.quiz?.questions ?? []) items.set(`quiz|${question.id}`, { item: question });
  for (const scenario of next.risk?.scenarios ?? []) items.set(`risk|${scenario.id}`, { item: scenario });
  for (const permit of next.permit?.permits ?? []) items.set(`permit|${permit.id}`, { item: permit });
  for (const item of next.emergency?.cases ?? []) items.set(`emergency|${item.id}`, { item });
  const sceneOf = new Map();
  for (const scene of next.hazard?.scenes ?? []) for (const hazard of scene.hazards) sceneOf.set(hazard.id, scene);

  const approve = (item, id) => {
    if (item.references.length === 0) {
      report.skipped.push({ id, reason: 'approved, but it cites no reference — add one first' });
      return;
    }
    if (item.reviewStatus === 'reviewed') {
      report.untouched += 1;
      return;
    }
    item.reviewStatus = 'reviewed';
    item.review = record;
    report.approved.push(id);
  };
  const sendBack = (item, id, verdict, notes) => {
    if (item.reviewStatus === 'reviewed') {
      item.reviewStatus = 'draft';
      delete item.review;
      report.revoked.push(id);
    }
    (verdict === 'reject' ? report.rejected : report.changes).push({ id, notes });
  };

  // Hazard rows are collected per scene: a scene is reviewed only when all of its hazards were.
  const sceneRows = new Map();
  for (const row of rows) {
    const verdict = parseVerdict(row.verdict);
    const id = (row.id ?? '').trim();
    if (verdict === null) {
      report.untouched += 1;
      continue;
    }
    if (verdict === 'unknown') {
      report.unknownVerdicts.push({ id, verdict: row.verdict });
      continue;
    }
    if (row.game === 'hazard') {
      const scene = sceneOf.get(id);
      if (!scene) {
        report.unknownIds.push(id);
        continue;
      }
      if (!sceneRows.has(scene.id)) sceneRows.set(scene.id, { scene, verdicts: new Map() });
      sceneRows.get(scene.id).verdicts.set(id, { verdict, notes: row.notes ?? '' });
      if (verdict !== 'reject') report.referencesAdded += addReferences(scene.hazards.find((hazard) => hazard.id === id), row.add_references);
      continue;
    }
    const found = items.get(`${row.game}|${id}`);
    if (!found) {
      report.unknownIds.push(id);
      continue;
    }
    if (verdict !== 'reject') report.referencesAdded += addReferences(found.item, row.add_references);
    if (verdict === 'approved') approve(found.item, id);
    else sendBack(found.item, id, verdict, row.notes ?? '');
  }

  for (const { scene, verdicts } of sceneRows.values()) {
    const missing = scene.hazards.filter((hazard) => !verdicts.has(hazard.id)).map((hazard) => hazard.id);
    const notApproved = [...verdicts].filter(([, { verdict }]) => verdict !== 'approved');
    if (notApproved.length > 0) {
      for (const [id, { verdict, notes }] of notApproved) (verdict === 'reject' ? report.rejected : report.changes).push({ id, notes });
      if (scene.reviewStatus === 'reviewed') {
        scene.reviewStatus = 'draft';
        delete scene.review;
        report.revoked.push(scene.id);
      }
    } else if (missing.length > 0) {
      report.skipped.push({ id: scene.id, reason: `only part of the scene was approved; verdicts missing for: ${missing.join(', ')}` });
    } else if (scene.hazards.some((hazard) => hazard.references.length === 0)) {
      report.skipped.push({ id: scene.id, reason: 'approved, but a hazard cites no reference — add one first' });
    } else if (scene.reviewStatus !== 'reviewed') {
      scene.reviewStatus = 'reviewed';
      scene.review = record;
      report.approved.push(scene.id);
    } else report.untouched += 1;
  }
  return { packs: next, report };
}

/* ── files and CLI ─────────────────────────────────────────────────────────────────────────── */

const packPath = (root, name, locale) => join(root, 'src/content/packs', locale, PACKS[name].file);

export function readPacks(root, locale = 'fa') {
  const packs = {};
  for (const name of Object.keys(PACKS)) {
    const path = packPath(root, name, locale);
    if (existsSync(path)) packs[name] = JSON.parse(readFileSync(path, 'utf-8'));
  }
  return packs;
}

/** Same formatting the packs already have, so a review shows up as a small diff. */
export function writePacks(root, packs, locale = 'fa') {
  for (const name of Object.keys(packs)) writeFileSync(packPath(root, name, locale), `${JSON.stringify(packs[name], null, 2)}\n`);
}

export const countStatus = (packs) => {
  const result = {};
  for (const [name, { key }] of Object.entries(PACKS)) {
    const list = packs[name]?.[key] ?? [];
    result[name] = { total: list.length, reviewed: list.filter((item) => item.reviewStatus === 'reviewed').length };
  }
  return result;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

function option(args, name) {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const [command, ...args] = process.argv.slice(2);

  if (command === 'export') {
    const wanted = option(args, '--out') ?? 'review-sheets';
    const out = isAbsolute(wanted) ? wanted : join(root, wanted);
    mkdirSync(out, { recursive: true });
    const rows = buildRows(readPacks(root));
    for (const game of Object.keys(PACKS)) {
      const own = rows.filter((row) => row.game === game);
      if (own.length === 0) continue;
      writeFileSync(join(out, `${game}-review.csv`), sheetFor(own));
      const open = own.filter((row) => row.status !== 'reviewed').length;
      console.log(`  ${game}-review.csv — ${own.length} rows, ${open} not yet reviewed`);
    }
    console.log(`\nSheets are in ${out}. See docs/REVIEW.md for what to send the reviewer.`);
    return;
  }

  if (command === 'apply') {
    const files = args.filter((arg, i) => !arg.startsWith('--') && !['--reviewer', '--date'].includes(args[i - 1] ?? ''));
    if (files.length === 0) {
      console.error('Usage: npm run content:apply -- <sheet.csv>... --reviewer "Name" [--date YYYY-MM-DD] [--write]');
      process.exit(2);
    }
    const write = args.includes('--write');
    let packs = readPacks(root);
    let totals = { approved: 0, revoked: 0, changes: 0, rejected: 0, skipped: 0 };
    const reviewer = option(args, '--reviewer') ?? '';
    const date = option(args, '--date') ?? todayIso();
    for (const file of files) {
      const [header, ...body] = parseCsv(readFileSync(file, 'utf-8'));
      if (!header || !COLUMNS.every((column) => header.includes(column))) {
        console.error(`${file}: not a review sheet (the header must have: ${COLUMNS.join(', ')}).`);
        process.exit(2);
      }
      const rows = body.map((values) => Object.fromEntries(header.map((name, i) => [name, values[i] ?? ''])));
      let result;
      try {
        result = applyVerdicts(packs, rows, { reviewer, date });
      } catch (error) {
        console.error(error.message);
        process.exit(2);
      }
      packs = result.packs;
      const { report } = result;
      console.log(`\n${file}`);
      console.log(`  approved → reviewed: ${report.approved.length}   back to draft: ${report.revoked.length}   needs changes: ${report.changes.length}   rejected: ${report.rejected.length}   not decided: ${report.untouched}   references added: ${report.referencesAdded}`);
      for (const entry of report.changes) console.log(`  ✎ ${entry.id}: ${entry.notes || '(no notes)'}`);
      for (const entry of report.rejected) console.log(`  ✗ ${entry.id}: ${entry.notes || '(no notes)'}`);
      for (const entry of report.skipped) console.log(`  ! ${entry.id}: ${entry.reason}`);
      for (const id of report.unknownIds) console.log(`  ? no such item: ${id}`);
      for (const entry of report.unknownVerdicts) console.log(`  ? ${entry.id}: unknown verdict "${entry.verdict}" (use approved / changes / reject)`);
      totals = {
        approved: totals.approved + report.approved.length,
        revoked: totals.revoked + report.revoked.length,
        changes: totals.changes + report.changes.length,
        rejected: totals.rejected + report.rejected.length,
        skipped: totals.skipped + report.skipped.length,
      };
    }
    if (write) {
      writePacks(root, packs);
      console.log(`\nWritten: ${totals.approved} item(s) now reviewed by ${reviewer} on ${date}. Run \`npm run check\`.`);
    } else {
      console.log('\nDry run — nothing was written. Add --write to apply.');
    }
    return;
  }

  console.error('Usage: node scripts/content-review.mjs export | apply <sheet.csv> --reviewer "Name" [--write]');
  process.exit(2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
