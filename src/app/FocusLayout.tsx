import { Outlet } from 'react-router-dom';
import styles from './AppShell.module.css';

/** Immersive layout for gameplay: no bottom navigation, so nothing pulls the player out of a round. */
export function FocusLayout() {
  return (
    <div className={styles.shell}>
      <main className={styles.focus}>
        <Outlet />
      </main>
    </div>
  );
}
