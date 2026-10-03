import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { t } from '@/i18n';
import { Button, cx } from '@/ui';
import type { PreparedQuestion, QuizAnswer } from '../engine';
import styles from './Question.module.css';

type Prepared = Extract<PreparedQuestion, { type: 'matching' }>;

interface MatchingQuestionProps {
  prepared: Prepared;
  phase: 'answering' | 'reviewing';
  onSubmit: (answer: QuizAnswer) => void;
}

/** Tap an item, then tap its match. Matched pairs share a number; tap a matched item to undo. */
export function MatchingQuestion({ prepared, phase, onSubmit }: MatchingQuestionProps) {
  const { pairs } = prepared.question;
  const [assignment, setAssignment] = useState<Array<number | null>>(() => pairs.map(() => null));
  const [activeLeft, setActiveLeft] = useState<number | null>(null);
  const reviewing = phase === 'reviewing';

  const ownerOf = (rightId: number) => assignment.indexOf(rightId);
  const allMatched = assignment.every((rightId) => rightId !== null);

  function nextOpenLeft(next: Array<number | null>, from: number): number | null {
    for (let step = 1; step <= next.length; step += 1) {
      const index = (from + step) % next.length;
      if (next[index] === null) return index;
    }
    return null;
  }

  function tapLeft(index: number) {
    if (reviewing) return;
    if (assignment[index] !== null) {
      setAssignment((current) => current.map((value, i) => (i === index ? null : value)));
      setActiveLeft(index);
    } else {
      // Always select (never toggle off): after a pairing the next open item is highlighted
      // automatically, and tapping that highlighted item must not silently deselect it.
      setActiveLeft(index);
    }
  }

  function tapRight(rightId: number) {
    if (reviewing) return;
    if (activeLeft !== null) {
      const next = assignment.map((value, i) => (i === activeLeft ? rightId : value === rightId ? null : value));
      setAssignment(next);
      setActiveLeft(nextOpenLeft(next, activeLeft));
      return;
    }
    const owner = ownerOf(rightId);
    if (owner !== -1) {
      setAssignment((current) => current.map((value, i) => (i === owner ? null : value)));
      setActiveLeft(owner);
    }
  }

  return (
    <div className={styles.question}>
      <h2 className={styles.prompt}>{prepared.question.prompt}</h2>
      {!reviewing ? <p className={styles.instruction}>{t('quiz.play.matchHint')}</p> : null}
      <div className={styles.columns}>
        <ul className={styles.column}>
          {pairs.map((pair, index) => {
            const matched = assignment[index] !== null;
            const ok = reviewing && assignment[index] === index;
            const bad = reviewing && !ok;
            return (
              <li key={pair.left}>
                <button
                  type="button"
                  disabled={reviewing}
                  aria-pressed={activeLeft === index}
                  className={cx(styles.option, styles.compact, (matched || activeLeft === index) && !reviewing && styles.selected, ok && styles.correct, bad && styles.wrong)}
                  onClick={() => tapLeft(index)}
                >
                  <span className={styles.marker} aria-hidden="true">
                    {ok ? <Check size={14} /> : bad ? <X size={14} /> : matched ? index + 1 : ''}
                  </span>
                  <span className={styles.optionText}>
                    {pair.left}
                    {bad ? (
                      <span className={styles.note}>
                        {t('quiz.play.correctAnswer')}: {pair.right}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <ul className={styles.column}>
          {prepared.rightOptions.map((option) => {
            const owner = ownerOf(option.id);
            return (
              <li key={option.id}>
                <button
                  type="button"
                  disabled={reviewing}
                  className={cx(styles.option, styles.compact, owner !== -1 && !reviewing && styles.selected)}
                  onClick={() => tapRight(option.id)}
                >
                  <span className={styles.marker} aria-hidden="true">
                    {owner !== -1 ? owner + 1 : ''}
                  </span>
                  <span className={styles.optionText}>{option.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {!reviewing ? (
        <div className={styles.actions}>
          <Button
            disabled={!allMatched}
            onClick={() => allMatched && onSubmit({ type: 'matching', assignment: assignment as number[] })}
          >
            {t('quiz.play.submit')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
