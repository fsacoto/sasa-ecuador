/** Utilidades para el selector de fecha (valor ISO YYYY-MM-DD). */

export function parseIsoDate(iso: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isIsoInRange(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

export type CalendarCell = {
  iso: string;
  day: number;
  inMonth: boolean;
};

/** Semana empieza en lunes (es-EC). */
export function buildCalendarMonth(year: number, month: number): CalendarCell[] {
  const cells: CalendarCell[] = [];
  const firstDowRaw = new Date(year, month, 1).getDay();
  const firstDow = firstDowRaw === 0 ? 6 : firstDowRaw - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  for (let i = firstDow - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    cells.push({
      iso: toIsoDate(new Date(year, month - 1, day)),
      day,
      inMonth: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      iso: toIsoDate(new Date(year, month, day)),
      day,
      inMonth: true,
    });
  }

  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({
      iso: toIsoDate(new Date(year, month + 1, nextDay)),
      day: nextDay,
      inMonth: false,
    });
    nextDay += 1;
  }

  return cells;
}

/** Etiquetas L–D (lunes a domingo). */
export function weekdayLabelsEs(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 1 + i);
    return d.toLocaleDateString('es-EC', { weekday: 'narrow' }).replace('.', '');
  });
}

export function formatMonthYearEs(year: number, month: number): string {
  const raw = new Date(year, month, 1).toLocaleDateString('es-EC', {
    month: 'long',
    year: 'numeric',
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Clase del popover de DateInput (renderizado en document.body vía portal). */
export const SASA_DATE_PICKER_CLASS = 'sasa-date-picker';

/** True si el clic ocurrió dentro del calendario flotante del DateInput. */
export function isInsideDatePickerPortal(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(`.${SASA_DATE_PICKER_CLASS}`);
}
