import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import {
  filterStoreProductsByCategory,
  findStoreProductBySlug,
  mapInventoryDocsToStoreProducts,
} from '../lib/storeProductMapper';
import type { CMSContent, InventoryItem } from '../types';
import type { InventoryStoreFields, StoreCategory, StoreProduct } from '../types/storeProduct';

const INVENTORY_COLLECTION = 'inventory';
const CMS_COLLECTION = 'cmsContent';

type RawInventoryDoc = InventoryItem & InventoryStoreFields;

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as Timestamp).toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function normalizeInventoryDoc(
  id: string,
  raw: DocumentData
): RawInventoryDoc {
  const ec = Number(raw.ecuadorStock ?? 0);
  const legacyUsa = Number(raw.usaStock ?? 0);

  return {
    id,
    name: String(raw.name ?? ''),
    supplierSKU: String(raw.supplierSKU ?? ''),
    linkedPurchaseOrders: Array.isArray(raw.linkedPurchaseOrders)
      ? raw.linkedPurchaseOrders.map(String)
      : [],
    sku: String(raw.sku ?? ''),
    description: String(raw.description ?? ''),
    category: String(raw.category ?? ''),
    line: String(raw.line ?? ''),
    ecuadorStock: ec + legacyUsa,
    consignmentStock:
      raw.consignmentStock !== undefined ? Number(raw.consignmentStock) : undefined,
    images: Array.isArray(raw.images) ? raw.images.map(String) : [],
    barcode: raw.barcode !== undefined ? String(raw.barcode) : undefined,
    salePrice:
      raw.salePrice === undefined || raw.salePrice === null || raw.salePrice === ''
        ? undefined
        : Number(raw.salePrice),
    createdAt: toDate(raw.createdAt),
    slug: raw.slug !== undefined ? String(raw.slug) : undefined,
    storeActive: typeof raw.storeActive === 'boolean' ? raw.storeActive : undefined,
    details: raw.details !== undefined ? String(raw.details) : undefined,
    care: raw.care !== undefined ? String(raw.care) : undefined,
    isBestSeller: typeof raw.isBestSeller === 'boolean' ? raw.isBestSeller : undefined,
    isNew: typeof raw.isNew === 'boolean' ? raw.isNew : undefined,
    variants: Array.isArray(raw.variants) ? raw.variants.map(String) : undefined,
  };
}

function normalizeCmsDoc(id: string, raw: DocumentData): CMSContent {
  const metadataRaw = (raw.metadata ?? {}) as Record<string, unknown>;
  const statusHistoryRaw = Array.isArray(raw.statusHistory) ? raw.statusHistory : [];

  return {
    id,
    type: raw.type === 'collection' || raw.type === 'general' ? raw.type : 'product',
    title: String(raw.title ?? ''),
    description: String(raw.description ?? ''),
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.map(String) : [],
    status: raw.status ?? 'draft',
    statusHistory: statusHistoryRaw.map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        status: row.status as CMSContent['statusHistory'][number]['status'],
        timestamp: toDate(row.timestamp),
        userId: String(row.userId ?? ''),
        notes: row.notes !== undefined ? String(row.notes) : undefined,
      };
    }),
    images: Array.isArray(raw.images) ? raw.images.map(String) : [],
    imageLinkedSkus: Array.isArray(raw.imageLinkedSkus)
      ? raw.imageLinkedSkus.map(String)
      : undefined,
    videos: Array.isArray(raw.videos) ? raw.videos.map(String) : [],
    authorId: String(raw.authorId ?? ''),
    authorName: String(raw.authorName ?? ''),
    category: String(raw.category ?? ''),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    language: 'es',
    linkedProductIds: Array.isArray(raw.linkedProductIds)
      ? raw.linkedProductIds.map(String)
      : [],
    metadata: {
      createdAt: toDate(metadataRaw.createdAt),
      updatedAt: toDate(metadataRaw.updatedAt),
      publishedAt:
        metadataRaw.publishedAt !== undefined
          ? toDate(metadataRaw.publishedAt)
          : undefined,
      archivedAt:
        metadataRaw.archivedAt !== undefined
          ? toDate(metadataRaw.archivedAt)
          : undefined,
      reviewerId:
        metadataRaw.reviewerId !== undefined ? String(metadataRaw.reviewerId) : undefined,
      reviewerNotes:
        metadataRaw.reviewerNotes !== undefined
          ? String(metadataRaw.reviewerNotes)
          : undefined,
      resubmissionCount:
        metadataRaw.resubmissionCount !== undefined
          ? Number(metadataRaw.resubmissionCount)
          : undefined,
      lastResubmittedAt:
        metadataRaw.lastResubmittedAt !== undefined
          ? toDate(metadataRaw.lastResubmittedAt)
          : undefined,
    },
  };
}

function fromSnapshot(docSnap: QueryDocumentSnapshot): RawInventoryDoc {
  return normalizeInventoryDoc(docSnap.id, docSnap.data());
}

async function fetchInventoryDocs(): Promise<RawInventoryDoc[]> {
  const q = query(collection(db, INVENTORY_COLLECTION), orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(fromSnapshot);
}

async function fetchPublishedCmsContent(): Promise<CMSContent[]> {
  try {
    const q = query(
      collection(db, CMS_COLLECTION),
      where('status', '==', 'published')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => normalizeCmsDoc(docSnap.id, docSnap.data()));
  } catch (error) {
    console.warn('[store] CMS gallery merge skipped:', error);
    return [];
  }
}

export async function getStoreProducts(category?: StoreCategory): Promise<StoreProduct[]> {
  const [inventoryDocs, cmsContent] = await Promise.all([
    fetchInventoryDocs(),
    fetchPublishedCmsContent(),
  ]);

  const products = mapInventoryDocsToStoreProducts(inventoryDocs, cmsContent);
  if (!category) return products;
  return filterStoreProductsByCategory(products, category);
}

export async function getStoreProductBySlug(slug: string): Promise<StoreProduct | null> {
  const products = await getStoreProducts();
  return findStoreProductBySlug(products, slug) ?? null;
}
