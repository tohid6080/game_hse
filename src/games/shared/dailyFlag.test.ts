import { describe, expect, it } from 'vitest';
import { dailyTasks } from '@/domain/daily';
import { dayKey } from '@/domain/streak';
import { dailyKeyForRound } from './dailyFlag';

const startedAt = new Date(2026, 5, 15, 10).getTime();
const flagged = new URLSearchParams('daily=1');
const todaysTopic = dailyTasks(dayKey(startedAt))[0]!.topic!;
const otherTopic = dailyTasks(dayKey(startedAt + 86_400_000))[0]!.topic!;

describe('dailyKeyForRound', () => {
  it('needs the daily flag', () => {
    expect(dailyKeyForRound(new URLSearchParams(), 'riskAssessment', startedAt)).toBeUndefined();
    expect(dailyKeyForRound(flagged, 'riskAssessment', startedAt)).toBe('2026-06-15');
    expect(dailyKeyForRound(flagged, 'findHazard', startedAt)).toBe('2026-06-15');
  });

  it('counts a quiz round only for the day\'s own topic', () => {
    expect(dailyKeyForRound(flagged, 'quiz', startedAt, todaysTopic)).toBe('2026-06-15');
    expect(dailyKeyForRound(flagged, 'quiz', startedAt, otherTopic)).toBeUndefined();
    expect(dailyKeyForRound(flagged, 'quiz', startedAt)).toBeUndefined();
  });

  it('ignores games that are not daily missions', () => {
    expect(dailyKeyForRound(flagged, 'bowtie', startedAt)).toBeUndefined();
  });
});
