import { describe, expect, it } from 'vitest';
import { createRng, shuffle } from './rng';

describe('rng', () => {
  it('is deterministic for a seed and varies between seeds', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = [a(), a(), a(), a()];
    expect(seqA).toEqual([b(), b(), b(), b()]);
    expect(seqA).not.toEqual([createRng(43)(), 0, 0, 0]);
    for (const value of seqA) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('shuffles without losing or duplicating items, and without mutating the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = shuffle(input, createRng(7));
    expect([...result].sort((x, y) => x - y)).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(shuffle(input, createRng(7))).toEqual(result);
  });

  it('actually reorders for typical seeds', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(input, createRng(1))).not.toEqual(input);
  });
});
