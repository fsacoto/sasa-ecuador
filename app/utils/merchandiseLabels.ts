import { CATEGORY_TO_ES, LINE_TO_ES, PREDEFINED_CATEGORIES_ES, PREDEFINED_LINES_ES } from '../constants/merchandise';

function normalizeKey(s: string): string {
  return s.trim().toLowerCase();
}

/** Texto mostrado en UI y dashboards (unifica datos viejos en inglés a español). */
export function displayCategory(category: string | undefined | null): string {
  if (category == null || category === '') return '';
  const direct = CATEGORY_TO_ES[normalizeKey(category)];
  if (direct) return direct;
  if (PREDEFINED_CATEGORIES_ES.includes(category as (typeof PREDEFINED_CATEGORIES_ES)[number])) {
    return category;
  }
  return category;
}

export function displayLine(line: string | undefined | null): string {
  if (line == null || line === '') return '';
  const direct = LINE_TO_ES[normalizeKey(line)];
  if (direct) return direct;
  if (PREDEFINED_LINES_ES.includes(line as (typeof PREDEFINED_LINES_ES)[number])) {
    return line;
  }
  return line;
}

/** Normaliza valor al guardar / importar CSV (inglés → español canónico). */
export function canonicalCategory(input: string): string {
  const t = input.trim();
  if (!t) return '';
  const mapped = CATEGORY_TO_ES[normalizeKey(t)];
  if (mapped) return mapped;
  return t;
}

export function canonicalLine(input: string): string {
  const t = input.trim();
  if (!t) return '';
  const mapped = LINE_TO_ES[normalizeKey(t)];
  if (mapped) return mapped;
  return t;
}
