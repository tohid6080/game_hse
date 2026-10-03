import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, Maximize, Minus, Plus } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { t } from '@/i18n';
import { followCursor, moveCursor, type Point } from './geometry';
import styles from './PanZoomImage.module.css';

/* Zoomable, pannable picture with tap detection. All maths is in pixels of the frame; the picture is
 * laid out at "fit" size (scale 1) and transformed with translate + scale (top-left origin). */

export const MAX_ZOOM = 4;
/** A press that moves less than this and ends within TAP_MAX_MS is a tap, not a drag. */
const TAP_MOVE_PX = 8;
const TAP_MAX_MS = 600;
/** Finger tolerance around hotspots, in screen pixels (converted to image widths per tap). */
export const FINGER_SLOP_PX = 14;
const BUTTON_ZOOM = 1.6;
/** One key press or arrow tap moves the aiming mark this far on screen, at any zoom. */
const AIM_STEP_PX = 24;
/** The view follows the aiming mark so that it never gets closer than this to the frame's border. */
const AIM_MARGIN_PX = 32;
const CENTER: Point = { x: 0.5, y: 0.5 };

interface View {
  scale: number;
  x: number;
  y: number;
}

const FIT: View = { scale: 1, x: 0, y: 0 };

function clampView(view: View, width: number, height: number): View {
  const scale = Math.min(MAX_ZOOM, Math.max(1, view.scale));
  return {
    scale,
    x: Math.min(0, Math.max(width - width * scale, view.x)),
    y: Math.min(0, Math.max(height - height * scale, view.y)),
  };
}

/** Zooms to `scale`, keeping the picture point under frame position (cx, cy) where it is. */
function zoomAt(view: View, scale: number, cx: number, cy: number, width: number, height: number): View {
  const next = Math.min(MAX_ZOOM, Math.max(1, scale));
  const ratio = next / view.scale;
  return clampView({ scale: next, x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio }, width, height);
}

export interface PanZoomHandle {
  reset: () => void;
}

interface PanZoomImageProps {
  src: string;
  alt: string;
  /** Pixel size of the picture: reserves the right shape before it decodes. */
  width: number;
  height: number;
  /** A tap, as a normalised picture point plus the finger tolerance in picture widths at this zoom. */
  onTap?: (point: Point, slop: number) => void;
  handle?: Ref<PanZoomHandle>;
  /** Drawn on top of the picture and zoomed with it (e.g. hazard markers). */
  children?: ReactNode;
}

interface Pointer {
  x: number;
  y: number;
}

interface Gesture {
  pointers: Map<number, Pointer>;
  tap: { id: number; x: number; y: number; at: number } | null;
  pan: { x: number; y: number; view: View } | null;
  pinch: { distance: number; cx: number; cy: number; view: View } | null;
}

