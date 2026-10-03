import { describe, expect, it } from 'vitest';
import quizFa from '@/content/packs/fa/quiz.json';
import { QuizPackSchema, type QuizQuestion } from '@/content/schema';
import { DAY_MS, nextLeitner, type LeitnerState } from '@/domain/leitner';
import { HSE_TOPICS } from '@/domain/topics';
import { createRng } from '@/lib/rng';
import {
  SHIELD_LAYERS,
  TIME_LIMIT_MS,
  buildStatUpdates,
  canUseHint,
  contentIdForMode,
  dueQuestions,
  hintEliminations,
  isCorrect,
  isFirstTimeEligible,
  modeToSearch,
  parseMode,
  prepareQuestion,
  recordAnswer,
  selectQuestions,
  startRound,
  summarizeRound,
  type QuizAnswer,
  type RoundState,
} from './engine';

const bank: QuizQuestion[] = QuizPackSchema.parse(quizFa).questions;
const NOW = 1_800_000_000_000;
const noStats = new Map<string, LeitnerState>();

function byType<T extends QuizQuestion['type']>(type: T): Extract<QuizQuestion, { type: T }> {
  const found = bank.find((q) => q.type === type);
  if (!found) throw new Error(`no ${type} question in the bank`);
  return found as Extract<QuizQuestion, { type: T }>;
}

describe('prepareQuestion + isCorrect', () => {
  it('single-choice: shuffled options keep stable ids and the right answer is recognised', () => {
    const question = byType('single-choice');
    const prepared = prepareQuestion(question, createRng(3));
    if (prepared.type !== 'single-choice') throw new Error('wrong type');
    expect(prepared.options.map((o) => o.id).sort()).toEqual(question.choices.map((_, i) => i));
    const correct: QuizAnswer = { type: 'single-choice', optionId: question.correctIndex };
    const wrong: QuizAnswer = { type: 'single-choice', optionId: (question.correctIndex + 1) % question.choices.length };
    expect(isCorrect(prepared, correct)).toBe(true);
    expect(isCorrect(prepared, wrong)).toBe(false);
  });

  it('true-false', () => {
    const question = byType('true-false');
    const prepared = prepareQuestion(question, createRng(1));
    expect(isCorrect(prepared, { type: 'true-false', value: question.answer })).toBe(true);
    expect(isCorrect(prepared, { type: 'true-false', value: !question.answer })).toBe(false);
  });

  it('matching: every left item must receive its own right option', () => {
    const question = byType('matching');
    const prepared = prepareQuestion(question, createRng(5));
    if (prepared.type !== 'matching') throw new Error('wrong type');
    const n = question.pairs.length;
    const solved = question.pairs.map((_, i) => i);
    expect(isCorrect(prepared, { type: 'matching', assignment: solved })).toBe(true);
    expect(isCorrect(prepared, { type: 'matching', assignment: [...solved].reverse() })).toBe(false);
    expect(isCorrect(prepared, { type: 'matching', assignment: solved.slice(0, n - 1) })).toBe(false);
    // The shuffled right-hand column is never already in solved order.
    expect(prepared.rightOptions.some((o, i) => o.id !== i)).toBe(true);
  });

  it('ordering: only the exact sequence counts, and the shuffle is never pre-solved', () => {
    const question = byType('ordering');
    for (let seed = 1; seed <= 40; seed += 1) {
      const prepared = prepareQuestion(question, createRng(seed));
      if (prepared.type !== 'ordering') throw new Error('wrong type');
      expect(prepared.options.some((o, i) => o.id !== i)).toBe(true);
    }
    const prepared = prepareQuestion(question, createRng(2));
    const solved = question.items.map((_, i) => i);
    expect(isCorrect(prepared, { type: 'ordering', order: solved })).toBe(true);
    expect(isCorrect(prepared, { type: 'ordering', order: [...solved].reverse() })).toBe(false);
    expect(isCorrect(prepared, { type: 'ordering', order: solved.slice(1) })).toBe(false);
  });

  it('rejects an answer of the wrong type', () => {
    const prepared = prepareQuestion(byType('single-choice'), createRng(1));
    expect(isCorrect(prepared, { type: 'true-false', value: true })).toBe(false);
  });

  it('prepares every question in the real bank without throwing', () => {
    for (const question of bank) expect(() => prepareQuestion(question, createRng(9))).not.toThrow();
  });
});

