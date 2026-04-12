import type { CMSContent, InventoryItem, PurchaseOrder } from '../types';

function normalizeSku(s: string): string {
  return s.trim().toLowerCase();
}

function docLinksSku(doc: CMSContent, sku: string): boolean {
  const n = normalizeSku(sku);
  return (doc.linkedProductIds || []).some((id) => normalizeSku(id) === n);
}

/** Heuristic: treat URL as video for gallery rendering (aligned with CMS module). */
export function isGalleryVideoUrl(url: string): boolean {
  if (!url) return false;
  const urlLower = url.toLowerCase();
  return !!(
    urlLower.includes('/videos/') ||
    urlLower.match(/\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv|3gp|mpg|mpeg)$/i) ||
    urlLower.includes('video/') ||
    urlLower.includes('contenttype=video') ||
    urlLower.match(/video\/mp4|video\/quicktime|video\/webm|video\/x-msvideo/i) ||
    (urlLower.includes('firebasestorage') &&
      (urlLower.includes('.mov') ||
        urlLower.includes('.mp4') ||
        urlLower.includes('.webm') ||
        urlLower.includes('videos/')))
  );
}

function cmsImageBelongsToSku(doc: CMSContent, imageIndex: number, sku: string): boolean {
  if (!docLinksSku(doc, sku)) return false;
  const imgs = doc.images || [];
  if (imageIndex < 0 || imageIndex >= imgs.length) return false;
  const ls = doc.imageLinkedSkus;
  if (!ls || ls.length !== imgs.length) {
    return true;
  }
  const rowSku = ls[imageIndex]?.trim();
  if (!rowSku) {
    // No per-row SKU: show this file for every product linked on the CMS row (collections / legacy uploads).
    return true;
  }
  return normalizeSku(rowSku) === normalizeSku(sku);
}

/** Visual media URLs from CMS rows linked to this SKU (respects explicit per-file `imageLinkedSkus` when set). */
export function collectCmsGalleryUrlsForSku(sku: string, cmsContent: CMSContent[]): string[] {
  const out: string[] = [];
  for (const doc of cmsContent) {
    if (!docLinksSku(doc, sku)) continue;
    const imgs = doc.images || [];
    for (let i = 0; i < imgs.length; i++) {
      if (!cmsImageBelongsToSku(doc, i, sku)) continue;
      const u = imgs[i];
      if (u) out.push(u);
    }
    for (const u of doc.videos || []) {
      if (u) out.push(u);
    }
  }
  return out;
}

/** Images stored on linked purchase order lines for this inventory SKU. */
export function collectPurchaseOrderImagesForSku(item: InventoryItem, purchaseOrders: PurchaseOrder[]): string[] {
  const linked = new Set(item.linkedPurchaseOrders ?? []);
  const skuNorm = normalizeSku(item.sku);
  const out: string[] = [];
  for (const po of purchaseOrders) {
    if (!linked.has(po.id)) continue;
    if (normalizeSku(po.sku) !== skuNorm) continue;
    for (const u of po.images || []) {
      if (u) out.push(u);
    }
  }
  return out;
}

function mergeDedupeOrdered(lists: string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    for (const u of list) {
      if (!u || seen.has(u)) continue;
      seen.add(u);
      merged.push(u);
    }
  }
  return merged;
}

export type MergedGalleryExtras = {
  /** `inventoryMedia` collection rows keyed by SKU */
  inventoryMediaImages?: string[];
  /** `purchaseOrders[].images` for POs linked to this item */
  purchaseOrderImages?: string[];
};

/**
 * Order: inventory `images` → optional `inventoryMedia` → CMS (images+videos) → PO line images. Deduped by exact URL.
 */
export function buildMergedGalleryUrls(
  inventoryImages: string[] | undefined,
  sku: string,
  cmsContent: CMSContent[],
  extras?: MergedGalleryExtras
): string[] {
  return mergeDedupeOrdered([
    inventoryImages || [],
    extras?.inventoryMediaImages || [],
    collectCmsGalleryUrlsForSku(sku, cmsContent),
    extras?.purchaseOrderImages || [],
  ]);
}
