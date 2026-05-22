'use client';

import { useEffect, useState } from 'react';

function readDarkMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('sasaDarkMode') === 'on';
}

/** Sincroniza con `sasaDarkMode` en localStorage (mismo flag que el toggle en page.tsx). */
export function useDarkMode(): boolean {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    setDarkMode(readDarkMode());
    const sync = () => setDarkMode(readDarkMode());
    window.addEventListener('sasa-dark-mode-change', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('sasa-dark-mode-change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return darkMode;
}
