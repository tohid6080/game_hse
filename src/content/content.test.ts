import { describe, expect, it } from 'vitest';
import { HSE_TOPICS } from '@/domain/topics';
import { DEFAULT_LOCALE, LOCALES } from '@/i18n/locales';
import { RISK_BANDS, bestControlIndex, riskBand, riskScore } from '@/domain/risk';
import { createRng } from '@/lib/rng';
import { BOWTIE_ROUND_LENGTH, selectBowties } from '@/games/bowtie/engine';
import { EMERGENCY_ROUND_LENGTH, selectEmergencies } from '@/games/emergency/engine';
import { PERMIT_ROUND_LENGTH, selectPermits, shouldReject } from '@/games/permit/engine';
import {
  BOWTIE_CATEGORIES,
  BowtieCaseSchema,
  BowtiePackSchema,
  EMERGENCY_TYPES,
  EmergencyCaseSchema,
  EmergencyPackSchema,
  HazardPackSchema,
  HazardSceneSchema,
  PERMIT_TYPES,
  PermitCaseSchema,
  PermitPackSchema,
  QuizPackSchema,
  QuizQuestionSchema,
  RiskPackSchema,
  RiskScenarioSchema,
} from './schema';
import { INDUSTRIES } from '@/domain/industries';

const packs = import.meta.glob<{ default: unknown }>('./packs/*/quiz.json', { eager: true });

/** A review record as the apply-review tool writes it. */
const REVIEWED = { by: 'کارشناس آزمایشی', at: '2026-10-03' };

function localeOf(path: string): string {
  return path.split('/')[2] ?? '';
}

describe('quiz content packs', () => {
  const entries = Object.entries(packs);

  it('ships a pack for the default locale', () => {
    expect(entries.some(([path]) => localeOf(path) === DEFAULT_LOCALE)).toBe(true);
  });

  it.each(entries)('%s is valid and its locale matches its folder', (path, module) => {
    const result = QuizPackSchema.safeParse(module.default);
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.data?.locale).toBe(localeOf(path));
    expect(Object.keys(LOCALES)).toContain(localeOf(path));
  });

  // The loader only casts raw JSON (no runtime validation). That is honest only if parsing never
  // changes anything — i.e. no field relies on a schema default or transform.
  it.each(entries)('%s is complete: parsing it changes nothing', (_path, module) => {
    expect(QuizPackSchema.parse(module.default)).toEqual(module.default);
  });

  it('keeps every translated question id present in the default locale', () => {
    const idsByLocale = new Map<string, Set<string>>();
    for (const [path, module] of entries) {
      const pack = QuizPackSchema.parse(module.default);
      idsByLocale.set(localeOf(path), new Set(pack.questions.map((q) => q.id)));
    }
    const base = idsByLocale.get(DEFAULT_LOCALE) ?? new Set<string>();
    for (const [locale, ids] of idsByLocale) {
      for (const id of ids) expect(base.has(id), `${locale}:${id}`).toBe(true);
    }
  });
});

