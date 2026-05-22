'use client';

import { useEffect, useRef } from 'react';

export type UseBarcodeScannerOptions = {
  enabled?: boolean;
  onScan: (code: string) => void;
  maxCharGapMs?: number;
  /** When true, ignore key events from inputs (default: inputs, textarea, select, contenteditable). */
  ignoreFormFields?: boolean;
  /** Extra guard — return true to ignore the event. */
  shouldIgnore?: () => boolean;
};

const DEFAULT_GAP_MS = 85;

export function useBarcodeScanner({
  enabled = true,
  onScan,
  maxCharGapMs = DEFAULT_GAP_MS,
  ignoreFormFields = true,
  shouldIgnore,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef('');
  const lastTsRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const shouldIgnoreTarget = (target: EventTarget | null) => {
      if (shouldIgnore?.()) return true;
      if (!ignoreFormFields) return false;
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      const tag = target.tagName.toLowerCase();
      return tag === 'textarea' || tag === 'select' || tag === 'input';
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const now = Date.now();
      if (now - lastTsRef.current > maxCharGapMs) {
        bufferRef.current = '';
      }
      lastTsRef.current = now;

      if (e.key === 'Enter') {
        const buf = bufferRef.current.trim();
        bufferRef.current = '';
        if (buf) {
          e.preventDefault();
          onScanRef.current(buf);
        }
        return;
      }
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, maxCharGapMs, ignoreFormFields, shouldIgnore]);
}
