export const INVENTORY_BULK_IMAGE_MAX_FILES = 50;
export const INVENTORY_BULK_IMAGE_MAX_SIZE_MB = 20;
export const INVENTORY_BULK_IMAGE_MAX_SIZE_BYTES =
  INVENTORY_BULK_IMAGE_MAX_SIZE_MB * 1024 * 1024;

export type InventoryBulkImageFilenameMatch = {
  sku: string;
  sequence: number;
};

function filenameStem(filename: string): string {
  const trimmed = filename.trim();
  const dot = trimmed.lastIndexOf('.');
  return (dot > 0 ? trimmed.slice(0, dot) : trimmed).trim();
}

/**
 * Maps `SKU.jpg`, `SKU_2.jpg`, or `SKU-2.jpg` to an inventory SKU.
 * Exact SKU matches always win so SKUs that legitimately end in `-2` are
 * never mistaken for the second image of another SKU.
 */
export function matchInventorySkuFromImageFilename(
  filename: string,
  inventorySkus: string[]
): InventoryBulkImageFilenameMatch | null {
  const stem = filenameStem(filename);
  if (!stem) return null;

  const normalizedStem = stem.toLocaleLowerCase();
  const skus = inventorySkus
    .map((sku) => sku.trim())
    .filter(Boolean);

  const exact = skus.find((sku) => sku.toLocaleLowerCase() === normalizedStem);
  if (exact) return { sku: exact, sequence: 1 };

  const candidates = skus
    .map((sku) => {
      const normalizedSku = sku.toLocaleLowerCase();
      if (!normalizedStem.startsWith(normalizedSku)) return null;
      const suffix = stem.slice(sku.length);
      const match = suffix.match(/^[_-](\d+)$/);
      if (!match) return null;
      const sequence = Number.parseInt(match[1], 10);
      if (!Number.isFinite(sequence) || sequence < 2) return null;
      return { sku, sequence };
    })
    .filter((match): match is InventoryBulkImageFilenameMatch => match !== null)
    .sort((a, b) => b.sku.length - a.sku.length);

  return candidates[0] ?? null;
}
