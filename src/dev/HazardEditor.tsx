import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { sceneImageUrl } from '@/content/loader';
import type { HazardScene } from '@/content/schema';
import { HazardMarkers, type Marker } from '@/games/hazard/HazardMarkers';
import { PanZoomImage } from '@/games/hazard/PanZoomImage';
import { useHazardBank } from '@/games/hazard/useHazardBank';
import { Button, Card, PageHeader } from '@/ui';
import styles from './HazardEditor.module.css';

/*
 * DEV-ONLY tool (never part of a production build: the route is only registered when
 * import.meta.env.DEV). Place hotspots on a scene picture: pick a hazard, tap the picture to move
 * its centre, drag the slider for its radius, then copy the JSON back into
 * src/content/packs/<locale>/hazard.json. Nothing is persisted — the draft lives in this component.
 */

interface Geometry {
  x: number;
  y: number;
  radius: number;
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

function Editor({ scene }: { scene: HazardScene }) {
  const imageUrl = sceneImageUrl(scene.image);
  const [selectedId, setSelectedId] = useState(scene.hazards[0]?.id ?? '');
  const [edits, setEdits] = useState<Record<string, Geometry>>({});

  const geometryOf = (id: string): Geometry => {
    const edited = edits[id];
    if (edited) return edited;
    const hazard = scene.hazards.find((candidate) => candidate.id === id);
    return { x: hazard?.x ?? 0.5, y: hazard?.y ?? 0.5, radius: hazard?.radius ?? 0.06 };
  };

  const markers: Marker[] = scene.hazards.map((hazard, index) => ({
    key: hazard.id,
    kind: hazard.id === selectedId ? 'hint' : 'found',
    label: String(index + 1),
    ...geometryOf(hazard.id),
  }));

  const output = useMemo(
    () =>
      JSON.stringify(
        scene.hazards.map((hazard) => {
          const edited = edits[hazard.id];
          return { id: hazard.id, x: round3(edited?.x ?? hazard.x), y: round3(edited?.y ?? hazard.y), radius: round3(edited?.radius ?? hazard.radius) };
        }),
        null,
        2,
      ),
    [scene, edits],
  );

  if (!imageUrl) return <p>تصویر «{scene.image}» پیدا نشد.</p>;
  const selected = geometryOf(selectedId);

  return (
    <div className={styles.editor}>
      <PanZoomImage
        src={imageUrl}
        alt={scene.imageAlt}
        width={scene.width}
        height={scene.height}
        onTap={(point) => setEdits((current) => ({ ...current, [selectedId]: { ...geometryOf(selectedId), x: round3(point.x), y: round3(point.y) } }))}
      >
        <HazardMarkers markers={markers} width={scene.width} height={scene.height} />
      </PanZoomImage>

      <Card>
        <div className={styles.panel}>
          <ol className={styles.list}>
            {scene.hazards.map((hazard, index) => (
              <li key={hazard.id}>
                <button
                  type="button"
                  className={hazard.id === selectedId ? styles.active : styles.item}
                  onClick={() => setSelectedId(hazard.id)}
                >
                  {index + 1}. {hazard.title}
                </button>
              </li>
            ))}
          </ol>
          <label className={styles.slider}>
            شعاع: {selected.radius.toFixed(3)} (کسری از عرض تصویر)
            <input
              type="range"
              min={0.03}
              max={0.2}
              step={0.005}
              value={selected.radius}
              onChange={(event) => setEdits((current) => ({ ...current, [selectedId]: { ...geometryOf(selectedId), radius: Number(event.target.value) } }))}
            />
          </label>
          <p className={styles.note}>
            مرکز: x={selected.x.toFixed(3)}، y={selected.y.toFixed(3)}. روی تصویر بزن تا مرکز خطر انتخاب‌شده جابه‌جا شود.
          </p>
          <textarea className={styles.output} readOnly value={output} rows={10} dir="ltr" aria-label="JSON" />
          <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(output)}>
            کپی JSON
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function HazardEditor() {
  const { pack, failed } = useHazardBank();
  const [params, setParams] = useSearchParams();
  const scene = pack?.scenes.find((candidate) => candidate.id === params.get('scene')) ?? pack?.scenes[0];

  return (
    <div className={styles.page}>
      <PageHeader title="ویرایشگر نقاط خطر (فقط توسعه)" subtitle="این صفحه در نسخه‌ی نهایی وجود ندارد." />
      {failed ? <p>بسته‌ی صحنه‌ها بارگذاری نشد.</p> : null}
      {pack && pack.scenes.length > 1 ? (
        <select value={scene?.id} onChange={(event) => setParams({ scene: event.target.value })} aria-label="صحنه">
          {pack.scenes.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </select>
      ) : null}
      {scene ? <Editor key={scene.id} scene={scene} /> : null}
    </div>
  );
}
