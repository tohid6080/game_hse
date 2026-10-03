/** Real-world HSE skills the games train. Each game feeds exactly one competency. */
export const COMPETENCIES = [
  'hazardId',
  'riskAssessment',
  'emergency',
  'permit',
  'knowledge',
  'barrierThinking',
] as const;

export type Competency = (typeof COMPETENCIES)[number];
