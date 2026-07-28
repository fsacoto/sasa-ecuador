import type { InventoryItem } from '../types';
import { isMaterialCategory } from './materials';
import { getAvailableStock } from './stockReservation';

/** True when the item can be sold, consigned, or added to a sales note line. */
export function hasSellableStock(
  item: Pick<InventoryItem, 'ecuadorStock' | 'reservedStock' | 'category'>
): boolean {
  if (isMaterialCategory(item.category)) return false;
  return getAvailableStock(item) > 0;
}

export function filterSellableInventory<
  T extends Pick<InventoryItem, 'ecuadorStock' | 'reservedStock' | 'category'>,
>(items: T[]): T[] {
  return items.filter(hasSellableStock);
}

/** Materials may be sold? Never — even with stock. */
export function isSellableInventoryItem(
  item: Pick<InventoryItem, 'category'>
): boolean {
  return !isMaterialCategory(item.category);
}
