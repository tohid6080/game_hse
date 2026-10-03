import { DEFAULT_LOCALE, LOCALES, type LocaleCode, type LocaleMeta } from './locales';
import { fa, type MessageKey, type Messages } from './messages/fa';

export type { LocaleCode, MessageKey };

// Adding a language: create messages/<code>.ts satisfying `Messages`, register it here and in
// locales.ts, add content packs under src/content/packs/<code>/. See docs/ARCHITECTURE.md.
const DICTIONARIES: Record<LocaleCode, Messages> = { fa };

let current: LocaleCode = DEFAULT_LOCALE;

export function getLocale(): LocaleMeta {
  return LOCALES[current];
}

/** Sets <html lang/dir>. Call once at startup (switching language later = apply + reload). */
export function applyLocale(code: LocaleCode = current): void {
  current = code;
  const meta = LOCALES[code];
  document.documentElement.lang = meta.code;
  document.documentElement.dir = meta.dir;
}

const numberFormatters = new Map<string, Intl.NumberFormat>();

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  const key = `${current}:${JSON.stringify(options ?? {})}`;
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(getLocale().intl, options);
    numberFormatters.set(key, formatter);
  }
  return formatter.format(value);
}

/** Dates are stored as timestamps/ISO and shown in the locale's calendar (Jalali for fa). */
export function formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string {
  const meta = getLocale();
  const tag = `${meta.intl}-u-ca-${meta.calendar}`;
  const text = new Intl.DateTimeFormat(tag, options ?? { dateStyle: 'medium' }).format(value);
  // ICU separates date parts with a Latin comma; right-to-left text uses the Arabic comma.
  return meta.dir === 'rtl' ? text.replace(/,/g, '،') : text;
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = DICTIONARIES[current][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === 'number' ? formatNumber(value) : value;
  });
}
