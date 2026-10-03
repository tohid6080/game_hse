/**
 * Hotspot geometry for Find the Hazard. Everything is in *normalised* image coordinates:
 * x/y are fractions of the image width/height, and a circle's radius is a fraction of the WIDTH,
 * so a hotspot stays round whatever the image's aspect ratio and however far the view is zoomed.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Circle extends Point {
  radius: number;
}

/** `aspect` = image height / width. */
export function distanceInWidths(a: Point, b: Point, aspect: number): number {
  return Math.hypot(a.x - b.x, (a.y - b.y) * aspect);
}

/**
 * The hotspot a tap landed on, or null. `slop` widens every circle (in image widths) so a fingertip
 * that lands just outside a small hazard still counts. When circles overlap, the nearest centre wins.
 */
export function hitTest<T extends Circle>(spots: readonly T[], point: Point, aspect: number, slop = 0): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const spot of spots) {
    const distance = distanceInWidths(spot, point, aspect);
    if (distance <= spot.radius + slop && distance < bestDistance) {
      best = spot;
      bestDistance = distance;
    }
  }
  return best;
}

/** Smallest hint ring, in image widths: even a tiny hazard gets an area, never a pinpoint. */
export const HINT_MIN_RADIUS = 0.16;
export const HINT_RADIUS_FACTOR = 2.5;
/** How far the ring's centre is pushed away from the hazard, as a share of the ring radius (< 1). */
const HINT_OFFSET = 0.35;

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/**
 * The area a hint highlights: a ring that always contains the hazard but is deliberately off-centre
 * (by a fixed, id-derived offset) so the hint narrows the search without pointing at the spot.
 */
export function hintRing(spot: Circle & { id: string }, aspect: number): Circle {
  const radius = Math.max(HINT_MIN_RADIUS, spot.radius * HINT_RADIUS_FACTOR);
  const angle = ((hash(spot.id) % 360) * Math.PI) / 180;
  return {
    x: spot.x + Math.cos(angle) * radius * HINT_OFFSET,
    y: spot.y + (Math.sin(angle) * radius * HINT_OFFSET) / aspect,
    radius,
  };
}

/* ── Aiming without touching the picture (keyboard and on-screen arrows) ─────────────────────── */

/** The zoomed view: `scale`, plus the frame-pixel offset of the picture's top-left corner. */
export interface ViewState {
  scale: number;
  x: number;
  y: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Moves the aiming mark by `dxPx`/`dyPx` screen pixels. The step is in screen pixels, so one key
 * press moves the same distance on screen however far the picture is zoomed in.
 */
export function moveCursor(cursor: Point, dxPx: number, dyPx: number, view: ViewState, frameWidth: number, frameHeight: number): Point {
  return {
    x: clamp01(cursor.x + dxPx / (frameWidth * view.scale)),
    y: clamp01(cursor.y + dyPx / (frameHeight * view.scale)),
  };
}

/**
 * Shifts the view the least that brings the mark back inside the frame (with `margin` pixels to
 * spare), so a hazard at the very edge of the picture can be aimed at. The view stays valid: it
 * never shows space beyond the picture.
 */
export function followCursor(view: ViewState, cursor: Point, frameWidth: number, frameHeight: number, margin: number): ViewState {
  const axis = (offset: number, position: number, size: number): number => {
    const screen = offset + position * size * view.scale;
    let next = offset;
    if (screen < margin) next += margin - screen;
    else if (screen > size - margin) next -= screen - (size - margin);
    return Math.min(0, Math.max(size - size * view.scale, next));
  };
  return { scale: view.scale, x: axis(view.x, cursor.x, frameWidth), y: axis(view.y, cursor.y, frameHeight) };
}
