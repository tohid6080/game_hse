import { describe, expect, it } from 'vitest';
import { formatDate, formatNumber, getLocale, t } from './index';
import { fa } from './messages/fa';

describe('i18n', () => {
  it('defaults to Persian, right-to-left', () => {
    expect(getLocale().code).toBe('fa');
    expect(getLocale().dir).toBe('rtl');
  });

  it('formats numbers with Persian digits', () => {
    expect(formatNumber(1205)).toMatch(/^[۰-۹٬]+$/);
    expect(t('home.level', { level: 12 })).toBe('سطح ۱۲');
  });

  it('keeps unknown placeholders untouched instead of throwing', () => {
    expect(t('home.level')).toBe('سطح {level}');
  });

  it('formats dates in the Jalali calendar', () => {
    // 2026-03-21 12:00 UTC is 1 Farvardin 1405.
    const text = formatDate(Date.UTC(2026, 2, 21, 12), { dateStyle: 'long', timeZone: 'UTC' });
    expect(text).toContain('فروردین');
    expect(text).toContain('۱۴۰۵');
  });

  it('has a non-empty string for every message key', () => {
    for (const [key, value] of Object.entries(fa)) {
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });
});
