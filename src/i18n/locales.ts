export type LocaleCode = 'fa';

export interface LocaleMeta {
  code: LocaleCode;
  /** Native name, shown in the language picker (once there is more than one locale). */
  label: string;
  dir: 'rtl' | 'ltr';
  /** BCP 47 tag used for Intl formatting (numbers, dates). */
  intl: string;
  /** Calendar used for dates shown to the player. */
  calendar: 'persian' | 'gregory';
}

export const LOCALES: Record<LocaleCode, LocaleMeta> = {
  fa: { code: 'fa', label: 'فارسی', dir: 'rtl', intl: 'fa-IR', calendar: 'persian' },
};

export const DEFAULT_LOCALE: LocaleCode = 'fa';