export function PanZoomImage({ src, alt, width, height, onTap, handle, children }: PanZoomImageProps) {
  const [view, setView] = useState<View>(FIT);
  const viewRef = useRef<View>(FIT);
  const frameRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>({ pointers: new Map(), tap: null, pan: null, pinch: null });
  // The aiming mark of the keyboard / button controls, in picture coordinates.
  const [aim, setAim] = useState<Point>(CENTER);
  const aimRef = useRef<Point>(CENTER);
  const [assist, setAssist] = useState(false);
  const helpId = useId();

  const update = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const frameSize = useCallback(() => {
    const rect = frameRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 1, height: rect?.height ?? 1, left: rect?.left ?? 0, top: rect?.top ?? 0 };
  }, []);

  const reset = useCallback(() => update(FIT), [update]);
  useImperativeHandle(handle, () => ({ reset }), [reset]);

  /** Zooms around the frame's middle, or around the aiming mark when the button/keyboard controls are in use. */
  const zoomBy = useCallback(
    (factor: number, aimed = false) => {
      const frame = frameSize();
      const view = viewRef.current;
      const cx = aimed ? view.x + aimRef.current.x * frame.width * view.scale : frame.width / 2;
      const cy = aimed ? view.y + aimRef.current.y * frame.height * view.scale : frame.height / 2;
      update(zoomAt(view, view.scale * factor, cx, cy, frame.width, frame.height));
    },
    [frameSize, update],
  );

  /** Moves the aiming mark; the view follows it, so even a hazard on the picture's edge can be reached. */
  const aimBy = useCallback(
    (dx: number, dy: number) => {
      const frame = frameSize();
      const next = moveCursor(aimRef.current, dx, dy, viewRef.current, frame.width, frame.height);
      aimRef.current = next;
      setAim(next);
      update(followCursor(viewRef.current, next, frame.width, frame.height, AIM_MARGIN_PX));
    },
    [frameSize, update],
  );

  /** A tap at the aiming mark: the way to play without touching the picture. */
  function tapAtAim() {
    if (!onTap) return;
    const frame = frameSize();
    onTap(aimRef.current, FINGER_SLOP_PX / (frame.width * viewRef.current.scale));
  }

  // Wheel zoom (desktop / dev). Must be a non-passive native listener to be able to cancel page scroll.
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.002);
      update(
        zoomAt(viewRef.current, viewRef.current.scale * factor, event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height),
      );
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [update]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    event.currentTarget.setPointerCapture(event.pointerId);
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (g.pointers.size === 1) {
      g.tap = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() };
      g.pan = { x: event.clientX, y: event.clientY, view: viewRef.current };
      g.pinch = null;
    } else if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()] as [Pointer, Pointer];
      const frame = frameSize();
      g.tap = null;
      g.pan = null;
      g.pinch = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        cx: (a.x + b.x) / 2 - frame.left,
        cy: (a.y + b.y) / 2 - frame.top,
        view: viewRef.current,
      };
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g.pointers.has(event.pointerId)) return;
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const frame = frameSize();

    if (g.pinch && g.pointers.size >= 2) {
      const [a, b] = [...g.pointers.values()] as [Pointer, Pointer];
      const scale = (g.pinch.view.scale * Math.hypot(a.x - b.x, a.y - b.y)) / g.pinch.distance;
      const cx = (a.x + b.x) / 2 - frame.left;
      const cy = (a.y + b.y) / 2 - frame.top;
      // The picture point that was under the fingers' centre stays under it as they move and spread.
      const px = (g.pinch.cx - g.pinch.view.x) / g.pinch.view.scale;
      const py = (g.pinch.cy - g.pinch.view.y) / g.pinch.view.scale;
      update(clampView({ scale, x: cx - px * scale, y: cy - py * scale }, frame.width, frame.height));
      return;
    }

    if (g.pan && g.pointers.size === 1) {
      const dx = event.clientX - g.pan.x;
      const dy = event.clientY - g.pan.y;
      if (g.tap && Math.hypot(event.clientX - g.tap.x, event.clientY - g.tap.y) > TAP_MOVE_PX) g.tap = null;
      if (!g.tap) update(clampView({ ...g.pan.view, x: g.pan.view.x + dx, y: g.pan.view.y + dy }, frame.width, frame.height));
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g.pointers.has(event.pointerId)) return;
    const tap = g.tap;
    const wasTap =
      tap !== null &&
      tap.id === event.pointerId &&
      g.pointers.size === 1 &&
      performance.now() - tap.at < TAP_MAX_MS &&
      Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= TAP_MOVE_PX;

    g.pointers.delete(event.pointerId);
    g.tap = null;
    g.pinch = null;
    const remaining = [...g.pointers.values()][0];
    // A finger left over after a pinch continues as a pan from where it is now.
    g.pan = remaining ? { x: remaining.x, y: remaining.y, view: viewRef.current } : null;

    if (wasTap && onTap && layerRef.current) {
      const rect = layerRef.current.getBoundingClientRect();
      const point = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
      if (point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1) onTap(point, FINGER_SLOP_PX / rect.width);
    }
  }

  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    g.pointers.delete(event.pointerId);
    g.tap = null;
    g.pinch = null;
    g.pan = null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'Enter':
      case ' ':
        tapAtAim();
        break;
      case '+':
      case '=':
        zoomBy(BUTTON_ZOOM, true);
        break;
      case '-':
        zoomBy(1 / BUTTON_ZOOM, true);
        break;
      case '0':
        reset();
        break;
      case 'ArrowLeft':
        aimBy(-AIM_STEP_PX, 0);
        break;
      case 'ArrowRight':
        aimBy(AIM_STEP_PX, 0);
        break;
      case 'ArrowUp':
        aimBy(0, -AIM_STEP_PX);
        break;
      case 'ArrowDown':
        aimBy(0, AIM_STEP_PX);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  const shape = { '--aw': width, '--ah': height } as CSSProperties;

  return (
    <div className={styles.wrap} style={shape}>
      <div
        ref={frameRef}
        className={styles.frame}
        data-testid="scene-frame"
        role="group"
        aria-label={t('hazard.play.sceneLabel')}
        aria-describedby={helpId}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
      >
        <div
          ref={layerRef}
          className={styles.layer}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, '--zoom': view.scale } as CSSProperties}
        >
          <img className={styles.image} src={src} alt={alt} width={width} height={height} draggable={false} />
          {children}
          {/* Inside the layer so it stays on its spot of the picture; --zoom undoes the scaling so it keeps its size. */}
          <span
            className={`${styles.reticle} ${assist ? styles.reticleOn : ''}`}
            style={{ left: `${aim.x * 100}%`, top: `${aim.y * 100}%` }}
            aria-hidden="true"
          />
        </div>
      </div>
      <p id={helpId} className="sr-only">
        {t('hazard.assist.keys')}
      </p>
      <div className={styles.controls}>
        <button type="button" className={styles.control} onClick={() => zoomBy(BUTTON_ZOOM)} aria-label={t('hazard.zoom.in')} disabled={view.scale >= MAX_ZOOM}>
          <Plus size={20} aria-hidden="true" />
        </button>
        <button type="button" className={styles.control} onClick={() => zoomBy(1 / BUTTON_ZOOM)} aria-label={t('hazard.zoom.out')} disabled={view.scale <= 1}>
          <Minus size={20} aria-hidden="true" />
        </button>
        <button type="button" className={styles.control} onClick={reset} aria-label={t('hazard.zoom.reset')} disabled={view.scale === 1}>
          <Maximize size={18} aria-hidden="true" />
        </button>
        <button type="button" className={styles.control} onClick={() => setAssist((on) => !on)} aria-pressed={assist} aria-label={t('hazard.assist.toggle')}>
          <Crosshair size={20} aria-hidden="true" />
        </button>
      </div>
      {assist ? (
        <div className={styles.assist}>
          <p className={styles.assistHint}>{t('hazard.assist.hint')}</p>
          <div className={styles.pad} dir="ltr">
            <button type="button" className={`${styles.control} ${styles.padUp}`} aria-label={t('hazard.assist.up')} onClick={() => aimBy(0, -AIM_STEP_PX)}>
              <ArrowUp size={20} aria-hidden="true" />
            </button>
            <button type="button" className={`${styles.control} ${styles.padLeft}`} aria-label={t('hazard.assist.left')} onClick={() => aimBy(-AIM_STEP_PX, 0)}>
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
            <button type="button" className={`${styles.control} ${styles.padRight}`} aria-label={t('hazard.assist.right')} onClick={() => aimBy(AIM_STEP_PX, 0)}>
              <ArrowRight size={20} aria-hidden="true" />
            </button>
            <button type="button" className={`${styles.control} ${styles.padDown}`} aria-label={t('hazard.assist.down')} onClick={() => aimBy(0, AIM_STEP_PX)}>
              <ArrowDown size={20} aria-hidden="true" />
            </button>
          </div>
          <button type="button" className={styles.tapButton} onClick={tapAtAim}>
            <Crosshair size={18} aria-hidden="true" />
            {t('hazard.assist.tap')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
