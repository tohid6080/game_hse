import { Check, Lightbulb, X } from 'lucide-react';
import { useState } from 'react';
import { t } from '@/i18n';
import { Button, cx } from '@/ui';
import type { PreparedQuestion, QuizAnswer } from '../engine';
import styles from './Question.module.css';

type Prepared = Extract<PreparedQuestion, { type: 'single-choice' }>;

interface ChoiceQuestionProps {
  prepared: Prepared;
  phase: 'answering' | 'reviewing';
  /** Option ids taken away by the 50/50 hint. */
  hidden: ReadonlySet<number>;
  hint: { available: boolean; onUse: () => void };
  onSubmit: (answer: QuizAnswer) => void;
}

export function ChoiceQuestion({ prepared, phase, hidden, hint, onSubmit }: ChoiceQuestionProps) {
  const [pick, setPick] = useState<number | null>(null);
  const reviewing = phase === 'reviewing';
  // A selection the hint just took away no longer counts.
  const selected = pick !== null && (reviewing || !hidden.has(pick)) ? pick : null;
  const correctId = prepared.question.correctIndex;
  const visible = prepared.options.filter((option) => reviewing || !hidden.has(option.id));

  return (
    <div className={styles.question}>
      <h2 className={styles.prompt}>{prepared.question.prompt}</h2>
      <div className={styles.options} role="radiogroup" aria-label={prepared.question.prompt}>
        {visible.map((option, index) => {
          const isSelected = selected === option.id;
          const isCorrect = reviewing && option.id === correctId;
          const isWrongPick = reviewing && isSelected && option.id !== correctId;
          return (
            <div key={option.id} role="presentation">
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={reviewing}
                className={cx(styles.option, isSelected && !reviewing && styles.selected, isCorrect && styles.correct, isWrongPick && styles.wrong)}
                onClick={() => setPick(option.id)}
              >
                <span className={styles.marker} aria-hidden="true">
                  {isCorrect ? <Check size={16} /> : isWrongPick ? <X size={16} /> : index + 1}
                </span>
                <span className={styles.optionText}>{option.text}</span>
                {isCorrect ? <span className={styles.verdict}>{t('quiz.play.correctAnswer')}</span> : null}
                {isWrongPick ? <span className={styles.verdict}>{t('quiz.play.yourAnswer')}</span> : null}
              </button>
            </div>
          );
        })}
      </div>
      {!reviewing ? (
        <div className={styles.actions}>
          <Button disabled={selected === null} onClick={() => selected !== null && onSubmit({ type: 'single-choice', optionId: selected })}>
            {t('quiz.play.submit')}
          </Button>
          {hint.available ? (
            <Button variant="secondary" onClick={hint.onUse}>
              <Lightbulb size={18} aria-hidden="true" />
              {t('quiz.play.hint')} {t('quiz.play.hintCost')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