describe('hint (50/50)', () => {
  it('is only offered for single-choice questions with at least three options', () => {
    expect(canUseHint(prepareQuestion(byType('true-false'), createRng(1)))).toBe(false);
    expect(canUseHint(prepareQuestion(byType('matching'), createRng(1)))).toBe(false);
    expect(canUseHint(prepareQuestion(byType('ordering'), createRng(1)))).toBe(false);
    expect(canUseHint(prepareQuestion(byType('single-choice'), createRng(1)))).toBe(true);
  });

  it('removes two wrong options and never the answer, leaving exactly two', () => {
    const question = byType('single-choice');
    for (let seed = 1; seed <= 30; seed += 1) {
      const prepared = prepareQuestion(question, createRng(seed));
      const removed = hintEliminations(prepared, createRng(seed + 100));
      expect(removed).toHaveLength(2);
      expect(removed).not.toContain(question.correctIndex);
      expect(new Set(removed).size).toBe(2);
    }
  });

  it('on a three-option question removes only one option', () => {
    const three: QuizQuestion = { ...byType('single-choice'), choices: ['a', 'b', 'c'], correctIndex: 1 };
    const prepared = prepareQuestion(three, createRng(1));
    const removed = hintEliminations(prepared, createRng(1));
    expect(removed).toHaveLength(1);
    expect(removed).not.toContain(1);
  });
});

describe('mode helpers', () => {
  it('maps modes to stable content ids', () => {
    expect(contentIdForMode({ kind: 'topic', topic: 'ppe' })).toBe('quiz.topic.ppe');
    expect(contentIdForMode({ kind: 'mixed' })).toBe('quiz.mixed');
    expect(contentIdForMode({ kind: 'weak' })).toBe('quiz.weak');
  });

  it('round-trips modes through the URL and rejects junk', () => {
    for (const topic of HSE_TOPICS) {
      const mode = { kind: 'topic', topic } as const;
      expect(parseMode(new URLSearchParams(modeToSearch(mode)))).toEqual(mode);
    }
    expect(parseMode(new URLSearchParams(modeToSearch({ kind: 'mixed' })))).toEqual({ kind: 'mixed' });
    expect(parseMode(new URLSearchParams(modeToSearch({ kind: 'weak' })))).toEqual({ kind: 'weak' });
    expect(parseMode(new URLSearchParams('mode=topic&topic=nonsense'))).toBeNull();
    expect(parseMode(new URLSearchParams('mode=topic'))).toBeNull();
    expect(parseMode(new URLSearchParams('mode=hack'))).toBeNull();
    expect(parseMode(new URLSearchParams(''))).toBeNull();
  });

  it('pays no first-time bonus for weak-spot review', () => {
    expect(isFirstTimeEligible({ kind: 'weak' })).toBe(false);
    expect(isFirstTimeEligible({ kind: 'mixed' })).toBe(true);
  });
});

