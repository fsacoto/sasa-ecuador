/**
 * Rename «Enchapado en Oro» → «Laminado en Oro» and SKU mid-code EO → LO.
 * Used by migration scripts and kept in sync with skuGenerator line codes.
 */

export const LEGACY_ENCHAPADO_LINE = 'Enchapado en Oro';
export const LAMINADO_LINE = 'Laminado en Oro';

const LEGACY_LINE_KEYS = new Set([
  'enchapado en oro',
  'gold plated',
  'bañado en oro',
  'banado en oro',
]);

/** XXEO1234 or XXEO1234-2 → XXLO1234 / XXLO1234-2 */
export function remapEoSkuToLo(sku: string): string | null {
  const trimmed = (sku || '').trim();
  const m = trimmed.match(/^([A-Za-z]{2})EO(\d{4}(?:-\d+)?)$/i);
  if (!m) return null;
  return `${m[1].toUpperCase()}LO${m[2]}`;
}

export function isLegacyEnchapadoLine(line: string | undefined | null): boolean {
  if (line == null || line === '') return false;
  return LEGACY_LINE_KEYS.has(line.trim().toLowerCase()) || line.trim() === LEGACY_ENCHAPADO_LINE;
}

export function remapEnchapadoLine(line: string | undefined | null): string | null {
  if (!isLegacyEnchapadoLine(line)) return null;
  return LAMINADO_LINE;
}

/** Replace old SKUs in free text / Storage URLs (plain + URL-encoded). */
export function remapSkuOccurrences(text: string, skuMap: Map<string, string>): string {
  let out = text;
  for (const [oldSku, newSku] of skuMap) {
    if (!oldSku || oldSku === newSku) continue;
    if (out.includes(oldSku)) out = out.split(oldSku).join(newSku);
    const encOld = encodeURIComponent(oldSku);
    const encNew = encodeURIComponent(newSku);
    if (encOld !== oldSku && out.includes(encOld)) {
      out = out.split(encOld).join(encNew);
    }
  }
  return out;
}

export function remapSkuList(skus: string[] | undefined, skuMap: Map<string, string>): string[] | null {
  if (!Array.isArray(skus) || skus.length === 0) return null;
  let changed = false;
  const next = skus.map((s) => {
    const mapped = skuMap.get(s) ?? remapEoSkuToLo(s);
    if (mapped && mapped !== s) {
      changed = true;
      return mapped;
    }
    return s;
  });
  return changed ? next : null;
}
