import {
  MATERIAL_CATEGORY_ES,
  MATERIAL_UNITS_ES,
  type MaterialUnitEs,
} from '../constants/merchandise';
import { canonicalCategory } from './merchandiseLabels';

export type MaterialUnit = MaterialUnitEs;

export function isMaterialCategory(category: string | undefined | null): boolean {
  if (!category) return false;
  const canonical = canonicalCategory(category);
  if (canonical === MATERIAL_CATEGORY_ES) return true;
  const lower = category.trim().toLowerCase();
  return lower === 'materiales' || lower === 'material' || lower === 'materials';
}

export function normalizeMaterialUnit(raw: string | undefined | null): MaterialUnit | undefined {
  if (!raw) return undefined;
  const lower = raw.trim().toLowerCase();
  const aliases: Record<string, MaterialUnit> = {
    unidad: 'unidad',
    unidades: 'unidad',
    ud: 'unidad',
    uds: 'unidad',
    unit: 'unidad',
    units: 'unidad',
    metro: 'metro',
    metros: 'metro',
    m: 'metro',
    meter: 'metro',
    meters: 'metro',
    gramo: 'gramo',
    gramos: 'gramo',
    g: 'gramo',
    gr: 'gramo',
    gram: 'gramo',
    grams: 'gramo',
    par: 'par',
    pares: 'par',
    pair: 'par',
    pairs: 'par',
  };
  const mapped = aliases[lower];
  if (mapped) return mapped;
  return (MATERIAL_UNITS_ES as readonly string[]).includes(lower)
    ? (lower as MaterialUnit)
    : undefined;
}

export function materialUnitLabel(unit: MaterialUnit | undefined | null, t?: (key: string) => string): string {
  if (!unit) return '';
  const key = `inventory.materialUnit.${unit}`;
  if (t) {
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  const fallback: Record<MaterialUnit, string> = {
    unidad: 'unidades',
    metro: 'metros',
    gramo: 'gramos',
    par: 'pares',
  };
  return fallback[unit];
}

export function materialUnitShort(unit: MaterialUnit | undefined | null): string {
  if (!unit) return '';
  const short: Record<MaterialUnit, string> = {
    unidad: 'ud',
    metro: 'm',
    gramo: 'g',
    par: 'par',
  };
  return short[unit];
}

/** Format stock with unit for materials (supports decimals). */
export function formatMaterialStock(
  qty: number,
  unit: MaterialUnit | undefined | null
): string {
  const n = Number(qty);
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(3).replace(/\.?0+$/, '');
  const suffix = materialUnitShort(unit);
  return suffix ? `${rounded} ${suffix}` : rounded;
}

export function roundMaterialQty(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}
