/**
 * Helpers for @react-pdf/renderer documents (runtime dates from Firestore, safe numbers).
 */

export function toPdfDate(value: unknown): Date {
  if (value == null || value === '') return new Date();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const td = (value as { toDate?: () => Date }).toDate;
    if (typeof td === 'function') {
      try {
        const d = td.call(value);
        if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
      } catch {
        /* fall through */
      }
    }
  }
  const d = new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function pdfMoney(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

/** Prefer base64/data URLs for react-pdf Image; HTTP(S) also allowed. */
export function normalizePdfLogoSrc(logoBase64: string | null | undefined, fallbackUrl: string): string {
  if (logoBase64 && logoBase64.startsWith('data:')) return logoBase64;
  if (fallbackUrl && fallbackUrl.startsWith('http')) return fallbackUrl;
  if (typeof window !== 'undefined' && fallbackUrl.startsWith('/')) {
    return `${window.location.origin}${fallbackUrl}`;
  }
  return fallbackUrl || '';
}