describe('selectQuestions', () => {
  const base = {
    questions: bank,
    stats: noStats,
    now: NOW,
    experience: 'intermediate' as const,
    industry: 'general' as const,
  };

  it('is deterministic for a seed', () => {
    const a = selectQuestions({ ...base, mode: { kind: 'mixed' }, rng: createRng(11) });
    const b = selectQuestions({ ...base, mode: { kind: 'mixed' }, rng: createRng(11) });
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });

  it('picks ten distinct questions, ramping from easier to harder', () => {
    const round = selectQuestions({ ...base, mode: { kind: 'mixed' }, rng: createRng(4) });
    expect(round).toHaveLength(10);
    expect(new Set(round.map((q) => q.id)).size).toBe(10);
    const difficulties = round.map((q) => q.difficulty);
    expect(difficulties).toEqual([...difficulties].sort((a, b) => a - b));
  });

  it('topic mode only returns that topic and shrinks to what exists', () => {
    const round = selectQuestions({ ...base, mode: { kind: 'topic', topic: 'law-and-regulation' }, rng: createRng(2) });
    const available = bank.filter((q) => q.topic === 'law-and-regulation').length;
    expect(round).toHaveLength(Math.min(10, available));
    expect(round.every((q) => q.topic === 'law-and-regulation')).toBe(true);
  });

  it('prefers questions the player has not seen yet', () => {
    const seen = new Map<string, LeitnerState>();
    for (const q of bank.slice(0, 40)) seen.set(q.id, nextLeitner(undefined, { correct: true, assisted: false }, NOW));
    const round = selectQuestions({ ...base, stats: seen, mode: { kind: 'mixed' }, rng: createRng(8) });
    expect(round.every((q) => !seen.has(q.id))).toBe(true);
  });

  it('beginners get easier questions first, hard ones only to fill the round', () => {
    const topic = 'hierarchy-of-controls';
    const pool = bank.filter((q) => q.topic === topic);
    const hardCount = pool.filter((q) => q.difficulty === 3).length;
    const round = selectQuestions({ ...base, experience: 'beginner', mode: { kind: 'topic', topic }, rng: createRng(6) });
    expect(round.filter((q) => q.difficulty === 3).length).toBe(Math.max(0, Math.min(10, pool.length) - (pool.length - hardCount)));
  });

  it('weak mode returns only due, previously seen questions — weakest box first', () => {
    const stats = new Map<string, LeitnerState>();
    const [a, b, c, d] = bank;
    stats.set(a!.id, nextLeitner(undefined, { correct: false, assisted: false }, NOW - 2 * DAY_MS)); // box 1, due
    stats.set(b!.id, nextLeitner(nextLeitner(undefined, { correct: true, assisted: false }, NOW - 5 * DAY_MS), { correct: true, assisted: false }, NOW - 5 * DAY_MS)); // box 3, due 3d after -5d → due
    stats.set(c!.id, nextLeitner(undefined, { correct: true, assisted: false }, NOW)); // box 2, due tomorrow → not due
    void d;
    const round = selectQuestions({ ...base, stats, mode: { kind: 'weak' }, rng: createRng(1) });
    const ids = round.map((q) => q.id);
    expect(ids.sort()).toEqual([a!.id, b!.id].sort());
    expect(ids).not.toContain(c!.id);
  });

  it('weak mode with nothing due yields an empty round', () => {
    expect(selectQuestions({ ...base, mode: { kind: 'weak' }, rng: createRng(1) })).toEqual([]);
    expect(dueQuestions(bank, noStats, NOW, 'general')).toEqual([]);
  });

  it('a sector player sees general items and their own sector, not other sectors', () => {
    const sectorOnly: QuizQuestion = { ...bank[0]!, id: 'quiz.test.energy-only', industries: ['energy'] };
    const energy = selectQuestions({
      ...base,
      questions: [sectorOnly],
      industry: 'energy',
      mode: { kind: 'mixed' },
      rng: createRng(1),
    });
    const construction = selectQuestions({
      ...base,
      questions: [sectorOnly],
      industry: 'construction',
      mode: { kind: 'mixed' },
      rng: createRng(1),
    });
    const general = selectQuestions({
      ...base,
      questions: [sectorOnly],
      industry: 'general',
      mode: { kind: 'mixed' },
      rng: createRng(1),
    });
    expect(energy).toHaveLength(1);
    expect(construction).toHaveLength(0);
    expect(general).toHaveLength(1);
  });
});

