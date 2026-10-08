import { describe, expect, it } from 'vitest';
import { COLUMNS, applyVerdicts, buildRows, countStatus, parseCsv, parseReferenceLines, parseVerdict, sheetFor, toCsv } from '../scripts/content-review.mjs';

const ref = [{ standard: 'ISO 45001:2018', clause: '8.1.2' }];

function packs() {
  return {
    quiz: {
      schemaVersion: 1,
      locale: 'fa',
      questions: [
        { id: 'q.one', type: 'single-choice', reviewStatus: 'draft', difficulty: 1, topic: 'fire-safety', industries: ['general'], prompt: 'پرسش «اول»، با ویرگول', choices: ['الف', 'ب'], correctIndex: 1, explanation: 'چون ب', references: ref },
        { id: 'q.two', type: 'true-false', reviewStatus: 'draft', difficulty: 2, topic: 'fire-safety', industries: ['general'], prompt: 'عبارت', answer: true, explanation: 'چون', references: [] },
        { id: 'q.three', type: 'ordering', reviewStatus: 'reviewed', review: { by: 'قدیمی', at: '2026-01-01' }, difficulty: 1, topic: 'fire-safety', industries: ['general'], prompt: 'ترتیب', items: ['a', 'b', 'c'], explanation: 'چون', references: ref },
      ],
    },
    risk: {
      schemaVersion: 1,
      locale: 'fa',
      scenarios: [
        { id: 'r.one', reviewStatus: 'draft', difficulty: 1, topic: 'fire-safety', industries: ['general'], title: 'عنوان', prompt: 'وضعیت', likelihood: 3, severity: 4, controls: [{ text: 'حذف', level: 'elimination' }, { text: 'ماسک', level: 'ppe' }, { text: 'آموزش', level: 'administrative' }], explanation: 'چون', references: ref },
      ],
    },
    permit: {
      schemaVersion: 1,
      locale: 'fa',
      permits: [
        {
          id: 'p.one',
          reviewStatus: 'draft',
          difficulty: 2,
          topic: 'permit-to-work',
          industries: ['general'],
          title: 'جوشکاری کنار مخزن',
          prompt: 'فرم را بخوان',
          permitType: 'hot-work',
          sections: [
            { title: 'بررسی محل', fields: [{ id: 'gas', label: 'آزمایش گاز', value: 'انجام نشد' }, { id: 'watch', label: 'آتش‌بان', value: 'تعیین شد' }] },
            { title: 'امضاها', fields: [{ id: 'sign', label: 'امضا', value: 'امضا شده' }] },
          ],
          defects: [{ fieldIds: ['gas'], critical: true, why: 'آزمایش گاز نشده است' }],
          explanation: 'چون',
          references: [],
        },
      ],
    },
    emergency: {
      schemaVersion: 1,
      locale: 'fa',
      cases: [
        {
          id: 'e.one',
          reviewStatus: 'draft',
          difficulty: 1,
          topic: 'emergency',
          industries: ['general'],
          title: 'شعله‌ی کوچک',
          prompt: 'روغن شعله می‌گیرد',
          emergencyType: 'fire',
          steps: [
            {
              situation: 'شعله کوچک است',
              options: [
                { text: 'هشدار می‌دهم', grade: 'best', consequence: 'همه خبردار می‌شوند' },
                { text: 'آب می‌ریزم', grade: 'harmful', consequence: 'آتش پخش می‌شود' },
                { text: 'سعی می‌کنم تنها خاموش کنم', grade: 'acceptable', consequence: 'کسی خبر ندارد' },
              ],
              why: 'اول خبر بده',
            },
          ],
          explanation: 'چون',
          references: [],
        },
      ],
    },
    bowtie: {
      schemaVersion: 1,
      locale: 'fa',
      bowties: [
        {
          id: 'b.one',
          reviewStatus: 'draft',
          difficulty: 1,
          topic: 'fire-safety',
          industries: ['general'],
          title: 'نشت از فلنج',
          hazard: 'گاز تحت فشار',
          topEvent: 'نشت گاز',
          prompt: 'کارت‌ها را بچین',
          cards: [
            { id: 'c1', text: 'خوردگی واشر', category: 'threat', why: 'علت نشت' },
            { id: 'c2', text: 'بازرسی دوره‌ای', category: 'preventive', why: 'پیش از نشت' },
            { id: 'c3', text: 'آشکارساز گاز', category: 'mitigating', why: 'پس از نشت' },
            { id: 'c4', text: 'انفجار', category: 'consequence', why: 'پیامد' },
          ],
          explanation: 'چون',
          references: [],
        },
      ],
    },
    hazard: {
      schemaVersion: 1,
      locale: 'fa',
      scenes: [
        {
          id: 'scene-a',
          reviewStatus: 'draft',
          industries: ['general'],
          title: 'کارگاه',
          description: 'توضیح صحنه',
          image: 'site-01',
          imageAlt: 'alt',
          width: 800,
          height: 1000,
          hazards: [
            { id: 'scene-a.crane', difficulty: 1, topic: 'fire-safety', x: 0.5, y: 0.25, radius: 0.1, title: 'جرثقیل', explanation: 'چون', likelihood: 3, severity: 4, control: { text: 'حصار', level: 'engineering' }, references: ref },
            { id: 'scene-a.pipe', difficulty: 2, topic: 'fire-safety', x: 0.2, y: 0.8, radius: 0.05, title: 'لوله', explanation: 'چون', likelihood: 2, severity: 3, control: { text: 'علامت', level: 'administrative' }, references: ref },
          ],
        },
      ],
    },
  };
}

