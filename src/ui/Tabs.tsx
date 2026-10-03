import { useRef, type KeyboardEvent } from 'react';
import { getLocale } from '@/i18n';
import { cx } from './cx';
import styles from './Tabs.module.css';

interface TabsProps<T extends string> {
  /** Accessible name of the tab list. */
  label: string;
  tabs: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  /** Makes the ids of tabs and panels unique: `<idPrefix>-tab-<value>`, `<idPrefix>-panel-<value>`. */
  idPrefix: string;
}

export const tabId = (prefix: string, value: string): string => `${prefix}-tab-${value}`;
export const panelId = (prefix: string, value: string): string => `${prefix}-panel-${value}`;

/** Sub-view switcher (WAI-ARIA tabs: arrow keys move and select, following the reading direction). */
export function Tabs<T extends string>({ label, tabs, value, onChange, idPrefix }: TabsProps<T>) {
  const refs = useRef(new Map<T, HTMLButtonElement>());

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const rtl = getLocale().dir === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    let target: number | null = null;
    if (event.key === forward) target = (index + 1) % tabs.length;
    else if (event.key === backward) target = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = tabs.length - 1;
    if (target === null) return;
    event.preventDefault();
    const next = tabs[target]!;
    onChange(next.value);
    refs.current.get(next.value)?.focus();
  }

  return (
    <div className={styles.list} role="tablist" aria-label={label}>
      {tabs.map((tab, index) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(element) => {
              if (element) refs.current.set(tab.value, element);
              else refs.current.delete(tab.value);
            }}
            type="button"
            role="tab"
            id={tabId(idPrefix, tab.value)}
            aria-selected={selected}
            aria-controls={panelId(idPrefix, tab.value)}
            tabIndex={selected ? 0 : -1}
            className={cx(styles.tab, selected && styles.selected)}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
