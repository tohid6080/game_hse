import { describe, expect, it } from 'vitest';
import { RADAR_DOMAINS, TOPIC_DOMAIN } from './domains';
import {
  PRACTICE_TOPICS,
  RADAR_MIN_ANSWERS,
  RADAR_WINDOW,
  computeRadar,
  practiceRoute,
  recommend,
  type RadarAnswer,
  type RadarAttempt,
} from './radar';

const attempt = (finishedAt: number, answers: RadarAnswer[]): RadarAttempt => ({ finishedAt, detail: { answers } });
const many = (topic: RadarAnswer['topic'], correct: boolean, count: number): RadarAnswer[] =>
  Array.from({ length: count }, () => ({ topic, correct }));
const axis = (axes: ReturnType<typeof computeRadar>, domain: (typeof RADAR_DOMAINS)[number]) => axes.find((a) => a.domain === domain)!;

describe('computeRadar', () => {
  it('always returns the six axes in a fixed order, empty when nothing was played', () => {
    const axes = computeRadar([]);
    expect(axes.map((a) => a.domain)).toEqual([...RADAR_DOMAINS]);
    expect(axes.every((a) => a.value === null && a.answered === 0)).toBe(true);
  });

  it('groups answers by the domain of their topic', () => {
    const axes = computeRadar([attempt(1, [...many('fire-safety', true, 2), ...many('ppe', false, 2), ...many('emergency', true, 3)])]);
    expect(axis(axes, 'safety')).toMatchObject({ answered: 4, value: 0.5 });
    expect(axis(axes, 'crisis')).toMatchObject({ answered: 3, value: 1 });
    expect(axis(axes, 'law').value).toBeNull();
  });

  it('shows no number below the minimum number of answers', () => {
    const axes = computeRadar([attempt(1, many('environment', true, RADAR_MIN_ANSWERS - 1))]);
    expect(axis(axes, 'environment')).toMatchObject({ value: null, answered: RADAR_MIN_ANSWERS - 1 });
  });

  it('uses partial credit when an answer has it, and correct/wrong when it does not', () => {
    const axes = computeRadar([
      attempt(1, [
        { topic: 'electrical', correct: false, credit: 0.5 },
        { topic: 'electrical', correct: true, credit: 0.85 },
        { topic: 'electrical', correct: true },
      ]),
    ]);
    expect(axis(axes, 'safety').value).toBeCloseTo((0.5 + 0.85 + 1) / 3);
  });

  it('keeps only the most recent answers, so early mistakes fade', () => {
    const old = attempt(1, many('ppe', false, RADAR_WINDOW));
    const recent = attempt(2, many('ppe', true, RADAR_WINDOW));
    expect(axis(computeRadar([old, recent]), 'safety')).toMatchObject({ value: 1, answered: RADAR_WINDOW });
    // The order of the array does not matter, only the time of the attempt.
    expect(axis(computeRadar([recent, old]), 'safety').value).toBe(1);
    expect(axis(computeRadar([old, attempt(2, many('ppe', true, RADAR_WINDOW / 2))]), 'safety').value).toBeCloseTo(0.5);
  });

  it('tolerates attempts without answer detail and clamps odd credits', () => {
    const axes = computeRadar([{ finishedAt: 1 }, attempt(2, [{ topic: 'ppe', correct: true, credit: 3 }, ...many('ppe', true, 2)])]);
    expect(axis(axes, 'safety').value).toBe(1);
  });
});

describe('recommend', () => {
  it('has nothing to say before anything was played', () => {
    expect(recommend(computeRadar([]))).toBeNull();
  });

  it('points at a domain without data first: the least-played one, the first in axis order on a tie', () => {
    const some = [...many('ppe', true, 6), ...many('emergency', true, 1)];
    expect(recommend(computeRadar([attempt(1, some)]))).toMatchObject({ reason: 'untried', domain: 'riskAssessment' });

    // Everything has data except crisis (one answer) and law (two): crisis is the least played.
    const rest = [...many('hazard-identification', true, 5), ...many('environment', true, 5), ...many('chemical', true, 5)];
    const axes = computeRadar([attempt(1, [...some, ...rest, ...many('law-and-regulation', true, 2)])]);
    expect(recommend(axes)).toMatchObject({ reason: 'untried', domain: 'crisis' });
  });

  it('points at the weakest measured domain once all six are measured', () => {
    const answers = RADAR_DOMAINS.flatMap((domain) => {
      const topic = Object.entries(TOPIC_DOMAIN).find(([, d]) => d === domain)![0] as RadarAnswer['topic'];
      return many(topic, domain !== 'law', 4);
    });
    expect(recommend(computeRadar([attempt(1, answers)]))).toMatchObject({ reason: 'weak', domain: 'law', value: 0 });
  });
});

describe('practiceRoute', () => {
  it('sends the risk domain to its own game and every other domain to a topic of that domain', () => {
    expect(practiceRoute('riskAssessment')).toBe('/games/risk');
    for (const domain of RADAR_DOMAINS.filter((d) => d !== 'riskAssessment')) {
      const topic = PRACTICE_TOPICS[domain]!;
      expect(TOPIC_DOMAIN[topic], domain).toBe(domain);
      expect(practiceRoute(domain)).toBe(`/games/quiz/play?mode=topic&topic=${topic}`);
    }
  });
});
