import type { BowtieCard, BowtieCase, BowtieCategory } from '@/content/schema';
import type { Experience } from '@/domain/experience';
import type { IndustryId } from '@/domain/industries';
import { recordResult, type RoundState } from '@/domain/round';
import { shuffle, type Rng } from '@/lib/rng';
import { selectItems } from '../shared/selectItems';

/* Pure engine of the BowTie Challenge: choosing cases, shuffling the cards, judging a placement. */

export const BOWTIE_ROUND_LENGTH = 3;
/** Per-case countdown in timed mode: sorting a dozen cards takes longer than answering a question. */
export const BOWTIE_TIME_LIMIT_MS = 150_000;
/** A bowtie counts as handled (keeps the streak, keeps the shield) when this share of the cards sits in the right group. */
export const CORRECT_THRESHOLD = 0.75;

/** The groups a card can be placed in, in the order they read on the diagram. */
export const PLACEMENT_GROUPS = ['threat', 'preventive', 'mitigating', 'consequence', 'none'] as const satisfies readonly BowtieCategory[];

/** card id → the group the player put it in. A card missing from the map has not been placed. */
export type Placements = Readonly<Record<string, BowtieCategory>>;

export interface PreparedBowtie {
  bowtie: BowtieCase;
  /** The cards in the (shuffled) order they are shown. */
  cards: BowtieCard[];
}

export function prepareBowtie(bowtie: BowtieCase, rng: Rng): PreparedBowtie {
  return { bowtie, cards: shuffle(bowtie.cards, rng) };
}

export interface SelectBowtiesInput {
  bowties: readonly BowtieCase[];
  /** When each bowtie was last played (ms). Missing = never played. */
  lastSeenAt: ReadonlyMap<string, number>;
  rng: Rng;
  experience: Experience;
  industry: IndustryId;
  count?: number;
}

export function selectBowties(input: SelectBowtiesInput): BowtieCase[] {
  const { bowties, ...rest } = input;
  return selectItems({ ...rest, items: bowties, count: input.count ?? BOWTIE_ROUND_LENGTH });
}

export interface CardOutcome {
  id: string;
  expected: BowtieCategory;
  /** Null = the player left it unplaced. */
  given: BowtieCategory | null;
  right: boolean;
}

export interface BowtieJudgement {
  cards: CardOutcome[];
  rightCount: number;
  unplaced: number;
  /**
   * Barriers put on the wrong side of the top event (preventive ↔ mitigating): the mistake this game
   * exists to teach, so the review points it out.
   */
  timingMixups: number;
  /** Share of the cards in the right group, 0..1. */
  credit: number;
  correct: boolean;
}

export function judgeBowtie(bowtie: BowtieCase, placements: Placements): BowtieJudgement {
  const cards: CardOutcome[] = bowtie.cards.map((card) => {
    const given = placements[card.id] ?? null;
    return { id: card.id, expected: card.category, given, right: given === card.category };
  });
  const rightCount = cards.filter((card) => card.right).length;
  const credit = cards.length === 0 ? 0 : rightCount / cards.length;
  const isBarrier = (category: BowtieCategory | null) => category === 'preventive' || category === 'mitigating';
  return {
    cards,
    rightCount,
    unplaced: cards.filter((card) => card.given === null).length,
    timingMixups: cards.filter((card) => !card.right && isBarrier(card.expected) && isBarrier(card.given)).length,
    credit,
    correct: credit >= CORRECT_THRESHOLD,
  };
}

/** Records a judged bowtie on the shared round machine. */
export function recordBowtie(
  state: RoundState,
  input: { bowtie: BowtieCase; judgement: BowtieJudgement; elapsedMs: number },
  timed: boolean,
): RoundState {
  return recordResult(
    state,
    { item: input.bowtie, correct: input.judgement.correct, credit: input.judgement.credit, hintsUsed: 0, elapsedMs: input.elapsedMs },
    timed ? BOWTIE_TIME_LIMIT_MS : null,
  );
}

export { lastSeenFromAttempts } from '../shared/selectItems';