const row = (game, id, verdict, notes = '') => ({ game, id, verdict, notes });
const options = { reviewer: 'دکتر نمونه', date: '2026-10-03' };

describe('CSV', () => {
  it('round-trips commas, quotes, line breaks and Persian text', () => {
    const rows = [['a', 'b,c', 'say "hi"', 'two\nlines', 'سلام، دنیا'], ['', 'x', '', '', '']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('reads Windows line endings and a missing final newline', () => {
    expect(parseCsv('a,b\r\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('starts with a byte-order mark so Excel reads the Persian correctly', () => {
    expect(toCsv([['x']]).charCodeAt(0)).toBe(0xfeff);
  });
});

describe('the sheets', () => {
  it('has one row per question, scenario, permit and hazard, with the columns the reviewer fills', () => {
    const rows = buildRows(packs());
    expect(rows.map((r) => r.id)).toEqual(['q.one', 'q.two', 'q.three', 'r.one', 'p.one', 'e.one', 'b.one', 'scene-a.crane', 'scene-a.pipe']);
    const first = rows[0];
    expect(first.content).toContain('2) ب  ✔');
    expect(first.references).toBe('ISO 45001:2018 §8.1.2');
    expect(rows[7].content).toContain('جای خطر در تصویر');
    expect(rows[7].status).toBe('draft');
    const csv = parseCsv(sheetFor(rows));
    expect(csv[0]).toEqual(COLUMNS);
    expect(csv).toHaveLength(10);
    expect(csv[1][COLUMNS.indexOf('verdict')]).toBe('');
  });
});

describe('verdict words', () => {
  it('understands English and Persian, and tells an empty cell from an unknown word', () => {
    expect(parseVerdict('Approved')).toBe('approved');
    expect(parseVerdict(' تأیید ')).toBe('approved');
    expect(parseVerdict('اصلاح')).toBe('changes');
    expect(parseVerdict('رد')).toBe('reject');
    expect(parseVerdict('')).toBeNull();
    expect(parseVerdict(undefined)).toBeNull();
    expect(parseVerdict('شاید')).toBe('unknown');
  });
});

describe('applying a reviewer\'s sheet', () => {
  it('marks approved items reviewed with the reviewer and the date, and touches nothing else', () => {
    const before = packs();
    const { packs: after, report } = applyVerdicts(before, [row('quiz', 'q.one', 'approved'), row('risk', 'r.one', 'تایید')], options);
    expect(after.quiz.questions[0]).toMatchObject({ reviewStatus: 'reviewed', review: { by: 'دکتر نمونه', at: '2026-10-03' } });
    expect(after.risk.scenarios[0].reviewStatus).toBe('reviewed');
    expect(after.quiz.questions[1].reviewStatus).toBe('draft');
    expect(report.approved).toEqual(['q.one', 'r.one']);
    expect(before.quiz.questions[0].reviewStatus).toBe('draft'); // the input is never modified
  });

  it('never approves an item that cites no reference', () => {
    const { packs: after, report } = applyVerdicts(packs(), [row('quiz', 'q.two', 'approved')], options);
    expect(after.quiz.questions[1].reviewStatus).toBe('draft');
    expect(report.skipped).toEqual([{ id: 'q.two', reason: expect.stringContaining('no reference') }]);
  });

  it('sends "changes" and "reject" back to draft, revoking an earlier approval, and keeps the notes', () => {
    const { packs: after, report } = applyVerdicts(packs(), [row('quiz', 'q.three', 'changes', 'ترتیب مرحله‌ی دوم و سوم عوض شود'), row('quiz', 'q.one', 'reject', 'نادرست')], options);
    expect(after.quiz.questions[2].reviewStatus).toBe('draft');
    expect(after.quiz.questions[2].review).toBeUndefined();
    expect(report.revoked).toEqual(['q.three']);
    expect(report.changes).toEqual([{ id: 'q.three', notes: 'ترتیب مرحله‌ی دوم و سوم عوض شود' }]);
    expect(report.rejected).toEqual([{ id: 'q.one', notes: 'نادرست' }]);
  });

  it('leaves undecided rows alone and does not rewrite an existing review', () => {
    const { packs: after, report } = applyVerdicts(packs(), [row('quiz', 'q.one', ''), row('quiz', 'q.three', 'approved')], options);
    expect(after.quiz.questions[0].reviewStatus).toBe('draft');
    expect(after.quiz.questions[2].review).toEqual({ by: 'قدیمی', at: '2026-01-01' });
    expect(report.untouched).toBe(2);
    expect(report.approved).toEqual([]);
  });

  it('reports unknown ids and unknown verdict words instead of guessing', () => {
    const { report } = applyVerdicts(packs(), [row('quiz', 'q.nope', 'approved'), row('quiz', 'q.one', 'شاید')], options);
    expect(report.unknownIds).toEqual(['q.nope']);
    expect(report.unknownVerdicts).toEqual([{ id: 'q.one', verdict: 'شاید' }]);
  });

  it('reviews a scene only when every one of its hazards was approved', () => {
    const both = applyVerdicts(packs(), [row('hazard', 'scene-a.crane', 'approved'), row('hazard', 'scene-a.pipe', 'approved')], options);
    expect(both.packs.hazard.scenes[0]).toMatchObject({ reviewStatus: 'reviewed', review: { by: 'دکتر نمونه' } });

    const half = applyVerdicts(packs(), [row('hazard', 'scene-a.crane', 'approved')], options);
    expect(half.packs.hazard.scenes[0].reviewStatus).toBe('draft');
    expect(half.report.skipped[0].reason).toContain('scene-a.pipe');

    const one = applyVerdicts(packs(), [row('hazard', 'scene-a.crane', 'approved'), row('hazard', 'scene-a.pipe', 'changes', 'جای لوله جابه‌جا شود')], options);
    expect(one.packs.hazard.scenes[0].reviewStatus).toBe('draft');
    expect(one.report.changes).toEqual([{ id: 'scene-a.pipe', notes: 'جای لوله جابه‌جا شود' }]);
  });

  it('takes the references a reviewer supplies, and then lets the item be approved', () => {
    const sheet = { ...row('quiz', 'q.two', 'approved'), add_references: 'ISO 45001:2018 §8.1.2 (سلسله‌مراتب کنترل)\nILO C155 (1981)' };
    const { packs: after, report } = applyVerdicts(packs(), [sheet], options);
    expect(after.quiz.questions[1].references).toEqual([
      { standard: 'ISO 45001:2018', clause: '8.1.2', note: 'سلسله‌مراتب کنترل' },
      { standard: 'ILO C155 (1981)' },
    ]);
    expect(after.quiz.questions[1].reviewStatus).toBe('reviewed');
    expect(report.referencesAdded).toBe(2);
  });

  it('does not cite the same clause twice, and ignores references on rows that were not decided or were rejected', () => {
    const dup = applyVerdicts(packs(), [{ ...row('quiz', 'q.one', 'approved'), add_references: 'ISO 45001:2018 §8.1.2' }], options);
    expect(dup.packs.quiz.questions[0].references).toHaveLength(1);
    const undecided = applyVerdicts(packs(), [{ ...row('quiz', 'q.one', ''), add_references: 'ISO 14001:2015 §6.1' }], options);
    expect(undecided.packs.quiz.questions[0].references).toHaveLength(1);
    const rejected = applyVerdicts(packs(), [{ ...row('quiz', 'q.one', 'reject'), add_references: 'ISO 14001:2015 §6.1' }], options);
    expect(rejected.packs.quiz.questions[0].references).toHaveLength(1);
  });

  it('lets a reviewer source every hazard of a scene in the same pass', () => {
    const unsourced = packs();
    for (const hazard of unsourced.hazard.scenes[0].hazards) hazard.references = [];
    const rows = ['scene-a.crane', 'scene-a.pipe'].map((id) => ({ ...row('hazard', id, 'approved'), add_references: 'ISO 45001:2018 §8.1.2' }));
    const { packs: after } = applyVerdicts(unsourced, rows, options);
    expect(after.hazard.scenes[0].reviewStatus).toBe('reviewed');
    expect(after.hazard.scenes[0].hazards.every((hazard) => hazard.references.length === 1)).toBe(true);
  });

  it('refuses to record an anonymous or undated review', () => {
    expect(() => applyVerdicts(packs(), [], { reviewer: ' ', date: '2026-10-03' })).toThrow(/reviewer/);
    expect(() => applyVerdicts(packs(), [], { reviewer: 'x', date: '03/10/2026' })).toThrow(/YYYY-MM-DD/);
  });
});

describe('reference lines', () => {
  it('reads standard, clause and note, each optional but the standard', () => {
    expect(parseReferenceLines('ISO 45001:2018')).toEqual([{ standard: 'ISO 45001:2018' }]);
    expect(parseReferenceLines('ISO 45001:2018 §8.1.2')).toEqual([{ standard: 'ISO 45001:2018', clause: '8.1.2' }]);
    expect(parseReferenceLines('ISO 45001:2018 §8.1.2 (کنترل‌ها)\n\n  ILO C155 (1981) §16 (ماده ۱۶)  ')).toEqual([
      { standard: 'ISO 45001:2018', clause: '8.1.2', note: 'کنترل‌ها' },
      { standard: 'ILO C155 (1981)', clause: '16', note: 'ماده ۱۶' },
    ]);
    // a parenthesis that is part of the standard's own name is not mistaken for a note
    expect(parseReferenceLines('ILO C155 (1981)')).toEqual([{ standard: 'ILO C155 (1981)' }]);
    expect(parseReferenceLines('')).toEqual([]);
    expect(parseReferenceLines(undefined)).toEqual([]);
  });
});

describe('status counts', () => {
  it('counts reviewed items per game', () => {
    expect(countStatus(packs())).toEqual({
      quiz: { total: 3, reviewed: 1 },
      risk: { total: 1, reviewed: 0 },
      hazard: { total: 1, reviewed: 0 },
      permit: { total: 1, reviewed: 0 },
      emergency: { total: 1, reviewed: 0 },
      bowtie: { total: 1, reviewed: 0 },
    });
  });
});

describe('permit rows', () => {
  const permitRow = () => buildRows(packs()).find((r) => r.game === 'permit');

  it('shows the reviewer the form, the planted defect and the right decision', () => {
    const { content, item } = permitRow();
    expect(item).toBe('جوشکاری کنار مخزن');
    expect(content).toContain('- آزمایش گاز: انجام نشد   ⚠ خطای 1 (بحرانی)');
    expect(content).toContain('- آتش‌بان: تعیین شد');
    expect(content).toContain('پاسخ درست: مجوز باید رد شود');
    expect(content).toContain('1. [بحرانی] آزمایش گاز نشده است');
  });

  it('says a valid permit must be approved', () => {
    const valid = packs();
    valid.permit.permits[0].defects = [];
    expect(buildRows(valid).find((r) => r.game === 'permit').content).toContain('پاسخ درست: مجوز سالم است و باید تأیید شود.');
  });

  it('is reviewed only with a reference, which the reviewer adds in the same pass', () => {
    const refused = applyVerdicts(packs(), [row('permit', 'p.one', 'approved')], options);
    expect(refused.packs.permit.permits[0].reviewStatus).toBe('draft');
    expect(refused.report.skipped).toHaveLength(1);

    const sourced = applyVerdicts(packs(), [{ ...row('permit', 'p.one', 'approved'), add_references: 'OSHA §1910.252' }], options);
    expect(sourced.packs.permit.permits[0]).toMatchObject({ reviewStatus: 'reviewed', review: { by: 'دکتر نمونه' } });
  });
});

describe('emergency rows', () => {
  const emergencyRow = () => buildRows(packs()).find((r) => r.game === 'emergency');

  it('shows the reviewer every option with its grade and consequence, and why the best one is best', () => {
    const { content, item } = emergencyRow();
    expect(item).toBe('شعله‌ی کوچک');
    expect(content).toContain('# مرحله‌ی 1: شعله کوچک است');
    expect(content).toContain('- [best] هشدار می‌دهم  ⟶  همه خبردار می‌شوند');
    expect(content).toContain('- [harmful] آب می‌ریزم  ⟶  آتش پخش می‌شود');
    expect(content).toContain('چرا بهترین: اول خبر بده');
  });

  it('is reviewed only with a reference, which the reviewer adds in the same pass', () => {
    const refused = applyVerdicts(packs(), [row('emergency', 'e.one', 'approved')], options);
    expect(refused.packs.emergency.cases[0].reviewStatus).toBe('draft');
    expect(refused.report.skipped).toHaveLength(1);

    const sourced = applyVerdicts(packs(), [{ ...row('emergency', 'e.one', 'approved'), add_references: 'ILO C155 §8' }], options);
    expect(sourced.packs.emergency.cases[0]).toMatchObject({ reviewStatus: 'reviewed', review: { by: 'دکتر نمونه' } });
  });
});

describe('bowtie rows', () => {
  const bowtieRow = () => buildRows(packs()).find((r) => r.game === 'bowtie');

  it('shows the reviewer the centre of the diagram and each card under the group the key puts it in', () => {
    const { content, item } = bowtieRow();
    expect(item).toBe('نشت از فلنج');
    expect(content).toContain('خطر: گاز تحت فشار');
    expect(content).toContain('رویداد اصلی: نشت گاز');
    expect(content).toContain('# preventive\n- بازرسی دوره‌ای  (چرا: پیش از نشت)');
    expect(content).toContain('# consequence\n- انفجار  (چرا: پیامد)');
    expect(content).not.toContain('# none');
  });

  it('is reviewed only with a reference, which the reviewer adds in the same pass', () => {
    const refused = applyVerdicts(packs(), [row('bowtie', 'b.one', 'approved')], options);
    expect(refused.packs.bowtie.bowties[0].reviewStatus).toBe('draft');
    expect(refused.report.skipped).toHaveLength(1);

    const sourced = applyVerdicts(packs(), [{ ...row('bowtie', 'b.one', 'approved'), add_references: 'ISO 31000 §6' }], options);
    expect(sourced.packs.bowtie.bowties[0]).toMatchObject({ reviewStatus: 'reviewed', review: { by: 'دکتر نمونه' } });
  });
});

