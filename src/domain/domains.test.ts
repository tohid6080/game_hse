import { describe, expect, it } from 'vitest';
import { RADAR_DOMAINS, TOPIC_DOMAIN, domainOfTopic } from './domains';
import { HSE_TOPICS } from './topics';

describe('radar domains', () => {
  it('maps every topic to a known domain', () => {
    for (const topic of HSE_TOPICS) expect(RADAR_DOMAINS).toContain(domainOfTopic(topic));
    expect(Object.keys(TOPIC_DOMAIN).sort()).toEqual([...HSE_TOPICS].sort());
  });

  it('gives every radar axis at least one topic (an empty axis could never be filled)', () => {
    for (const domain of RADAR_DOMAINS) {
      expect(HSE_TOPICS.some((topic) => domainOfTopic(topic) === domain), domain).toBe(true);
    }
  });

  it('covers the E and the H of HSE', () => {
    expect(domainOfTopic('environment')).toBe('environment');
    expect(domainOfTopic('occupational-health')).toBe('occupationalHealth');
  });
});
