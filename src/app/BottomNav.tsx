import { CalendarCheck, Gamepad2, House, Settings, Trophy, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { t, type MessageKey } from '@/i18n';
import { cx } from '@/ui';
import styles from './BottomNav.module.css';

interface NavItem {
  to: string;
  label: MessageKey;
  icon: LucideIcon;
  end?: boolean;
  /** The daily challenge is the primary habit loop, so it gets the raised center slot. */
  featured?: boolean;
}

const ITEMS: readonly NavItem[] = [
  { to: '/', label: 'nav.home', icon: House, end: true },
  { to: '/games', label: 'nav.games', icon: Gamepad2 },
  { to: '/daily', label: 'nav.daily', icon: CalendarCheck, featured: true },
  { to: '/progress', label: 'nav.progress', icon: Trophy },
  { to: '/settings', label: 'nav.settings', icon: Settings },
];

export function BottomNav() {
  return (
    <nav className={styles.nav} aria-label={t('nav.label')}>
      <ul className={styles.list}>
        {ITEMS.map(({ to, label, icon: Icon, end, featured }) => (
          <li key={to} className={styles.cell}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(styles.item, isActive && styles.active, featured && styles.featured)
              }
            >
              <span className={styles.icon} aria-hidden="true">
                <Icon size={featured ? 26 : 24} />
              </span>
              <span>{t(label)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
