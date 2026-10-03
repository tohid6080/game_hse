import { describe, expect, it } from 'vitest';
import {
  levelFromXp,
  levelProgress,
  rankTierForLevel,
  totalXpForLevel,
  xpToNextLevel,
} from './levels';

describe('level curve', () => {
  it('matches the documented milestones', () => {
    expect(totalXpForLevel(1)).toBe(0);
    expect(totalXpForLevel(2)).toBe(100);
    expect(totalXpForLevel(3)).toBe(250);
    expect(totalXpForLevel(10)).toBe(2700);
    expect(totalXpForLevel(30)).toBe(23200);
  });

  it('keeps cumulative XP consistent with per-level cost', () => {
    for (let level = 1; level < 80; level += 1) {
      expect(totalXpForLevel(level + 1) - totalXpForLevel(level)).toBe(xpToNextLevel(level));
    }
  });

  it('inverts totalXpForLevel exactly at every boundary', () => {
    for (let level = 1; level <= 200; level += 1) {
      const start = totalXpForLevel(level);
      expect(levelFromXp(start)).toBe(level);
      if (start > 0) expect(levelFromXp(start - 1)).toBe(level - 1);
    }
  });

  it('never moves backwards as XP grows', () => {
    let previous = 1;
    for (let xp = 0; xp <= 30000; xp += 7) {
      const level = levelFromXp(xp);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it('treats invalid XP as zero', () => {
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(levelFromXp(bad)).toBe(1);
    }
  });

  it('reports progress inside the current level', () => {
    expect(levelProgress(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 100, fraction: 0 });
    expect(levelProgress(175)).toEqual({
      level: 2,
      xpIntoLevel: 75,
      xpForNextLevel: 150,
      fraction: 0.5,
    });
  });
});

describe('rank tiers', () => {
  it('maps levels to tiers at the documented thresholds', () => {
    expect(rankTierForLevel(1)).toBe('trainee');
    expect(rankTierForLevel(5)).toBe('trainee');
    expect(rankTierForLevel(6)).toBe('observer');
    expect(rankTierForLevel(11)).toBe('officer');
    expect(rankTierForLevel(21)).toBe('specialist');
    expect(rankTierForLevel(31)).toBe('senior');
    expect(rankTierForLevel(46)).toBe('guardian');
    expect(rankTierForLevel(999)).toBe('guardian');
  });
});
