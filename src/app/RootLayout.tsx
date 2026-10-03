import { useEffect } from 'react';
import { Outlet, useLocation, useNavigation } from 'react-router-dom';
import styles from './RootLayout.module.css';
import { useNativeBackButton } from './useNativeBackButton';

/** Behaviour shared by every screen: Android back button and scroll-to-top on navigation. */
export function RootLayout() {
  const { pathname } = useLocation();
  const navigation = useNavigation();
  useNativeBackButton();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      {navigation.state === 'loading' ? <div className={styles.pending} aria-hidden="true" /> : null}
      <Outlet />
    </>
  );
}
