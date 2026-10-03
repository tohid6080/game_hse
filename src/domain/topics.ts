/** Subject areas used to tag content and to build "weak spots" practice later on. */
export const HSE_TOPICS = [
  'hazard-identification',
  'risk-management',
  'hierarchy-of-controls',
  'fire-safety',
  'ppe',
  'electrical',
  'chemical',
  'ergonomics',
  'emergency',
  'permit-to-work',
  'management-systems',
  'law-and-regulation',
  'incident-investigation',
  'environment',
  'occupational-health',
] as const;

export type HseTopic = (typeof HSE_TOPICS)[number];
