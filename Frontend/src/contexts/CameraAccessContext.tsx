import { createContext, useContext, useState, ReactNode } from 'react';
import { useEffect } from 'react';

interface CameraAccessState {
  enabled: boolean;
  enable: () => void;
  disable: () => void;
  toggle: () => void;
}

const CameraAccessContext = createContext<CameraAccessState | undefined>(undefined);

export function CameraAccessProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('cameraEnabled') === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem('cameraEnabled', enabled ? '1' : '0'); } catch {}
    if (!enabled) {
      // Notify all camera components to stop immediately
      window.dispatchEvent(new CustomEvent('global-camera-disabled'));
    }
  }, [enabled]);

  const enable = () => setEnabled(true);
  const disable = () => setEnabled(false);
  const toggle = () => setEnabled(e => !e);

  return (
    <CameraAccessContext.Provider value={{ enabled, enable, disable, toggle }}>
      {children}
    </CameraAccessContext.Provider>
  );
}

export function useCameraAccess() {
  const ctx = useContext(CameraAccessContext);
  // In production, App wraps with CameraAccessProvider. In tests or isolated renders,
  // gracefully fall back to a disabled, no-op controller instead of throwing.
  if (!ctx) {
    return {
      enabled: false,
      enable: () => {},
      disable: () => { window.dispatchEvent(new CustomEvent('global-camera-disabled')); },
      toggle: () => {}
    } as CameraAccessState;
  }
  return ctx;
}
