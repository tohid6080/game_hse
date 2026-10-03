import { Outlet } from 'react-router-dom';
import styles from './AppShell.module.css';
import { BottomNav } from './BottomNav';

/** Layout of the five tabs: content plus the bottom navigation. */
export function AppShell() {
  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
