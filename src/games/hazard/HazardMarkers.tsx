import type { CSSProperties } from 'react';
import type { Circle } from './geometry';
import styles from './HazardMarkers.module.css';

export type MarkerKind = 'found' | 'missed' | 'hint' | 'tap-miss';

export interface Marker extends Circle {
  key: string;
  kind: MarkerKind;
  /** Short text drawn in the ring (the hazard's number). */
  label?: string;
}

interface HazardMarkersProps {
  markers: readonly Marker[];
  width: number;
  height: number;
  /** A "tap-miss" ripple finished its animation and can be dropped. */
  onRippleEnd?: (key: string) => void;
}

/**
 * Rings drawn over the scene, in an SVG whose viewBox is 100 units wide, so a marker's centre and
 * radius are just the normalised hotspot numbers ×100. Strokes keep a constant on-screen width
 * when the picture is zoomed. Purely visual: the state is also announced in text next to the scene.
 */
export function HazardMarkers({ markers, width, height, onRippleEnd }: HazardMarkersProps) {
  const unitsHigh = (100 * height) / width;
  return (
    <svg className={styles.overlay} viewBox={`0 0 100 ${unitsHigh}`} preserveAspectRatio="none" aria-hidden="true">
      {markers.map((marker) => {
        const cx = marker.x * 100;
        const cy = marker.y * unitsHigh;
        const r = marker.radius * 100;
        return (
          <g key={marker.key} className={styles[marker.kind]}>
            <circle
              className={styles.ring}
              cx={cx}
              cy={cy}
              r={r}
              onAnimationEnd={marker.kind === 'tap-miss' ? () => onRippleEnd?.(marker.key) : undefined}
            />
            {marker.label ? (
              <text className={styles.label} x={cx} y={cy} fontSize={Math.max(2.6, r * 0.95)}>
                {marker.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

interface SceneMapProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  markers: readonly Marker[];
}

/** The scene at fit size with markers, no gestures: the review map on the result screen. */
export function SceneMap({ src, alt, width, height, markers }: SceneMapProps) {
  const shape = { '--aw': width, '--ah': height } as CSSProperties;
  return (
    <div className={styles.map} style={shape}>
      <img className={styles.mapImage} src={src} alt={alt} width={width} height={height} draggable={false} />
      <HazardMarkers markers={markers} width={width} height={height} />
    </div>
  );
}
