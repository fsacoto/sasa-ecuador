import type { InventoryItem } from '../types';
import { isMaterialCategory } from './materials';

/** True when the item can be sold, consigned, or added to a sales note line. */
export function hasSellableStock(
  item: Pick<InventoryItem, 'ecuadorStock' | 'category'>
): boolean {
  if (isMaterialCategory(item.category)) return false;
  return (item.ecuadorStock ?? 0) > 0;
}

export function filterSellableInventory<
  T extends Pick<InventoryItem, 'ecuadorStock' | 'category'>,
>(items: T[]): T[] {
  return items.filter(hasSellableStock);
}

/** Materials may be sold? Never — even with stock. */
export function isSellableInventoryItem(
  item: Pick<InventoryItem, 'category'>
): boolean {
  return !isMaterialCategory(item.category);
}
