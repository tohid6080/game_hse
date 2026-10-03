import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { formatNumber, t } from '@/i18n';
import { Button, cx } from '@/ui';
import type { PreparedQuestion, QuizAnswer } from '../engine';
import styles from './Question.module.css';

type Prepared = Extract<PreparedQuestion, { type: 'ordering' }>;

interface OrderingQuestionProps {
  prepared: Prepared;
  phase: 'answering' | 'reviewing';
  onSubmit: (answer: QuizAnswer) => void;
}

/** Tap the items in the right order (numbers show your sequence); tap a numbered item to take it back. */
export function OrderingQuestion({ prepared, phase, onSubmit }: OrderingQuestionProps) {
  const [picked, setPicked] = useState<number[]>([]);
  const reviewing = phase === 'reviewing';
  const total = prepared.options.length;

  function toggle(id: number) {
    if (reviewing) return;
    setPicked((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  return (
    <div className={styles.question}>
      <h2 className={styles.prompt}>{prepared.question.prompt}</h2>
      {!reviewing ? <p className={styles.instruction}>{t('quiz.play.orderHint')}</p> : null}
      <ul className={styles.options}>
        {prepared.options.map((option) => {
          const position = picked.indexOf(option.id);
          const ok = reviewing && position === option.id;
          const bad = reviewing && !ok;
          // In review each item says where the player put it and, if that was wrong, where it belongs.
          // An item's id is its place in the correct order.
          const note = !reviewing
            ? null
            : position === -1
              ? t('quiz.play.notPlaced')
              : ok
                ? t('quiz.play.yourPosition', { n: formatNumber(position + 1) })
                : `${t('quiz.play.yourPosition', { n: formatNumber(position + 1) })} · ${t('quiz.play.rightPosition', { n: formatNumber(option.id + 1) })}`;
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={reviewing}
                aria-pressed={position !== -1}
                className={cx(styles.option, position !== -1 && !reviewing && styles.selected, ok && styles.correct, bad && styles.wrong)}
                onClick={() => toggle(option.id)}
              >
                <span className={styles.marker} aria-hidden="true">
                  {ok ? <Check size={16} /> : bad ? <X size={16} /> : position !== -1 ? position + 1 : ''}
                </span>
                <span className={styles.optionText}>
                  {option.text}
                  {note ? <span className={styles.note}>{note}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {reviewing ? (
        <div className={styles.answerKey}>
          <strong>{t('quiz.play.correctOrder')}</strong>
          <ol>
            {prepared.question.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button disabled={picked.length !== total} onClick={() => picked.length === total && onSubmit({ type: 'ordering', order: picked })}>
            {t('quiz.play.submit')}
          </Button>
          {picked.length > 0 ? (
            <Button variant="secondary" onClick={() => setPicked([])}>
              {t('quiz.play.orderReset')}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
