import type { QuizQuestion } from '@/content/schema';
import { t } from '@/i18n';

/** The correct answer of any question type as display lines (used by the round review). */
export function correctAnswerLines(question: QuizQuestion): string[] {
  switch (question.type) {
    case 'single-choice':
      return [question.choices[question.correctIndex] ?? ''];
    case 'true-false':
      return [question.answer ? t('quiz.play.true') : t('quiz.play.false')];
    case 'matching':
      return question.pairs.map((pair) => `${pair.left} ← ${pair.right}`);
    case 'ordering':
      return question.items.map((item, index) => `${index + 1}. ${item}`);
  }
}
