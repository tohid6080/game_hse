import { describe, expect, it } from 'vitest';
import { NICKNAME_MAX, normalizeNickname, validateNickname } from './validation';

describe('normalizeNickname', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeNickname('  علی   رضا ')).toBe('علی رضا');
    expect(normalizeNickname('\tAli\n')).toBe('Ali');
  });
});

describe('validateNickname', () => {
  it('accepts normal names, Persian or Latin', () => {
    expect(validateNickname('علی', [])).toBeNull();
    expect(validateNickname('Sara', [])).toBeNull();
    expect(validateNickname('  کارشناس   HSE ', [])).toBeNull();
  });

  it('rejects empty, whitespace-only and one-character names', () => {
    expect(validateNickname('', [])).toBe('profile.error.tooShort');
    expect(validateNickname('    ', [])).toBe('profile.error.tooShort');
    expect(validateNickname(' ع ', [])).toBe('profile.error.tooShort');
  });

  it('rejects names over the limit but accepts exactly the limit', () => {
    expect(validateNickname('ا'.repeat(NICKNAME_MAX), [])).toBeNull();
    expect(validateNickname('ا'.repeat(NICKNAME_MAX + 1), [])).toBe('profile.error.tooLong');
  });

  it('rejects names already used by another profile, ignoring case and spacing', () => {
    expect(validateNickname('Sara', ['sara'])).toBe('profile.error.taken');
    expect(validateNickname('علی  رضا', ['علی رضا'])).toBe('profile.error.taken');
    expect(validateNickname('Sara', ['Sarah'])).toBeNull();
  });
});
