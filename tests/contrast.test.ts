import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Guards the design tokens: WCAG contrast of the colour pairs the UI really uses, and that the
 * duplicated light-theme blocks (OS preference + forced) can never drift apart.
 */
const css = readFileSync(new URL('../src/ui/tokens.css', import.meta.url), 'utf-8');

function block(selectorPattern: RegExp): Record<string, string> {
  const match = selectorPattern.exec(css);
  if (!match) throw new Error(`block not found: ${selectorPattern}`);
  const start = css.indexOf('{', match.index) + 1;
  const end = css.indexOf('}', start);
  const vars: Record<string, string> = {};
  for (const [, name, value] of css.slice(start, end).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    vars[name!] = value!.trim();
  }
  return vars;
}

const dark = block(/^:root\s*\{/m);
const lightForced = block(/^:root\[data-theme='light'\]\s*\{/m);
const lightMedia = block(/:root:not\(\[data-theme\]\)\s*\{/);

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground token, background token, minimum ratio]. 4.5 = text (AA), 3 = icons/borders. */
const PAIRS: ReadonlyArray<[string, string, number]> = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'surface-2', 4.5],
  ['text-2', 'bg', 4.5],
  ['text-2', 'surface', 4.5],
  ['text-2', 'surface-2', 4.5],
  ['text-3', 'bg', 4.5],
  ['text-3', 'surface', 4.5],
  ['text-3', 'surface-2', 4.5],
  ['on-primary', 'primary', 4.5],
  ['primary-ink', 'bg', 4.5],
  ['primary-ink', 'surface', 4.5],
  ['gold-ink', 'bg', 4.5],
  ['gold-ink', 'surface', 4.5],
  ['nav-active', 'surface', 4.5],
  ['info', 'surface', 4.5],
  ['danger', 'bg', 4.5],
  ['danger', 'surface', 4.5],
  ['success', 'bg', 4.5],
  ['success', 'surface', 4.5],
  ['primary', 'bg', 3],
  ['primary', 'surface', 3],
  ['select', 'surface', 3],
  ['select', 'bg', 3],
  ['gold', 'surface', 3],
  ...[1, 2, 3, 4, 5].map((n): [string, string, number] => [`risk-ink-${n}`, `risk-${n}`, 4.5]),
  ...['bronze', 'silver', 'gold'].map((tier): [string, string, number] => ['tier-ink', `tier-${tier}`, 4.5]),
];

describe.each([
  ['dark', dark],
  ['light (forced)', lightForced],
] as const)('contrast: %s theme', (_name, theme) => {
  // The light block only overrides some tokens; the rest come from the dark block.
  const tokens = { ...dark, ...theme };
  it.each(PAIRS)('%s on %s ≥ %s:1', (fg, bg, minimum) => {
    const ratio = contrast(tokens[fg]!, tokens[bg]!);
    expect(ratio, `${fg} ${tokens[fg]} on ${bg} ${tokens[bg]} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(minimum);
  });
});

describe('token structure', () => {
  it('keeps the OS-preference light block identical to the forced light block', () => {
    expect(lightMedia).toEqual(lightForced);
  });

  it('defines every token the light theme overrides in the dark theme too', () => {
    for (const name of Object.keys(lightForced)) expect(dark, name).toHaveProperty(name);
  });

  it('keeps "selected", "correct" and "primary" visually distinct in both themes', () => {
    for (const theme of [dark, { ...dark, ...lightForced }]) {
      expect(theme.select).not.toBe(theme.success);
      expect(theme.select).not.toBe(theme.primary);
      expect(theme.danger).not.toBe(theme.success);
    }
  });
});
