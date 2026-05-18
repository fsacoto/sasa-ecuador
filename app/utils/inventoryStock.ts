import type { InventoryItem } from '../types';

/** True when the item can be sold, consigned, or added to a sales note line. */
export function hasSellableStock(item: Pick<InventoryItem, 'ecuadorStock'>): boolean {
  return (item.ecuadorStock ?? 0) > 0;
}

export function filterSellableInventory<T extends Pick<InventoryItem, 'ecuadorStock'>>(
  items: T[]
): T[] {
  return items.filter(hasSellableStock);
}
