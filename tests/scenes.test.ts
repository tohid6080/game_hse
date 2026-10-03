import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Scene pictures are files, so they are checked here (this folder is type-checked with Node types). */
const sceneDir = new URL('../src/content/scenes/', import.meta.url);

/** Pixel size of a WebP file, read from its header (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(file: URL): { width: number; height: number } {
  const bytes = readFileSync(file);
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
  const kind = bytes.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  if (kind === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
}

interface ScenePack {
  scenes: Array<{ id: string; image: string; width: number; height: number }>;
}

describe('hazard scene pictures', () => {
  // Validated by src/content/content.test.ts; here only the picture fields matter.
  const pack = JSON.parse(readFileSync(new URL('../src/content/packs/fa/hazard.json', import.meta.url), 'utf-8')) as ScenePack;

  it('exist for every scene, and the declared size is the real size of the file', () => {
    for (const scene of pack.scenes) {
      const file = new URL(`${scene.image}.webp`, sceneDir);
      expect(existsSync(file), scene.image).toBe(true);
      expect(webpSize(file), scene.id).toEqual({ width: scene.width, height: scene.height });
    }
  });

  it('are WebP files of a sensible weight (phones hold the bundle: keep each under 600 KB)', () => {
    for (const scene of pack.scenes) {
      expect(readFileSync(new URL(`${scene.image}.webp`, sceneDir)).byteLength, scene.image).toBeLessThan(600 * 1024);
    }
  });
});
