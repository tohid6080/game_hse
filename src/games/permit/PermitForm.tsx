import { CircleCheck, CircleX, Flag, TriangleAlert } from 'lucide-react';
import { useId } from 'react';
import type { PermitCase } from '@/content/schema';
import { t } from '@/i18n';
import { cx } from '@/ui';
import styles from './PermitForm.module.css';

/** How a field turned out once the permit was judged. */
type FieldOutcome = 'found' | 'missed' | 'falseAlarm' | null;

interface PermitFormProps {
  permit: PermitCase;
  /** Ids of the fields the player marked. */
  flagged: ReadonlySet<string>;
  /** Play mode: tapping a field marks or unmarks it. Without it the form is read-only (review). */
  onToggle?: (fieldId: string) => void;
}

/** The form of one permit. In play mode every line is a toggle; in review each line says how it turned out. */
export function PermitForm({ permit, flagged, onToggle }: PermitFormProps) {
  const id = useId();
  const reviewing = onToggle === undefined;

  const defectOf = new Map<string, number>();
  permit.defects.forEach((defect, index) => defect.fieldIds.forEach((fieldId) => defectOf.set(fieldId, index)));
  const defectFound = permit.defects.map((defect) => defect.fieldIds.some((fieldId) => flagged.has(fieldId)));

  function outcomeOf(fieldId: string): FieldOutcome {
    const index = defectOf.get(fieldId);
    if (index !== undefined) return defectFound[index] ? 'found' : 'missed';
    return flagged.has(fieldId) ? 'falseAlarm' : null;
  }

  return (
    <div className={styles.form}>
      {permit.sections.map((section, sectionIndex) => {
        const headingId = `${id}-${sectionIndex}`;
        return (
          <section key={section.title} aria-labelledby={headingId} className={styles.section}>
            <h3 id={headingId} className={styles.sectionTitle}>
              {section.title}
            </h3>
            <ul className={styles.fields}>
              {section.fields.map((field) => {
                const isFlagged = flagged.has(field.id);
                if (!reviewing) {
                  return (
                    <li key={field.id}>
                      <button
                        type="button"
                        className={cx(styles.field, styles.toggle, isFlagged && styles.flagged)}
                        aria-pressed={isFlagged}
                        onClick={() => onToggle(field.id)}
                      >
                        <span className={styles.text}>
                          <span className={styles.label}>{field.label}</span>
                          <span className={styles.value}>{field.value}</span>
                        </span>
                        {isFlagged ? (
                          <span className={styles.mark}>
                            <Flag size={16} aria-hidden="true" />
                            {t('permit.field.flagged')}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                }

                const outcome = outcomeOf(field.id);
                const defectIndex = defectOf.get(field.id);
                const defect = defectIndex === undefined ? undefined : permit.defects[defectIndex];
                return (
                  <li key={field.id}>
                    <div className={cx(styles.field, outcome && styles[outcome])}>
                      <span className={styles.text}>
                        <span className={styles.label}>{field.label}</span>
                        <span className={styles.value}>{field.value}</span>
                        {outcome ? (
                          <span className={styles.outcome}>
                            {outcome === 'found' ? <CircleCheck size={16} aria-hidden="true" /> : null}
                            {outcome === 'missed' ? <CircleX size={16} aria-hidden="true" /> : null}
                            {outcome === 'falseAlarm' ? <TriangleAlert size={16} aria-hidden="true" /> : null}
                            <span>{t(`permit.field.${outcome}`)}</span>
                            {defect?.critical ? <span className={styles.critical}>{t('permit.field.critical')}</span> : null}
                          </span>
                        ) : null}
                        {defect && defect.fieldIds[0] === field.id ? <span className={styles.why}>{defect.why}</span> : null}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