describe('default-locale question bank coverage', () => {
  const defaultPath = Object.keys(packs).find((path) => localeOf(path) === DEFAULT_LOCALE) ?? '';
  const pack = QuizPackSchema.parse(packs[defaultPath]?.default);

  it('has enough questions for varied rounds', () => {
    expect(pack.questions.length).toBeGreaterThanOrEqual(60);
  });

  it('covers every topic with at least three questions', () => {
    for (const topic of HSE_TOPICS) {
      const count = pack.questions.filter((q) => q.topic === topic).length;
      expect(count, `topic ${topic}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('uses all four question types and all three difficulties', () => {
    expect(new Set(pack.questions.map((q) => q.type))).toEqual(
      new Set(['single-choice', 'true-false', 'matching', 'ordering']),
    );
    expect(new Set(pack.questions.map((q) => q.difficulty))).toEqual(new Set([1, 2, 3]));
  });

  it('has no duplicate prompts', () => {
    const prompts = pack.questions.map((q) => q.prompt);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it('prefixes every id with quiz.', () => {
    for (const question of pack.questions) expect(question.id.startsWith('quiz.')).toBe(true);
  });

  it('does not let the correct choice sit in the same slot every time', () => {
    const slots = pack.questions.flatMap((q) => (q.type === 'single-choice' ? [q.correctIndex] : []));
    expect(new Set(slots).size).toBeGreaterThanOrEqual(3);
  });
});

describe('quiz question rules', () => {
  const single = {
    id: 'quiz.test.one',
    type: 'single-choice',
    reviewStatus: 'draft',
    difficulty: 1,
    topic: 'ppe',
    industries: ['general'],
    prompt: 'سؤال',
    choices: ['الف', 'ب'],
    correctIndex: 0,
    explanation: 'توضیح',
    references: [],
  };

  it('accepts a complete minimal question without altering it', () => {
    expect(QuizQuestionSchema.parse(single)).toEqual(single);
  });

  it('requires industries and references to be written out (no silent defaults)', () => {
    const without = (key: string) => Object.fromEntries(Object.entries(single).filter(([name]) => name !== key));
    const withoutIndustries = without('industries');
    const withoutReferences = without('references');
    expect(QuizQuestionSchema.safeParse(withoutIndustries).success).toBe(false);
    expect(QuizQuestionSchema.safeParse(withoutReferences).success).toBe(false);
  });

  it('rejects an out-of-range correct answer', () => {
    expect(QuizQuestionSchema.safeParse({ ...single, correctIndex: 2 }).success).toBe(false);
  });

  it('rejects duplicate choices', () => {
    expect(QuizQuestionSchema.safeParse({ ...single, choices: ['الف', 'الف'] }).success).toBe(false);
  });

  it('requires a reference once a question is marked reviewed', () => {
    expect(QuizQuestionSchema.safeParse({ ...single, reviewStatus: 'reviewed' }).success).toBe(false);
    expect(
      QuizQuestionSchema.safeParse({
        ...single,
        reviewStatus: 'reviewed',
        review: REVIEWED,
        references: [{ standard: 'ISO 45001:2018', clause: '8.1.2' }],
      }).success,
    ).toBe(true);
  });

  it('rejects ids that are not stable slugs', () => {
    expect(QuizQuestionSchema.safeParse({ ...single, id: 'Bad Id' }).success).toBe(false);
  });

  it('validates true/false questions', () => {
    const tf = { ...single, type: 'true-false', answer: true, choices: undefined, correctIndex: undefined };
    expect(QuizQuestionSchema.safeParse(tf).success).toBe(true);
    expect(QuizQuestionSchema.safeParse({ ...tf, answer: 'yes' }).success).toBe(false);
  });

  it('validates matching questions: 2–6 pairs, unique sides', () => {
    const pair = (left: string, right: string) => ({ left, right });
    const matching = { ...single, type: 'matching', choices: undefined, correctIndex: undefined };
    expect(QuizQuestionSchema.safeParse({ ...matching, pairs: [pair('a', '1'), pair('b', '2')] }).success).toBe(true);
    expect(QuizQuestionSchema.safeParse({ ...matching, pairs: [pair('a', '1')] }).success).toBe(false);
    expect(QuizQuestionSchema.safeParse({ ...matching, pairs: [pair('a', '1'), pair('a', '2')] }).success).toBe(false);
    expect(QuizQuestionSchema.safeParse({ ...matching, pairs: [pair('a', '1'), pair('b', '1')] }).success).toBe(false);
  });

  it('validates ordering questions: 3–6 unique items', () => {
    const ordering = { ...single, type: 'ordering', choices: undefined, correctIndex: undefined };
    expect(QuizQuestionSchema.safeParse({ ...ordering, items: ['a', 'b', 'c'] }).success).toBe(true);
    expect(QuizQuestionSchema.safeParse({ ...ordering, items: ['a', 'b'] }).success).toBe(false);
    expect(QuizQuestionSchema.safeParse({ ...ordering, items: ['a', 'b', 'b'] }).success).toBe(false);
  });

  it('rejects unknown question types', () => {
    expect(QuizQuestionSchema.safeParse({ ...single, type: 'essay' }).success).toBe(false);
  });
});

describe('risk scenario pack', () => {
  const riskPacks = Object.entries(import.meta.glob<{ default: unknown }>('./packs/*/risk.json', { eager: true }));
  const defaultEntry = riskPacks.find(([path]) => localeOf(path) === DEFAULT_LOCALE);
  const pack = RiskPackSchema.parse(defaultEntry?.[1].default);

  it('ships a pack for the default locale, valid and complete (parsing changes nothing)', () => {
    expect(defaultEntry).toBeDefined();
    expect(pack.locale).toBe(DEFAULT_LOCALE);
    expect(RiskPackSchema.parse(defaultEntry![1].default)).toEqual(defaultEntry![1].default);
  });

  it('keeps every translated scenario id present in the default locale', () => {
    const base = new Set(pack.scenarios.map((scenario) => scenario.id));
    for (const [path, module] of riskPacks) {
      for (const scenario of RiskPackSchema.parse(module.default).scenarios) {
        expect(base.has(scenario.id), `${localeOf(path)}:${scenario.id}`).toBe(true);
      }
    }
  });

  it('has enough scenarios for varied rounds', () => {
    expect(pack.scenarios.length).toBeGreaterThanOrEqual(30);
  });

  it('teaches every risk band, not only "high"', () => {
    const bands = new Set(pack.scenarios.map((s) => riskBand(riskScore(s.likelihood, s.severity))));
    expect([...bands].sort()).toEqual([...RISK_BANDS].sort());
  });

  it('spans all difficulties and several radar topics', () => {
    expect(new Set(pack.scenarios.map((s) => s.difficulty))).toEqual(new Set([1, 2, 3]));
    expect(new Set(pack.scenarios.map((s) => s.topic)).size).toBeGreaterThanOrEqual(6);
  });

  it('prefixes ids with risk. and has no duplicate prompts', () => {
    expect(pack.scenarios.every((s) => s.id.startsWith('risk.'))).toBe(true);
    expect(new Set(pack.scenarios.map((s) => s.prompt)).size).toBe(pack.scenarios.length);
  });

  it('offers a most-effective control that is never PPE or administrative when anything better is offered', () => {
    for (const scenario of pack.scenarios) {
      const levels = scenario.controls.map((c) => c.level);
      const best = levels[bestControlIndex(levels)]!;
      if (levels.includes('engineering')) expect(['elimination', 'substitution', 'engineering'], scenario.id).toContain(best);
    }
  });

  it('rejects scenarios with repeated control levels or texts', () => {
    const scenario = pack.scenarios[0]!;
    const twice = { ...scenario, controls: [scenario.controls[0]!, scenario.controls[0]!, scenario.controls[1]!] };
    expect(RiskScenarioSchema.safeParse(twice).success).toBe(false);
    const sameLevel = { ...scenario, controls: scenario.controls.map((c) => ({ ...c, level: 'ppe' as const })) };
    expect(RiskScenarioSchema.safeParse(sameLevel).success).toBe(false);
  });

  it('requires a reference once a scenario is marked reviewed', () => {
    const scenario = pack.scenarios[0]!;
    expect(RiskScenarioSchema.safeParse({ ...scenario, reviewStatus: 'reviewed', review: REVIEWED, references: [] }).success).toBe(false);
    expect(RiskScenarioSchema.safeParse({ ...scenario, reviewStatus: 'reviewed', review: REVIEWED }).success).toBe(true);
  });
});

describe('hazard scene pack', () => {
  const hazardPacks = Object.entries(import.meta.glob<{ default: unknown }>('./packs/*/hazard.json', { eager: true }));
  const defaultEntry = hazardPacks.find(([path]) => localeOf(path) === DEFAULT_LOCALE);
  const pack = HazardPackSchema.parse(defaultEntry?.[1].default);
  const scene = pack.scenes[0]!;

  it('ships a pack for the default locale, valid and complete (parsing changes nothing)', () => {
    expect(defaultEntry).toBeDefined();
    expect(pack.locale).toBe(DEFAULT_LOCALE);
    expect(HazardPackSchema.parse(defaultEntry![1].default)).toEqual(defaultEntry![1].default);
  });

  it('keeps every translated scene and hazard id present in the default locale', () => {
    const base = new Set(pack.scenes.flatMap((s) => [s.id, ...s.hazards.map((h) => h.id)]));
    for (const [path, module] of hazardPacks) {
      for (const s of HazardPackSchema.parse(module.default).scenes) {
        for (const id of [s.id, ...s.hazards.map((h) => h.id)]) expect(base.has(id), `${localeOf(path)}:${id}`).toBe(true);
      }
    }
  });

  it('keeps every hotspot centre on the picture and never lets one hide another', () => {
    for (const s of pack.scenes) {
      const aspect = s.height / s.width;
      for (const [index, hazard] of s.hazards.entries()) {
        for (const other of s.hazards.slice(index + 1)) {
          const distance = Math.hypot(hazard.x - other.x, (hazard.y - other.y) * aspect);
          // The nearest-centre rule decides overlaps, but a centre must stay inside its own circle only.
          expect(distance, `${hazard.id} / ${other.id}`).toBeGreaterThan(Math.max(hazard.radius, other.radius) * 0.6);
        }
      }
    }
  });

  it('teaches a spread: several topics and difficulties, a real control level for each hazard', () => {
    expect(new Set(scene.hazards.map((h) => h.topic)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(scene.hazards.map((h) => h.difficulty))).toEqual(new Set([1, 2, 3]));
    expect(scene.hazards.length).toBeGreaterThanOrEqual(8);
  });

  it('rejects duplicate hazard ids and ids that do not belong to the scene', () => {
    const [first, second, ...rest] = scene.hazards;
    expect(HazardSceneSchema.safeParse({ ...scene, hazards: [first!, { ...second!, id: first!.id }, ...rest] }).success).toBe(false);
    expect(HazardSceneSchema.safeParse({ ...scene, hazards: [{ ...first!, id: 'other.crane' }, second!, ...rest] }).success).toBe(false);
  });

  it('requires references on every hazard once the scene is reviewed', () => {
    // (the starting point is stated here, not inherited from whatever review state the pack is in)
    const unsourced = scene.hazards.map((h) => ({ ...h, references: [] }));
    expect(HazardSceneSchema.safeParse({ ...scene, reviewStatus: 'reviewed', review: REVIEWED, hazards: unsourced }).success).toBe(false);
    const sourced = scene.hazards.map((h) => ({ ...h, references: [{ standard: 'ISO 45001:2018', clause: '8.1.2' }] }));
    expect(HazardSceneSchema.safeParse({ ...scene, reviewStatus: 'reviewed', review: REVIEWED, hazards: sourced }).success).toBe(true);
  });

  it('rejects hotspots outside the picture and absurd radii', () => {
    const [first, ...rest] = scene.hazards;
    expect(HazardSceneSchema.safeParse({ ...scene, hazards: [{ ...first!, x: 1.2 }, ...rest] }).success).toBe(false);
    expect(HazardSceneSchema.safeParse({ ...scene, hazards: [{ ...first!, radius: 0.5 }, ...rest] }).success).toBe(false);
  });
});

describe('review records', () => {
  const quizPack = QuizPackSchema.parse(packs[Object.keys(packs).find((path) => path.includes(`/${DEFAULT_LOCALE}/`)) ?? '']?.default);
  // A question with its review state stated explicitly: no record, whatever the pack currently says.
  const bare = { ...quizPack.questions[0]! };
  delete bare.review;
  const question = { ...bare, reviewStatus: 'draft' as const, references: [{ standard: 'ISO 45001:2018', clause: '8.1.2' }] };

  it('says who reviewed an item and when, or the item is not reviewed', () => {
    expect(QuizQuestionSchema.safeParse({ ...question, reviewStatus: 'reviewed' }).success).toBe(false);
    expect(QuizQuestionSchema.safeParse({ ...question, reviewStatus: 'reviewed', review: REVIEWED }).success).toBe(true);
  });

  it('does not let a draft carry a review record', () => {
    expect(QuizQuestionSchema.safeParse({ ...question, reviewStatus: 'draft', review: REVIEWED }).success).toBe(false);
  });

  it('wants a calendar date and a name', () => {
    expect(QuizQuestionSchema.safeParse({ ...question, reviewStatus: 'reviewed', review: { by: 'x', at: '03/10/2026' } }).success).toBe(false);
    expect(QuizQuestionSchema.safeParse({ ...question, reviewStatus: 'reviewed', review: { by: '', at: '2026-10-03' } }).success).toBe(false);
  });
});

/* ── Permit to Work ────────────────────────────────────────────────────────────────────────── */

const permitPacks = import.meta.glob<{ default: unknown }>('./packs/*/permit.json', { eager: true });

describe('permit content packs', () => {
  const entries = Object.entries(permitPacks);

  it('ships a pack for the default locale', () => {
    expect(entries.some(([path]) => localeOf(path) === DEFAULT_LOCALE)).toBe(true);
  });

  it.each(entries)('%s is valid and its locale matches its folder', (path, module) => {
    const result = PermitPackSchema.safeParse(module.default);
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.data?.locale).toBe(localeOf(path));
  });

  it.each(entries)('%s is complete: parsing it changes nothing', (_path, module) => {
    expect(PermitPackSchema.parse(module.default)).toEqual(module.default);
  });

  it('keeps every translated permit id present in the default locale', () => {
    const idsByLocale = new Map<string, Set<string>>();
    for (const [path, module] of entries) idsByLocale.set(localeOf(path), new Set(PermitPackSchema.parse(module.default).permits.map((p) => p.id)));
    const base = idsByLocale.get(DEFAULT_LOCALE) ?? new Set<string>();
    for (const [locale, ids] of idsByLocale) for (const id of ids) expect(base.has(id), `${locale}:${id}`).toBe(true);
  });
});

describe('default-locale permit bank', () => {
  const defaultPath = Object.keys(permitPacks).find((path) => localeOf(path) === DEFAULT_LOCALE) ?? '';
  const pack = PermitPackSchema.parse(permitPacks[defaultPath]?.default);
  const fields = (permit: (typeof pack.permits)[number]) => permit.sections.flatMap((section) => section.fields);

  it('has enough permits for varied rounds', () => {
    expect(pack.permits.length).toBeGreaterThanOrEqual(12);
  });

  it('covers every permit type and all three difficulties', () => {
    expect(new Set(pack.permits.map((p) => p.permitType))).toEqual(new Set(PERMIT_TYPES));
    expect(new Set(pack.permits.map((p) => p.difficulty))).toEqual(new Set([1, 2, 3]));
  });

  it('mixes valid and defective permits, so "reject everything" does not win', () => {
    const valid = pack.permits.filter((p) => !shouldReject(p)).length;
    expect(valid).toBeGreaterThanOrEqual(3);
    expect(valid / pack.permits.length).toBeLessThanOrEqual(0.4);
  });

  it('has unique titles (the screen and the tests find a permit by its title)', () => {
    const titles = pack.permits.map((p) => p.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('prefixes every id with permit.<type>. and names the file after nothing else', () => {
    for (const permit of pack.permits) expect(permit.id.startsWith(`permit.${permit.permitType}.`), permit.id).toBe(true);
  });

  it('never shows the answer in a label: no field label says it is a defect', () => {
    for (const permit of pack.permits) for (const field of fields(permit)) expect(field.label, `${permit.id}.${field.id}`).not.toMatch(/خطا|اشتباه|ایراد/);
  });

  it('keeps the planted defects a minority of the form, and each reason explains itself', () => {
    for (const permit of pack.permits) {
      expect(permit.defects.length * 2, permit.id).toBeLessThanOrEqual(fields(permit).length);
      for (const defect of permit.defects) expect(defect.why.length, permit.id).toBeGreaterThan(30);
    }
  });

  it('has a critical defect in every defective permit (the issuer must be able to fail it)', () => {
    for (const permit of pack.permits.filter(shouldReject)) expect(permit.defects.some((d) => d.critical), permit.id).toBe(true);
  });

  it('fills a whole round for every sector and experience, with a valid permit in it', () => {
    for (const industry of INDUSTRIES) {
      for (const experience of ['beginner', 'intermediate', 'expert'] as const) {
        const round = selectPermits({ permits: pack.permits, lastSeenAt: new Map(), rng: createRng(7), experience, industry });
        expect(round.length, `${industry}/${experience}`).toBe(PERMIT_ROUND_LENGTH);
        expect(round.some((p) => !shouldReject(p)), `${industry}/${experience} has a valid permit`).toBe(true);
      }
    }
  });
});

describe('permit rules', () => {
  const permit = {
    id: 'permit.hot-work.test',
    reviewStatus: 'draft',
    difficulty: 1,
    topic: 'permit-to-work',
    industries: ['general'],
    title: 'عنوان',
    prompt: 'شرح',
    permitType: 'hot-work',
    sections: [
      { title: 'الف', fields: [{ id: 'gas', label: 'گاز', value: 'انجام نشد' }, { id: 'watch', label: 'آتش‌بان', value: 'ندارد' }] },
      { title: 'ب', fields: [{ id: 'sign', label: 'امضا', value: 'امضا شده' }] },
    ],
    defects: [{ fieldIds: ['gas'], critical: true, why: 'چون' }],
    explanation: 'توضیح',
    references: [],
  };

  it('accepts a complete minimal permit without altering it', () => {
    expect(PermitCaseSchema.parse(permit)).toEqual(permit);
  });

  it('accepts a valid permit with no defects', () => {
    expect(PermitCaseSchema.safeParse({ ...permit, defects: [] }).success).toBe(true);
  });

  it('rejects a defect that points at a field the form does not have', () => {
    expect(PermitCaseSchema.safeParse({ ...permit, defects: [{ fieldIds: ['nope'], critical: true, why: 'چون' }] }).success).toBe(false);
  });

  it('rejects one field belonging to two defects', () => {
    const twice = [{ fieldIds: ['gas'], critical: true, why: 'چون' }, { fieldIds: ['gas', 'watch'], critical: false, why: 'چون' }];
    expect(PermitCaseSchema.safeParse({ ...permit, defects: twice }).success).toBe(false);
  });

  it('rejects duplicate field ids anywhere in the form', () => {
    const clash = { ...permit, sections: [permit.sections[0]!, { title: 'ب', fields: [{ id: 'gas', label: 'دوباره', value: 'x' }] }] };
    expect(PermitCaseSchema.safeParse(clash).success).toBe(false);
  });

  it('requires a reference and a review record once a permit is reviewed', () => {
    expect(PermitCaseSchema.safeParse({ ...permit, reviewStatus: 'reviewed' }).success).toBe(false);
    expect(
      PermitCaseSchema.safeParse({ ...permit, reviewStatus: 'reviewed', review: REVIEWED, references: [{ standard: 'ISO 45001:2018', clause: '8.1.2' }] }).success,
    ).toBe(true);
  });

  it('only allows the permit-to-work topic', () => {
    expect(PermitCaseSchema.safeParse({ ...permit, topic: 'fire-safety' }).success).toBe(false);
  });
});

/* ── Emergency Response ────────────────────────────────────────────────────────────────────── */

const emergencyPacks = import.meta.glob<{ default: unknown }>('./packs/*/emergency.json', { eager: true });

describe('emergency content packs', () => {
  const entries = Object.entries(emergencyPacks);

  it('ships a pack for the default locale', () => {
    expect(entries.some(([path]) => localeOf(path) === DEFAULT_LOCALE)).toBe(true);
  });

  it.each(entries)('%s is valid and its locale matches its folder', (path, module) => {
    const result = EmergencyPackSchema.safeParse(module.default);
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.data?.locale).toBe(localeOf(path));
  });

  it.each(entries)('%s is complete: parsing it changes nothing', (_path, module) => {
    expect(EmergencyPackSchema.parse(module.default)).toEqual(module.default);
  });

  it('keeps every translated case id present in the default locale', () => {
    const idsByLocale = new Map<string, Set<string>>();
    for (const [path, module] of entries) idsByLocale.set(localeOf(path), new Set(EmergencyPackSchema.parse(module.default).cases.map((c) => c.id)));
    const base = idsByLocale.get(DEFAULT_LOCALE) ?? new Set<string>();
    for (const [locale, ids] of idsByLocale) for (const id of ids) expect(base.has(id), `${locale}:${id}`).toBe(true);
  });
});

describe('default-locale emergency bank', () => {
  const defaultPath = Object.keys(emergencyPacks).find((path) => localeOf(path) === DEFAULT_LOCALE) ?? '';
  const pack = EmergencyPackSchema.parse(emergencyPacks[defaultPath]?.default);
  const steps = pack.cases.flatMap((item) => item.steps.map((step) => ({ item, step })));

  it('has enough cases for varied rounds', () => {
    expect(pack.cases.length).toBeGreaterThanOrEqual(8);
  });

  it('covers every emergency type and all three difficulties', () => {
    expect(new Set(pack.cases.map((c) => c.emergencyType))).toEqual(new Set(EMERGENCY_TYPES));
    expect(new Set(pack.cases.map((c) => c.difficulty))).toEqual(new Set([1, 2, 3]));
  });

  it('has unique titles (the screen and the tests find a case by its title)', () => {
    const titles = pack.cases.map((c) => c.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('prefixes every id with emergency.<type>.', () => {
    for (const item of pack.cases) expect(item.id.startsWith(`emergency.${item.emergencyType}.`), item.id).toBe(true);
  });

  it('does not let the best option be the longest one every time (a test-wise player would find it)', () => {
    const longest = steps.filter(({ step }) => {
      const best = step.options.find((option) => option.grade === 'best')!;
      return step.options.every((option) => option === best || option.text.length < best.text.length);
    }).length;
    expect(longest / steps.length).toBeLessThanOrEqual(0.6);
  });

  it('does not keep the best option first in the file', () => {
    const first = steps.filter(({ step }) => step.options[0]!.grade === 'best').length;
    expect(first / steps.length).toBeLessThanOrEqual(0.5);
  });

  it('has a "harmful" option and an "acceptable" one often enough to be a real choice', () => {
    const withAcceptable = steps.filter(({ step }) => step.options.some((option) => option.grade === 'acceptable')).length;
    expect(withAcceptable / steps.length).toBeGreaterThanOrEqual(0.3);
  });

  it('fills a whole round for every sector and experience', () => {
    for (const industry of INDUSTRIES) {
      for (const experience of ['beginner', 'intermediate', 'expert'] as const) {
        const round = selectEmergencies({ cases: pack.cases, lastSeenAt: new Map(), rng: createRng(7), experience, industry });
        expect(round.length, `${industry}/${experience}`).toBe(EMERGENCY_ROUND_LENGTH);
      }
    }
  });
});

describe('emergency rules', () => {
  const option = (grade: string, text: string) => ({ text, grade, consequence: 'نتیجه' });
  const step = {
    situation: 'وضعیت',
    options: [option('best', 'الف'), option('acceptable', 'ب'), option('harmful', 'ج')],
    why: 'چون',
  };
  const emergency = {
    id: 'emergency.fire.test',
    reviewStatus: 'draft',
    difficulty: 1,
    topic: 'emergency',
    industries: ['general'],
    title: 'عنوان',
    prompt: 'شرح',
    emergencyType: 'fire',
    steps: [step, step, step],
    explanation: 'توضیح',
    references: [],
  };

  it('accepts a complete minimal case without altering it', () => {
    expect(EmergencyCaseSchema.parse(emergency)).toEqual(emergency);
  });

  it('needs exactly one best option in every step', () => {
    const none = { ...step, options: [option('acceptable', 'الف'), option('harmful', 'ب'), option('harmful', 'ج')] };
    const two = { ...step, options: [option('best', 'الف'), option('best', 'ب'), option('harmful', 'ج')] };
    expect(EmergencyCaseSchema.safeParse({ ...emergency, steps: [none, step, step] }).success).toBe(false);
    expect(EmergencyCaseSchema.safeParse({ ...emergency, steps: [two, step, step] }).success).toBe(false);
  });

  it('needs a harmful option in every step, and no duplicate option text', () => {
    const safe = { ...step, options: [option('best', 'الف'), option('acceptable', 'ب'), option('acceptable', 'ج')] };
    const twin = { ...step, options: [option('best', 'الف'), option('acceptable', 'الف'), option('harmful', 'ج')] };
    expect(EmergencyCaseSchema.safeParse({ ...emergency, steps: [safe, step, step] }).success).toBe(false);
    expect(EmergencyCaseSchema.safeParse({ ...emergency, steps: [twin, step, step] }).success).toBe(false);
  });

  it('needs three to five steps', () => {
    expect(EmergencyCaseSchema.safeParse({ ...emergency, steps: [step, step] }).success).toBe(false);
    expect(EmergencyCaseSchema.safeParse({ ...emergency, steps: [step, step, step, step, step, step] }).success).toBe(false);
  });

  it('requires a reference and a review record once a case is reviewed, and only the emergency topic', () => {
    expect(EmergencyCaseSchema.safeParse({ ...emergency, reviewStatus: 'reviewed' }).success).toBe(false);
    expect(EmergencyCaseSchema.safeParse({ ...emergency, reviewStatus: 'reviewed', review: REVIEWED, references: [{ standard: 'ILO C155' }] }).success).toBe(true);
    expect(EmergencyCaseSchema.safeParse({ ...emergency, topic: 'fire-safety' }).success).toBe(false);
  });
});

/* ── BowTie ────────────────────────────────────────────────────────────────────────────────── */

const bowtiePacks = import.meta.glob<{ default: unknown }>('./packs/*/bowtie.json', { eager: true });

describe('bowtie content packs', () => {
  const entries = Object.entries(bowtiePacks);

  it('ships a pack for the default locale', () => {
    expect(entries.some(([path]) => localeOf(path) === DEFAULT_LOCALE)).toBe(true);
  });

  it.each(entries)('%s is valid and its locale matches its folder', (path, module) => {
    const result = BowtiePackSchema.safeParse(module.default);
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.data?.locale).toBe(localeOf(path));
  });

  it.each(entries)('%s is complete: parsing it changes nothing', (_path, module) => {
    expect(BowtiePackSchema.parse(module.default)).toEqual(module.default);
  });

  it('keeps every translated bowtie id present in the default locale', () => {
    const idsByLocale = new Map<string, Set<string>>();
    for (const [path, module] of entries) idsByLocale.set(localeOf(path), new Set(BowtiePackSchema.parse(module.default).bowties.map((b) => b.id)));
    const base = idsByLocale.get(DEFAULT_LOCALE) ?? new Set<string>();
    for (const [locale, ids] of idsByLocale) for (const id of ids) expect(base.has(id), `${locale}:${id}`).toBe(true);
  });
});

describe('default-locale bowtie bank', () => {
  const defaultPath = Object.keys(bowtiePacks).find((path) => localeOf(path) === DEFAULT_LOCALE) ?? '';
  const pack = BowtiePackSchema.parse(bowtiePacks[defaultPath]?.default);
  const cards = pack.bowties.flatMap((bowtie) => bowtie.cards);
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

  it('has enough bowties for varied rounds', () => {
    expect(pack.bowties.length).toBeGreaterThanOrEqual(8);
  });

  it('covers all three difficulties and several topics', () => {
    expect(new Set(pack.bowties.map((b) => b.difficulty))).toEqual(new Set([1, 2, 3]));
    expect(new Set(pack.bowties.map((b) => b.topic)).size).toBeGreaterThanOrEqual(5);
  });

  it('has unique titles (the screen and the tests find a bowtie by its title)', () => {
    const titles = pack.bowties.map((b) => b.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('prefixes every id with bowtie.', () => {
    for (const bowtie of pack.bowties) expect(bowtie.id.startsWith('bowtie.'), bowtie.id).toBe(true);
  });

  it('keeps cards short enough to read on a phone', () => {
    for (const card of cards) expect(card.text.length, card.text).toBeLessThanOrEqual(110);
  });

  it('does not reveal the group by length: barriers are not systematically longer than threats and consequences', () => {
    const barriers = cards.filter((card) => card.category === 'preventive' || card.category === 'mitigating').map((card) => card.text.length);
    const others = cards.filter((card) => card.category === 'threat' || card.category === 'consequence').map((card) => card.text.length);
    expect(mean(barriers) / mean(others)).toBeLessThanOrEqual(1.4);
    expect(mean(others) / mean(barriers)).toBeLessThanOrEqual(1.4);
  });

  it('does not list the cards grouped by category (the order in the file must not give the answer away)', () => {
    for (const bowtie of pack.bowties) {
      const changes = bowtie.cards.filter((card, index) => index > 0 && card.category !== bowtie.cards[index - 1]!.category).length;
      expect(changes, bowtie.id).toBeGreaterThanOrEqual(Math.floor(bowtie.cards.length / 2));
    }
  });

  it('uses every group, and the "none" distractor in some bowties', () => {
    expect(new Set(cards.map((card) => card.category))).toEqual(new Set(BOWTIE_CATEGORIES));
    expect(pack.bowties.filter((b) => b.cards.some((card) => card.category === 'none')).length).toBeGreaterThanOrEqual(3);
  });

  it('fills a whole round for every sector and experience', () => {
    for (const industry of INDUSTRIES) {
      for (const experience of ['beginner', 'intermediate', 'expert'] as const) {
        const round = selectBowties({ bowties: pack.bowties, lastSeenAt: new Map(), rng: createRng(7), experience, industry });
        expect(round.length, `${industry}/${experience}`).toBe(BOWTIE_ROUND_LENGTH);
      }
    }
  });
});

describe('bowtie rules', () => {
  const card = (id: string, category: string) => ({ id, text: `کارت ${id}`, category, why: 'چون' });
  const bowtie = {
    id: 'bowtie.test',
    reviewStatus: 'draft',
    difficulty: 1,
    topic: 'fire-safety',
    industries: ['general'],
    title: 'عنوان',
    hazard: 'خطر',
    topEvent: 'رویداد',
    prompt: 'شرح',
    cards: [card('a', 'threat'), card('b', 'threat'), card('c', 'preventive'), card('d', 'preventive'), card('e', 'mitigating'), card('f', 'mitigating'), card('g', 'consequence'), card('h', 'consequence')],
    explanation: 'توضیح',
    references: [],
  };

  it('accepts a complete minimal bowtie without altering it', () => {
    expect(BowtieCaseSchema.parse(bowtie)).toEqual(bowtie);
  });

  it('needs at least two cards in each of the four main groups', () => {
    const thin = { ...bowtie, cards: [card('a', 'threat'), card('b', 'threat'), card('c', 'preventive'), card('d', 'preventive'), card('e', 'mitigating'), card('f', 'consequence'), card('g', 'consequence'), card('h', 'none')] };
    expect(BowtieCaseSchema.safeParse(thin).success).toBe(false);
  });

  it('allows at most two distractors', () => {
    const many = { ...bowtie, cards: [...bowtie.cards, card('x', 'none'), card('y', 'none'), card('z', 'none')] };
    expect(BowtieCaseSchema.safeParse(many).success).toBe(false);
    expect(BowtieCaseSchema.safeParse({ ...bowtie, cards: [...bowtie.cards, card('x', 'none'), card('y', 'none')] }).success).toBe(true);
  });

  it('rejects duplicate card ids and duplicate card texts', () => {
    expect(BowtieCaseSchema.safeParse({ ...bowtie, cards: [...bowtie.cards.slice(0, 7), { ...card('h', 'consequence'), id: 'a' }] }).success).toBe(false);
    expect(BowtieCaseSchema.safeParse({ ...bowtie, cards: [...bowtie.cards.slice(0, 7), { ...card('h', 'consequence'), text: 'کارت a' }] }).success).toBe(false);
  });

  it('needs eight to fourteen cards', () => {
    expect(BowtieCaseSchema.safeParse({ ...bowtie, cards: bowtie.cards.slice(0, 7) }).success).toBe(false);
  });

  it('requires a reference and a review record once a bowtie is reviewed', () => {
    expect(BowtieCaseSchema.safeParse({ ...bowtie, reviewStatus: 'reviewed' }).success).toBe(false);
    expect(BowtieCaseSchema.safeParse({ ...bowtie, reviewStatus: 'reviewed', review: REVIEWED, references: [{ standard: 'ISO 31000' }] }).success).toBe(true);
  });
});

