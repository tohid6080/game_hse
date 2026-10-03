import type { HseTopic } from './topics';

/**
 * The six axes of the competency radar — the way an HSE professional groups the field.
 * Every piece of content belongs to one domain through its topic.
 */
export const RADAR_DOMAINS = [
  'safety',
  'riskAssessment',
  'crisis',
  'law',
  'environment',
  'occupationalHealth',
] as const;

export type RadarDomain = (typeof RADAR_DOMAINS)[number];

/** Exhaustive on purpose: adding a topic without choosing its domain is a compile error. */
export const TOPIC_DOMAIN: Record<HseTopic, RadarDomain> = {
  'hazard-identification': 'riskAssessment',
  'risk-management': 'riskAssessment',
  'hierarchy-of-controls': 'safety',
  'fire-safety': 'safety',
  ppe: 'safety',
  electrical: 'safety',
  'permit-to-work': 'safety',
  'incident-investigation': 'safety',
  emergency: 'crisis',
  'management-systems': 'law',
  'law-and-regulation': 'law',
  environment: 'environment',
  chemical: 'occupationalHealth',
  ergonomics: 'occupationalHealth',
  'occupational-health': 'occupationalHealth',
};

export function domainOfTopic(topic: HseTopic): RadarDomain {
  return TOPIC_DOMAIN[topic];
}
