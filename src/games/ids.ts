/** Stable game identifiers. Stored in attempt rows — never rename an existing id. */
export const GAME_IDS = [
  'quiz',
  'findHazard',
  'riskAssessment',
  'emergency',
  'permit',
  'bowtie',
] as const;

export type GameId = (typeof GAME_IDS)[number];
