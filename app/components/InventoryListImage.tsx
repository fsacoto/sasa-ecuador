'use client';

import { useEffect, useRef, useState } from 'react';
import {
  captureListThumbFromImg,
  inventoryListImageCandidates,
  isLikelyListThumbSrc,
  resolveInventoryListImageSrc,
} from '../utils/inventoryListImageCache';

type InventoryListImageProps = {
  urls: string[];
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'auto' | 'sync';
  onLoad?: React.ReactEventHandler<HTMLImageElement>;
  onFail?: () => void;
};

/**
 * Muestra la foto en cuanto hay una URL usable (miniatura o original).
 * Sin crossOrigin: en prod la lista siempre pinta aunque CORS del bucket no
 * incluya el dominio. La miniatura se genera en segundo plano.
 */
export default function InventoryListImage({
  urls,
  alt,
  className,
  loading = 'lazy',
  decoding = 'async',
  onLoad,
  onFail,
}: InventoryListImageProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const candidatesRef = useRef<string[]>([]);
  const candidateIndexRef = useRef(0);

  useEffect(() => {
    const candidates = inventoryListImageCandidates(urls);
    candidatesRef.current = candidates;
    candidateIndexRef.current = 0;
    setCandidateIndex(0);
    setSrc(null);

    const primary = candidates[0];
    if (!primary) {
      onFail?.();
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const resolved = await resolveInventoryListImageSrc(primary);
        if (cancelled) return;
        setSrc(resolved);
      } catch {
        if (!cancelled) setSrc(primary);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [urls.join('|')]);

  if (!src) {
    return <div className={className} aria-hidden />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      onLoad={(e) => {
        onLoad?.(e);
        const original = candidatesRef.current[candidateIndexRef.current] ?? src;
        if (!isLikelyListThumbSrc(src)) {
          void captureListThumbFromImg(original, e.currentTarget);
        }
      }}
      onError={() => {
        const list = candidatesRef.current;
        const original = list[candidateIndexRef.current];
        if (original && src !== original && isLikelyListThumbSrc(src)) {
          setSrc(original);
          return;
        }
        const next = candidateIndex + 1;
        if (next < list.length) {
          candidateIndexRef.current = next;
          setCandidateIndex(next);
          const fallback = list[next];
          void (async () => {
            try {
              setSrc(await resolveInventoryListImageSrc(fallback));
            } catch {
              setSrc(fallback);
            }
          })();
          return;
        }
        onFail?.();
      }}
    />
  );
}
