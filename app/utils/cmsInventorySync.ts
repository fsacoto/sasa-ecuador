import type { InventoryItem } from '../types';

/** Same shape as CMS upload rows (file + optional SKU for Storage / Firestore). */
export type CmsMediaUploadRow = { file: File; linkedSku?: string };

/**
 * Appends new CMS image URLs onto matching inventory rows by SKU.
 * Only `image/*` uploads are copied (inventory `images` is used as photo URLs).
 */
export async function mergeCmsImageUploadsIntoInventory(
  uploadRows: CmsMediaUploadRow[],
  uploadedUrls: string[],
  inventoryItems: InventoryItem[],
  updateInventoryItem: (id: string, update: Partial<InventoryItem>) => Promise<void>
): Promise<void> {
  if (uploadRows.length !== uploadedUrls.length) {
    console.warn('mergeCmsImageUploadsIntoInventory: uploadRows and URLs length mismatch; skipping sync.');
    return;
  }

  const skuToNewUrls = new Map<string, string[]>();
  for (let i = 0; i < uploadRows.length; i++) {
    const row = uploadRows[i];
    if (!row.file.type.startsWith('image/')) continue;
    const sku = row.linkedSku?.trim();
    if (!sku) continue;
    const url = uploadedUrls[i];
    if (!url) continue;
    const list = skuToNewUrls.get(sku) ?? [];
    list.push(url);
    skuToNewUrls.set(sku, list);
  }

  for (const [sku, newUrls] of skuToNewUrls) {
    const inv = inventoryItems.find((it) => it.sku === sku);
    if (!inv) {
      console.warn(
        `[CMS → inventory] No inventory item for SKU "${sku}"; skipped attaching ${newUrls.length} image(s).`
      );
      continue;
    }
    const existing = inv.images ?? [];
    const seen = new Set(existing);
    const merged = [...existing];
    for (const url of newUrls) {
      if (!seen.has(url)) {
        seen.add(url);
        merged.push(url);
      }
    }
    await updateInventoryItem(inv.id, { images: merged });
  }
}
