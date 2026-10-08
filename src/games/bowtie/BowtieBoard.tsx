import { CircleCheck, CircleX } from 'lucide-react';
import { useId } from 'react';
import type { BowtieCard, BowtieCase, BowtieCategory } from '@/content/schema';
import { t } from '@/i18n';
import { Button, cx } from '@/ui';
import type { BowtieJudgement, Placements } from './engine';
import styles from './BowtieBoard.module.css';

/** The groups on either side of the top event, in the order they read. */
const BEFORE = ['threat', 'preventive'] as const satisfies readonly BowtieCategory[];
const AFTER = ['mitigating', 'consequence', 'none'] as const satisfies readonly BowtieCategory[];

interface TopEventProps {
  bowtie: BowtieCase;
}

function TopEvent({ bowtie }: TopEventProps) {
  return (
    <div className={styles.top}>
      <p className={styles.topLabel}>{t('bowtie.play.hazard')}</p>
      <p>{bowtie.hazard}</p>
      <p className={styles.topLabel}>{t('bowtie.play.topEvent')}</p>
      <strong>{bowtie.topEvent}</strong>
    </div>
  );
}

interface PlayBoardProps {
  bowtie: BowtieCase;
  cards: readonly BowtieCard[];
  placements: Placements;
  selected: string | null;
  onSelect: (cardId: string | null) => void;
  onPlace: (group: BowtieCategory) => void;
  onUnplace: (cardId: string) => void;
}

/** Play mode: a pile of cards to pick from, and the groups to put them in. */
export function PlayBoard({ bowtie, cards, placements, selected, onSelect, onPlace, onUnplace }: PlayBoardProps) {
  const id = useId();
  const pile = cards.filter((card) => placements[card.id] === undefined);
  const selectedCard = cards.find((card) => card.id === selected);

  const section = (group: BowtieCategory) => {
    const placed = cards.filter((card) => placements[card.id] === group);
    const headingId = `${id}-${group}`;
    return (
      <section key={group} aria-labelledby={headingId} className={styles.group}>
        <h3 id={headingId} className={styles.groupTitle}>
          {t(`bowtie.group.${group}`)}
        </h3>
        <p className={styles.guide}>{t(`bowtie.guide.${group}`)}</p>
        {placed.length === 0 ? (
          <p className={styles.empty}>{t('bowtie.play.noneYet')}</p>
        ) : (
          <ul className={styles.cards}>
            {placed.map((card) => (
              <li key={card.id}>
                <button type="button" className={cx(styles.card, styles.placed)} aria-label={t('bowtie.play.back', { text: card.text })} onClick={() => onUnplace(card.id)}>
                  {card.text}
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" disabled={!selectedCard} aria-label={t('bowtie.play.placeAria', { group: t(`bowtie.group.${group}`) })} onClick={() => onPlace(group)}>
          {t('bowtie.play.place')}
        </Button>
      </section>
    );
  };

  return (
    <div className={styles.board}>
      <section className={styles.pile} aria-labelledby={`${id}-pile`}>
        <h3 id={`${id}-pile`} className={styles.groupTitle}>
          {t('bowtie.play.pile', { count: pile.length })}
        </h3>
        {pile.length === 0 ? (
          <p className={styles.empty}>{t('bowtie.play.pileDone')}</p>
        ) : (
          <>
            <p className={styles.guide}>{selectedCard ? t('bowtie.play.picked', { text: selectedCard.text }) : t('bowtie.play.hint')}</p>
            <ul className={styles.cards}>
              {pile.map((card) => (
                <li key={card.id}>
                  <button
                    type="button"
                    className={cx(styles.card, selected === card.id && styles.selected)}
                    aria-pressed={selected === card.id}
                    onClick={() => onSelect(selected === card.id ? null : card.id)}
                  >
                    {card.text}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {BEFORE.map(section)}
      <TopEvent bowtie={bowtie} />
      {AFTER.map(section)}
    </div>
  );
}

interface ReviewBoardProps {
  bowtie: BowtieCase;
  judgement: BowtieJudgement;
}

/** Review mode: the right bowtie, every card with how the player placed it. */
export function ReviewBoard({ bowtie, judgement }: ReviewBoardProps) {
  const id = useId();
  const outcomeOf = new Map(judgement.cards.map((card) => [card.id, card]));

  const section = (group: BowtieCategory) => {
    const here = bowtie.cards.filter((card) => card.category === group);
    if (here.length === 0) return null;
    const headingId = `${id}-${group}`;
    return (
      <section key={group} aria-labelledby={headingId} className={styles.group}>
        <h3 id={headingId} className={styles.groupTitle}>
          {t(`bowtie.group.${group}`)}
        </h3>
        <ul className={styles.cards}>
          {here.map((card) => {
            const outcome = outcomeOf.get(card.id);
            const right = outcome?.right ?? false;
            return (
              <li key={card.id} className={cx(styles.card, styles.review, right ? styles.right : styles.wrong)}>
                <span className={styles.cardText}>{card.text}</span>
                <span className={styles.outcome}>
                  {right ? <CircleCheck size={16} aria-hidden="true" /> : <CircleX size={16} aria-hidden="true" />}
                  {right ? t('bowtie.review.correct') : t('bowtie.review.wrong')}
                  {!right ? (
                    <>
                      {' · '}
                      {outcome?.given ? t('bowtie.review.yours', { group: t(`bowtie.group.${outcome.given}`) }) : t('bowtie.review.unplaced')}
                    </>
                  ) : null}
                </span>
                <span className={styles.why}>{card.why}</span>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  return (
    <div className={styles.board}>
      {BEFORE.map(section)}
      <TopEvent bowtie={bowtie} />
      {AFTER.map(section)}
    </div>
  );
}
