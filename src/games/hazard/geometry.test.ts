import { describe, expect, it } from 'vitest';
import { HINT_MIN_RADIUS, distanceInWidths, followCursor, hintRing, hitTest, moveCursor } from './geometry';

const portrait = 1.25; // height / width of a 4:5 scene
const spots = [
  { id: 'a', x: 0.3, y: 0.3, radius: 0.1 },
  { id: 'b', x: 0.8, y: 0.8, radius: 0.05 },
];

describe('hitTest', () => {
  it('hits inside a circle and misses outside it', () => {
    expect(hitTest(spots, { x: 0.3, y: 0.3 }, portrait)?.id).toBe('a');
    expect(hitTest(spots, { x: 0.37, y: 0.3 }, portrait)?.id).toBe('a');
    expect(hitTest(spots, { x: 0.45, y: 0.3 }, portrait)).toBeNull();
    expect(hitTest(spots, { x: 0.5, y: 0.5 }, portrait)).toBeNull();
  });

  it('keeps circles round on any aspect: vertical distance is scaled by the aspect ratio', () => {
    // 0.07 of the height is 0.0875 widths on a 4:5 image (inside r=0.1); 0.09 of the height is 0.1125 (outside).
    expect(hitTest(spots, { x: 0.3, y: 0.37 }, portrait)?.id).toBe('a');
    expect(hitTest(spots, { x: 0.3, y: 0.39 }, portrait)).toBeNull();
    // On a landscape image the same vertical offset covers fewer widths, so it is inside.
    expect(hitTest(spots, { x: 0.3, y: 0.39 }, 0.6)?.id).toBe('a');
  });

  it('widens every circle by the finger slop', () => {
    const point = { x: 0.45, y: 0.3 };
    expect(hitTest(spots, point, portrait)).toBeNull();
    expect(hitTest(spots, point, portrait, 0.06)?.id).toBe('a');
  });

  it('lets the nearest centre win where circles overlap', () => {
    const overlapping = [
      { id: 'big', x: 0.5, y: 0.5, radius: 0.2 },
      { id: 'small', x: 0.6, y: 0.5, radius: 0.04 },
    ];
    expect(hitTest(overlapping, { x: 0.6, y: 0.5 }, portrait)?.id).toBe('small');
    expect(hitTest(overlapping, { x: 0.52, y: 0.5 }, portrait)?.id).toBe('big');
  });

  it('is symmetric: distanceInWidths ignores argument order', () => {
    const a = { x: 0.1, y: 0.2 };
    const b = { x: 0.4, y: 0.9 };
    expect(distanceInWidths(a, b, portrait)).toBeCloseTo(distanceInWidths(b, a, portrait));
  });
});

describe('hintRing', () => {
  it('always contains the hazard, but never centres on it', () => {
    for (const id of ['site-01.crane', 'site-01.pipes', 'x', 'warehouse-01.forklift', 'a']) {
      for (const radius of [0.03, 0.06, 0.12, 0.2]) {
        for (const aspect of [0.6, 1, 1.25]) {
          const spot = { id, x: 0.5, y: 0.5, radius };
          const ring = hintRing(spot, aspect);
          expect(ring.radius).toBeGreaterThanOrEqual(HINT_MIN_RADIUS);
          expect(distanceInWidths(ring, spot, aspect) + spot.radius).toBeLessThan(ring.radius);
          expect(distanceInWidths(ring, spot, aspect)).toBeGreaterThan(0);
        }
      }
    }
  });

  it('is stable for a hazard: the ring does not move between hints or renders', () => {
    const spot = { id: 'site-01.crane', x: 0.4, y: 0.4, radius: 0.05 };
    expect(hintRing(spot, 1.25)).toEqual(hintRing(spot, 1.25));
  });
});

describe('aiming without touching the picture', () => {
  const frame = { width: 400, height: 300 };
  const centre = { x: 0.5, y: 0.5 };

  it('moves the mark the same distance on screen at any zoom', () => {
    const fit = moveCursor(centre, 40, 0, { scale: 1, x: 0, y: 0 }, frame.width, frame.height);
    const zoomed = moveCursor(centre, 40, 0, { scale: 4, x: 0, y: 0 }, frame.width, frame.height);
    expect(fit.x).toBeCloseTo(0.6, 6);
    expect(zoomed.x).toBeCloseTo(0.525, 6);
    expect(fit.y).toBe(0.5);
  });

  it('keeps the mark inside the picture', () => {
    const view = { scale: 2, x: -200, y: -150 };
    expect(moveCursor({ x: 0.02, y: 0.98 }, -999, 999, view, frame.width, frame.height)).toEqual({ x: 0, y: 1 });
  });

  it('leaves the view alone while the mark is comfortably on screen', () => {
    const view = { scale: 2, x: -200, y: -150 };
    expect(followCursor(view, centre, frame.width, frame.height, 24)).toEqual(view);
  });

  it('pans just enough to bring a mark that left the frame back in', () => {
    const view = { scale: 2, x: -200, y: -150 };
    // mark at x=0.9 → screen 400*2*0.9-200 = 520, past the right edge (400-24)
    const next = followCursor(view, { x: 0.9, y: 0.5 }, frame.width, frame.height, 24);
    expect(next.x).toBe(-200 - (520 - 376));
    expect(next.y).toBe(-150);
  });

  it('can reach the very edge of the picture, where a centred mark never could', () => {
    const view = { scale: 4, x: -600, y: -450 };
    const atLeft = followCursor(view, { x: 0, y: 0.5 }, frame.width, frame.height, 24);
    // The picture's left edge is lined up with the frame's: nothing beyond it is shown, and the
    // mark, at x=0, sits on the frame's left border (the margin is best effort at an edge).
    expect(atLeft.x).toBe(0);
  });

  it('never returns a view that shows space outside the picture', () => {
    for (const x of [0, 0.3, 1]) {
      for (const y of [0, 0.7, 1]) {
        const next = followCursor({ scale: 3, x: -100, y: -100 }, { x, y }, frame.width, frame.height, 24);
        expect(next.x).toBeLessThanOrEqual(0);
        expect(next.x).toBeGreaterThanOrEqual(frame.width - frame.width * 3);
        expect(next.y).toBeLessThanOrEqual(0);
        expect(next.y).toBeGreaterThanOrEqual(frame.height - frame.height * 3);
      }
    }
  });
});
