/** Fechas siempre en español (Ecuador): día → mes → año; nunca estilo mm/dd/yyyy. */
export const APP_DATE_LOCALE = 'es-EC';

export function toValidDate(input: Date | string | number | null | undefined): Date | null {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Con día: numérico local (p. ej. 8/5/2026 = 8 de mayo de 2026). */
export function formatDateDMY(input: Date | string | number | null | undefined, fallback = '—'): string {
  const d = toValidDate(input);
  if (!d) return fallback;
  return d.toLocaleDateString(APP_DATE_LOCALE, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

/** Mes en texto + año (p. ej. «mayo de 2026»). */
export function formatMonthYearLong(input: Date | string | number | null | undefined, fallback = '—'): string {
  const d = toValidDate(input);
  if (!d) return fallback;
  return d.toLocaleDateString(APP_DATE_LOCALE, {
    month: 'long',
    year: 'numeric',
  });
}

/** Día + mes abreviado + año (p. ej. «8 may 2026»). */
export function formatDateMedium(input: Date | string | number | null | undefined, fallback = '—'): string {
  const d = toValidDate(input);
  if (!d) return fallback;
  return d.toLocaleDateString(APP_DATE_LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Mes largo + día + año (p. ej. «8 de mayo de 2026») — PDFs y textos formales. */
export function formatDateLong(input: Date | string | number | null | undefined, fallback = '—'): string {
  const d = toValidDate(input);
  if (!d) return fallback;
  return d.toLocaleDateString(APP_DATE_LOCALE, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Fecha y hora en locale es-EC. */
export function formatDateTimeShort(input: Date | string | number | null | undefined, fallback = '—'): string {
  const d = toValidDate(input);
  if (!d) return fallback;
  return d.toLocaleString(APP_DATE_LOCALE, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
