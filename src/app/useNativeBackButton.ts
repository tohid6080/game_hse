import { App as CapacitorApp } from '@capacitor/app';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isNative } from '@/platform/native';

/** Android hardware back: step back through the app's history, then leave the app. */
export function useNativeBackButton(): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNative()) return;
    const listener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) navigate(-1);
      else void CapacitorApp.exitApp();
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [navigate]);
}
