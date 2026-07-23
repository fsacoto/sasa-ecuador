/** Categorías y líneas en español (hub Ecuador). */
export const PREDEFINED_CATEGORIES_ES = [
  'Cadenas',
  'Anillos',
  'Pulseras',
  'Sets',
  'Tobilleras',
  'Aretes',
  'Materiales',
] as const;

/** Categoría de insumos de construcción (no vendibles / no consignables). */
export const MATERIAL_CATEGORY_ES = 'Materiales' as const;

/** Tipos de material (línea) sugeridos cuando la categoría es Materiales. */
export const PREDEFINED_MATERIAL_LINES_ES = [
  'Cadena',
  'Broche',
  'Herraje',
  'Dije',
  'Cierre',
] as const;

/** Unidad de medida para insumos (categoría Materiales). */
export const MATERIAL_UNITS_ES = ['unidad', 'metro', 'gramo', 'par'] as const;
export type MaterialUnitEs = (typeof MATERIAL_UNITS_ES)[number];

export const PREDEFINED_LINES_ES = ['Baño en Oro', 'Enchapado en Oro'] as const;

/** Valores en inglés legados (misma jerarquía que las categorías ES). */
const LEGACY_CATEGORIES_EN = [
  'Necklace',
  'Ring',
  'Bracelet',
  'Set',
  'Anklet',
  'Earring',
] as const;

const LEGACY_LINES_EN = ['Gold Plated', 'Gold Filled', 'Sterling Silver'] as const;

/** Mapa inglés / variantes → etiqueta en español para guardar y mostrar. */
export const CATEGORY_TO_ES: Record<string, string> = {
  necklace: 'Cadenas',
  necklaces: 'Cadenas',
  [LEGACY_CATEGORIES_EN[0]]: 'Cadenas',
  ring: 'Anillos',
  rings: 'Anillos',
  [LEGACY_CATEGORIES_EN[1]]: 'Anillos',
  bracelet: 'Pulseras',
  bracelets: 'Pulseras',
  [LEGACY_CATEGORIES_EN[2]]: 'Pulseras',
  set: 'Sets',
  sets: 'Sets',
  [LEGACY_CATEGORIES_EN[3]]: 'Sets',
  anklet: 'Tobilleras',
  anklets: 'Tobilleras',
  [LEGACY_CATEGORIES_EN[4]]: 'Tobilleras',
  earring: 'Aretes',
  earrings: 'Aretes',
  [LEGACY_CATEGORIES_EN[5]]: 'Aretes',
};

for (const c of PREDEFINED_CATEGORIES_ES) {
  CATEGORY_TO_ES[c.toLowerCase()] = c;
}

CATEGORY_TO_ES['material'] = MATERIAL_CATEGORY_ES;
CATEGORY_TO_ES['materials'] = MATERIAL_CATEGORY_ES;
CATEGORY_TO_ES['materiales'] = MATERIAL_CATEGORY_ES;

export const LINE_TO_ES: Record<string, string> = {
  'gold plated': 'Baño en Oro',
  'oro laminado': 'Baño en Oro',
  [LEGACY_LINES_EN[0]]: 'Baño en Oro',
  'baño en oro': 'Baño en Oro',
  'bano en oro': 'Baño en Oro',
  'enchapado en oro': 'Enchapado en Oro',
  'gold filled': 'Enchapado en Oro',
  [LEGACY_LINES_EN[1]]: 'Enchapado en Oro',
  'oro relleno': 'Enchapado en Oro',
  /** Datos antiguos “bañado en oro” → Enchapado en Oro */
  'bañado en oro': 'Enchapado en Oro',
  'banado en oro': 'Enchapado en Oro',
  /** Plata y otras líneas retiradas del catálogo; se muestran tal cual si ya existen en BD */
  'sterling silver': 'Plata esterlina',
  [LEGACY_LINES_EN[2]]: 'Plata esterlina',
  'plata esterlina': 'Plata esterlina',
};

for (const line of PREDEFINED_LINES_ES) {
  LINE_TO_ES[line.toLowerCase()] = line;
}

/** Conjunto de todas las categorías conocidas (para excluir del listado “custom”). */
export function allKnownCategoryKeys(): Set<string> {
  return new Set([
    ...PREDEFINED_CATEGORIES_ES,
    ...LEGACY_CATEGORIES_EN,
    ...Object.keys(CATEGORY_TO_ES),
    ...Object.values(CATEGORY_TO_ES),
  ]);
}

/** Conjunto de todas las líneas conocidas. */
export function allKnownLineKeys(): Set<string> {
  return new Set([
    ...PREDEFINED_LINES_ES,
    ...LEGACY_LINES_EN,
    ...Object.keys(LINE_TO_ES),
    ...Object.values(LINE_TO_ES),
  ]);
}
