import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { t } from '@/i18n';
import { Button, cx } from '@/ui';
import type { PreparedQuestion, QuizAnswer } from '../engine';
import styles from './Question.module.css';

type Prepared = Extract<PreparedQuestion, { type: 'true-false' }>;

interface TrueFalseQuestionProps {
  prepared: Prepared;
  phase: 'answering' | 'reviewing';
  onSubmit: (answer: QuizAnswer) => void;
}

export function TrueFalseQuestion({ prepared, phase, onSubmit }: TrueFalseQuestionProps) {
  const [selected, setSelected] = useState<boolean | null>(null);
  const reviewing = phase === 'reviewing';
  const truth = prepared.question.answer;

  return (
    <div className={styles.question}>
      <p className={styles.instruction}>{t('quiz.play.tfInstruction')}</p>
      <h2 className={styles.prompt}>{prepared.question.prompt}</h2>
      <div className={styles.tfRow} role="radiogroup" aria-label={prepared.question.prompt}>
        {([true, false] as const).map((value) => {
          const isSelected = selected === value;
          const isCorrect = reviewing && value === truth;
          const isWrongPick = reviewing && isSelected && value !== truth;
          return (
            <button
              key={String(value)}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={reviewing}
              className={cx(styles.option, isSelected && !reviewing && styles.selected, isCorrect && styles.correct, isWrongPick && styles.wrong)}
              onClick={() => setSelected(value)}
            >
              <span className={styles.marker} aria-hidden="true">
                {isCorrect ? <Check size={16} /> : isWrongPick ? <X size={16} /> : value ? '✓' : '✕'}
              </span>
              <span className={styles.optionText}>{value ? t('quiz.play.true') : t('quiz.play.false')}</span>
            </button>
          );
        })}
      </div>
      {!reviewing ? (
        <div className={styles.actions}>
          <Button disabled={selected === null} onClick={() => selected !== null && onSubmit({ type: 'true-false', value: selected })}>
            {t('quiz.play.submit')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
