import { RADAR_DOMAINS, TOPIC_DOMAIN, type RadarDomain } from './domains';
import type { HseTopic } from './topics';

/**
 * Competency radar: how well the player is doing in each of the six HSE domains, derived from the
 * attempt log. A domain's value is the mean credit over its most recent answers, so the chart shows
 * current skill rather than punishing early mistakes forever.
 */

/** Answers per domain that count (the most recent ones). */
export const RADAR_WINDOW = 30;
/** Fewer answers than this and a domain is "not enough data" rather than a number. */
export const RADAR_MIN_ANSWERS = 3;

export interface RadarAnswer {
  topic: HseTopic;
  correct: boolean;
  /** 0..1; rounds saved before partial credit existed only have `correct`. */
  credit?: number;
}

export interface RadarAttempt {
  finishedAt: number;
  detail?: { answers: readonly RadarAnswer[] };
}

export interface RadarAxis {
  domain: RadarDomain;
  /** Mean credit 0..1 over the window, or null with too little data. */
  value: number | null;
  /** Answers in the window. */
  answered: number;
}

const creditOf = (answer: RadarAnswer): number => Math.min(1, Math.max(0, answer.credit ?? (answer.correct ? 1 : 0)));

/** One axis per domain, in the fixed `RADAR_DOMAINS` order. */
export function computeRadar(attempts: readonly RadarAttempt[]): RadarAxis[] {
  const byDomain = new Map<RadarDomain, number[]>(RADAR_DOMAINS.map((domain) => [domain, []]));
  const chronological = [...attempts].sort((a, b) => a.finishedAt - b.finishedAt);
  for (const attempt of chronological) {
    for (const answer of attempt.detail?.answers ?? []) {
      byDomain.get(TOPIC_DOMAIN[answer.topic])?.push(creditOf(answer));
    }
  }

  return RADAR_DOMAINS.map((domain) => {
    const window = (byDomain.get(domain) ?? []).slice(-RADAR_WINDOW);
    const enough = window.length >= RADAR_MIN_ANSWERS;
    return {
      domain,
      value: enough ? window.reduce((sum, credit) => sum + credit, 0) / window.length : null,
      answered: window.length,
    };
  });
}

export interface Recommendation {
  domain: RadarDomain;
  /** `untried`: not enough data yet; `weak`: the lowest value among measured domains. */
  reason: 'untried' | 'weak';
  value: number | null;
}

/**
 * What to practise next. A domain with too little data comes first (the radar can't say anything
 * about it yet); once all are measured, the weakest one. Null when nothing has been played at all —
 * then every domain is untried and a particular one would be arbitrary.
 */
export function recommend(axes: readonly RadarAxis[]): Recommendation | null {
  if (axes.every((axis) => axis.answered === 0)) return null;
  const untried = axes.filter((axis) => axis.value === null).sort((a, b) => a.answered - b.answered)[0];
  if (untried) return { domain: untried.domain, reason: 'untried', value: null };
  const weakest = [...axes].sort((a, b) => (a.value ?? 1) - (b.value ?? 1))[0];
  return weakest ? { domain: weakest.domain, reason: 'weak', value: weakest.value } : null;
}

/** Where a recommendation leads: the risk game for its own domain, otherwise a topic round. */
const PRACTICE_TOPIC: Record<Exclude<RadarDomain, 'riskAssessment'>, HseTopic> = {
  safety: 'hierarchy-of-controls',
  crisis: 'emergency',
  law: 'law-and-regulation',
  environment: 'environment',
  occupationalHealth: 'occupational-health',
};

export function practiceRoute(domain: RadarDomain): string {
  return domain === 'riskAssessment' ? '/games/risk' : `/games/quiz/play?mode=topic&topic=${PRACTICE_TOPIC[domain]}`;
}

export const PRACTICE_TOPICS: Readonly<Record<string, HseTopic>> = PRACTICE_TOPIC;
