import { DEFAULT_LOCALE, type LocaleCode } from '@/i18n/locales';
import type { HazardPack, QuizPack, RiskPack } from './schema';

/**
 * Content packs are bundled JSON modules (never fetched — the app has no network access).
 * They are validated against schema.ts by `npm test`, so the loader only casts.
 * A locale without its own pack falls back to the default locale.
 */
const quizPacks = import.meta.glob<{ default: unknown }>('./packs/*/quiz.json');

export async function loadQuizPack(locale: LocaleCode): Promise<QuizPack> {
  const load = quizPacks[`./packs/${locale}/quiz.json`] ?? quizPacks[`./packs/${DEFAULT_LOCALE}/quiz.json`];
  if (!load) throw new Error(`No quiz pack for locale "${locale}" or the default locale`);
  return (await load()).default as QuizPack;
}

const riskPacks = import.meta.glob<{ default: unknown }>('./packs/*/risk.json');

export async function loadRiskPack(locale: LocaleCode): Promise<RiskPack> {
  const load = riskPacks[`./packs/${locale}/risk.json`] ?? riskPacks[`./packs/${DEFAULT_LOCALE}/risk.json`];
  if (!load) throw new Error(`No risk pack for locale "${locale}" or the default locale`);
  return (await load()).default as RiskPack;
}

const hazardPacks = import.meta.glob<{ default: unknown }>('./packs/*/hazard.json');

export async function loadHazardPack(locale: LocaleCode): Promise<HazardPack> {
  const load = hazardPacks[`./packs/${locale}/hazard.json`] ?? hazardPacks[`./packs/${DEFAULT_LOCALE}/hazard.json`];
  if (!load) throw new Error(`No hazard pack for locale "${locale}" or the default locale`);
  return (await load()).default as HazardPack;
}

/**
 * Scene pictures are bundled files (resolved to local URLs at build time — never fetched from a
 * network). Keyed by file stem, e.g. "site-01" for scenes/site-01.webp.
 */
const sceneImages = import.meta.glob<string>('./scenes/*.webp', { eager: true, query: '?url', import: 'default' });

export function sceneImageUrl(image: string): string | undefined {
  return sceneImages[`./scenes/${image}.webp`];
}
