import { canonicalCategory, canonicalLine } from '../utils/merchandiseLabels';
import { normalizeSalePrice } from '../utils/salePrice';
import { buildMergedGalleryUrls } from '../utils/inventoryMediaGallery';
import { isMaterialCategory } from '../utils/materials';
import type { CMSContent, InventoryItem } from '../types';
import type {
  InventoryStoreFields,
  StoreCategory,
  StoreMaterial,
  StoreProduct,
} from '../types/storeProduct';

const CATEGORY_ES_TO_STORE: Record<string, StoreCategory> = {
  Aretes: 'earrings',
  Cadenas: 'necklaces',
  Anillos: 'rings',
  Pulseras: 'bracelets',
};

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function mapInventoryCategoryToStore(category: string): StoreCategory | null {
  const canonical = canonicalCategory(category);
  return CATEGORY_ES_TO_STORE[canonical] ?? null;
}

export function mapInventoryLineToStoreMaterial(line: string): StoreMaterial {
  const canonical = canonicalLine(line);

  if (canonical === 'Enchapado en Oro') return 'gold-filled';
  if (canonical === 'Baño en Oro') return 'gold-plated';
  if (canonical === 'Plata esterlina') return 'sterling-silver';

  const lower = line.trim().toLowerCase();
  if (lower.includes('gold filled') || lower.includes('enchapado') || lower.includes('oro relleno')) {
    return 'gold-filled';
  }
  if (lower.includes('gold plated') || lower.includes('baño') || lower.includes('bano')) {
    return 'gold-plated';
  }
  if (lower.includes('sterling') || lower.includes('plata')) {
    return 'sterling-silver';
  }

  return 'gold-plated';
}

export function buildStoreSlug(
  name: string,
  sku: string,
  explicitSlug?: string
): string {
  const trimmed = explicitSlug?.trim();
  if (trimmed) return slugify(trimmed);

  const fromName = slugify(name);
  const skuPart = slugify(sku);
  if (fromName && skuPart) return `${fromName}-${skuPart}`;
  return fromName || skuPart || slugify(name || sku || 'product');
}

export function isPublicMediaUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('data:')) return false;
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

export function isStoreActiveProduct(
  item: InventoryItem & InventoryStoreFields
): boolean {
  if (item.storeActive === false) return false;
  if (isMaterialCategory(item.category)) return false;
  const stock = Math.floor(Number(item.ecuadorStock ?? 0));
  // Out of stock stays hidden on the storefront until restocked.
  if (!Number.isFinite(stock) || stock <= 0) return false;
  return true;
}

type RawInventoryDoc = InventoryItem & InventoryStoreFields;

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function parseBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function inventoryDocToStoreProduct(
  item: RawInventoryDoc,
  cmsContent: CMSContent[] = []
): StoreProduct | null {
  if (!isStoreActiveProduct(item)) return null;

  const category = mapInventoryCategoryToStore(item.category);
  if (!category) return null;

  const price = normalizeSalePrice(item.salePrice) ?? 0;

  const mergedImages = buildMergedGalleryUrls(item.images, item.sku, cmsContent);
  const images = mergedImages.filter(isPublicMediaUrl);

  return {
    id: item.id,
    slug: buildStoreSlug(item.name, item.sku, item.slug),
    name: item.name,
    price,
    category,
    material: mapInventoryLineToStoreMaterial(item.line),
    images,
    description: item.description?.trim() || '',
    details: item.details?.trim() || '',
    care: item.care?.trim() || '',
    stock: Math.max(0, Math.floor(Number(item.ecuadorStock ?? 0))),
    isBestSeller: parseBoolean(item.isBestSeller),
    isNew: parseBoolean(item.isNew),
    variants: parseStringArray(item.variants),
  };
}

export function mapInventoryDocsToStoreProducts(
  items: RawInventoryDoc[],
  cmsContent: CMSContent[] = []
): StoreProduct[] {
  const products: StoreProduct[] = [];

  for (const item of items) {
    const mapped = inventoryDocToStoreProduct(item, cmsContent);
    if (mapped) products.push(mapped);
  }

  products.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return products;
}

export function findStoreProductBySlug(
  products: StoreProduct[],
  slug: string
): StoreProduct | undefined {
  const normalized = slug.trim().toLowerCase();
  return products.find((product) => product.slug.toLowerCase() === normalized);
}

export function filterStoreProductsByCategory(
  products: StoreProduct[],
  category: StoreCategory
): StoreProduct[] {
  return products.filter((product) => product.category === category);
}
