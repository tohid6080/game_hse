import type { Difficulty } from './scoring';

export const EXPERIENCES = ['beginner', 'intermediate', 'expert'] as const;
export type Experience = (typeof EXPERIENCES)[number];

/** Beginners meet the hardest items only when a round cannot be filled otherwise. */
export const EXPERIENCE_MAX_DIFFICULTY: Record<Experience, Difficulty> = {
  beginner: 2,
  intermediate: 3,
  expert: 3,
};
