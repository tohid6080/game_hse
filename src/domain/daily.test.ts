import { describe, expect, it } from 'vitest';
import {
  DAILY_COMPLETION_BONUS,
  DAILY_XP_FACTOR,
  dailyProgress,
  dailyTaskRoute,
  dailyTasks,
  dayNumber,
  taskOfGame,
} from './daily';
import { addDays } from './streak';
import { HSE_TOPICS } from './topics';

describe('dailyTasks', () => {
  it('is the same for the same date and always offers the three games', () => {
    expect(dailyTasks('2026-06-15')).toEqual(dailyTasks('2026-06-15'));
    expect(dailyTasks('2026-06-15').map((task) => task.gameId)).toEqual(['quiz', 'riskAssessment', 'findHazard']);
  });

  it('rotates through every topic with no repeat inside one cycle', () => {
    const topics = Array.from({ length: HSE_TOPICS.length }, (_, index) => dailyTasks(addDays('2026-06-01', index))[0]!.topic);
    expect(new Set(topics).size).toBe(HSE_TOPICS.length);
    expect(dailyTasks(addDays('2026-06-01', HSE_TOPICS.length))[0]!.topic).toBe(topics[0]);
  });

  it('changes topic from one day to the next', () => {
    expect(dailyTasks('2026-06-15')[0]!.topic).not.toBe(dailyTasks('2026-06-16')[0]!.topic);
  });

  it('counts days without timezone drift', () => {
    expect(dayNumber('1970-01-02') - dayNumber('1970-01-01')).toBe(1);
    expect(dayNumber('2026-03-30') - dayNumber('2026-03-29')).toBe(1);
  });

  it('links each mission to its game with the daily flag', () => {
    const [quiz, risk, hazard] = dailyTasks('2026-06-15');
    expect(dailyTaskRoute(quiz!)).toBe(`/games/quiz/play?mode=topic&topic=${quiz!.topic}&daily=1`);
    expect(dailyTaskRoute(risk!)).toBe('/games/risk/play?daily=1');
    expect(dailyTaskRoute(hazard!)).toBe('/games/hazard/play?daily=1');
    expect(taskOfGame('riskAssessment')).toBe('risk');
    expect(taskOfGame('bowtie')).toBeNull();
  });

  it('pays double XP and a flat completion bonus', () => {
    expect(DAILY_XP_FACTOR).toBe(2);
    expect(DAILY_COMPLETION_BONUS).toBe(100);
  });
});

describe('dailyProgress', () => {
  const key = '2026-06-15';

  it('is empty with no attempts', () => {
    expect(dailyProgress(key, [])).toMatchObject({ doneCount: 0, complete: false, done: { quiz: false, risk: false, hazard: false } });
  });

  it('counts only attempts tagged with that day', () => {
    const progress = dailyProgress(key, [
      { gameId: 'quiz', detail: { daily: key } },
      { gameId: 'riskAssessment', detail: { daily: '2026-06-14' } },
      { gameId: 'findHazard' },
    ]);
    expect(progress.done).toEqual({ quiz: true, risk: false, hazard: false });
    expect(progress.doneCount).toBe(1);
  });

  it('is complete once all three missions have a counted round', () => {
    const progress = dailyProgress(key, [
      { gameId: 'quiz', detail: { daily: key } },
      { gameId: 'quiz', detail: { daily: key } },
      { gameId: 'riskAssessment', detail: { daily: key } },
      { gameId: 'findHazard', detail: { daily: key } },
    ]);
    expect(progress).toMatchObject({ doneCount: 3, complete: true });
  });
});