describe('round state machine', () => {
  const questions = bank.slice(0, 5);

  function play(results: boolean[], timed = false): RoundState {
    let state = startRound(questions);
    results.forEach((correct, i) => {
      state = recordAnswer(state, { question: questions[i]!, correct, hintsUsed: 0, elapsedMs: 1000 }, timed);
    });
    return state;
  }

  it('starts with a full shield and an empty score', () => {
    const state = startRound(questions);
    expect(state).toMatchObject({ total: 5, index: 0, layersLeft: SHIELD_LAYERS, streak: 0, status: 'playing' });
  });

  it('a perfect round is completed and flawless, with a growing streak multiplier', () => {
    const state = play([true, true, true, true, true]);
    const summary = summarizeRound(state);
    expect(state.status).toBe('completed');
    expect(summary).toMatchObject({ answered: 5, correctCount: 5, completed: true, flawless: true, stars: 3 });
    const points = state.results.map((r) => r.points);
    expect(points[1]!).toBeGreaterThan(points[0]! * (questions[1]!.difficulty / questions[0]!.difficulty) * 0.99);
    expect(summary.score).toBe(points.reduce((a, b) => a + b, 0));
  });

  it('every wrong answer breaks one shield layer and resets the streak', () => {
    const state = play([true, true, false]);
    expect(state.layersLeft).toBe(SHIELD_LAYERS - 1);
    expect(state.streak).toBe(0);
    expect(state.results[2]!.points).toBe(0);
    expect(state.status).toBe('playing');
  });

  it('ends early with a broken shield after the third mistake', () => {
    const state = play([false, true, false, false]);
    expect(state.layersLeft).toBe(0);
    expect(state.status).toBe('shield-broken');
    const summary = summarizeRound(state);
    expect(summary.completed).toBe(false);
    expect(summary.flawless).toBe(false);
    expect(summary.answered).toBe(4);
    // Unplayed questions count against accuracy, so a broken shield can't earn a lot of stars.
    expect(summary.stars).toBeLessThanOrEqual(1);
  });

  it('ignores further answers once the round is over', () => {
    const over = play([false, false, false]);
    const after = recordAnswer(over, { question: questions[3]!, correct: true, hintsUsed: 0, elapsedMs: 0 }, false);
    expect(after).toBe(over);
  });

  it('finishing the last question counts as completed even if it cost the last layer', () => {
    const state = play([true, true, false, false, false]);
    expect(state.layersLeft).toBe(0);
    expect(state.status).toBe('completed');
  });

  it('a round with hints is not flawless and earns less', () => {
    let state = startRound(questions);
    for (const q of questions) state = recordAnswer(state, { question: q, correct: true, hintsUsed: 1, elapsedMs: 1000 }, false);
    const summary = summarizeRound(state);
    expect(summary.flawless).toBe(false);
    expect(summary.completed).toBe(true);
    expect(summary.accuracy).toBeCloseTo(0.85);
    expect(summary.stars).toBe(2);
  });

  it('timed mode adds a speed bonus: a fast correct answer beats a slow one', () => {
    const fast = recordAnswer(startRound(questions), { question: questions[0]!, correct: true, hintsUsed: 0, elapsedMs: 1000 }, true);
    const slow = recordAnswer(startRound(questions), { question: questions[0]!, correct: true, hintsUsed: 0, elapsedMs: TIME_LIMIT_MS }, true);
    const untimed = recordAnswer(startRound(questions), { question: questions[0]!, correct: true, hintsUsed: 0, elapsedMs: 1000 }, false);
    expect(fast.results[0]!.points).toBeGreaterThan(slow.results[0]!.points);
    expect(untimed.results[0]!.points).toBe(slow.results[0]!.points);
  });

  it('an empty selection is already completed (nothing to play)', () => {
    expect(startRound([]).status).toBe('completed');
  });
});

describe('buildStatUpdates', () => {
  it('applies the Leitner reducer per answered question, treating hinted answers as assisted', () => {
    const questions = bank.slice(0, 3);
    let state = startRound(questions);
    state = recordAnswer(state, { question: questions[0]!, correct: true, hintsUsed: 0, elapsedMs: 1 }, false);
    state = recordAnswer(state, { question: questions[1]!, correct: true, hintsUsed: 1, elapsedMs: 1 }, false);
    state = recordAnswer(state, { question: questions[2]!, correct: false, hintsUsed: 0, elapsedMs: 1 }, false);

    const previous = new Map<string, LeitnerState>([
      [questions[2]!.id, nextLeitner(nextLeitner(undefined, { correct: true, assisted: false }, NOW), { correct: true, assisted: false }, NOW)],
    ]);
    const rows = buildStatUpdates('p1', state.results, previous, NOW);

    expect(rows.map((r) => r.questionId)).toEqual(questions.map((q) => q.id));
    expect(rows.every((r) => r.profileId === 'p1')).toBe(true);
    expect(rows[0]).toMatchObject({ box: 2, correct: 1, wrong: 0, topic: questions[0]!.topic });
    expect(rows[1]).toMatchObject({ box: 1 }); // assisted: not promoted
    expect(rows[2]).toMatchObject({ box: 1, wrong: 1, correct: 2 }); // was box 3, falls back
  });
});
