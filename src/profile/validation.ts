import type { MessageKey } from '@/i18n';

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;

/** Collapses runs of whitespace so "  علی   رضا " and "علی رضا" are the same name. */
export function normalizeNickname(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Returns a message key for the problem, or null when the nickname is acceptable. */
export function validateNickname(raw: string, takenByOthers: readonly string[]): MessageKey | null {
  const name = normalizeNickname(raw);
  if (name.length < NICKNAME_MIN) return 'profile.error.tooShort';
  if (name.length > NICKNAME_MAX) return 'profile.error.tooLong';
  const lower = name.toLocaleLowerCase();
  if (takenByOthers.some((other) => normalizeNickname(other).toLocaleLowerCase() === lower)) {
    return 'profile.error.taken';
  }
  return null;
}
