import type { AutoconsumoLine, AutoconsumoNote, InventoryItem } from '../types';
import { deleteAutoconsumoNote, updateAutoconsumoNote } from '../services/autoconsumoService';
import { getAvailableStock } from './stockReservation';

export type AutoconsumoStockPreview = {
  description: string;
  sku: string;
  quantity: number;
  currentStock: number;
  newStock: number;
};

/** Preview of ecuadorStock restoration when deleting a note. */
export function buildAutoconsumoReturnItems(
  note: AutoconsumoNote,
  inventory: InventoryItem[]
): AutoconsumoStockPreview[] {
  const items: AutoconsumoStockPreview[] = [];
  for (const line of note.items) {
    const qty = Math.max(0, Number(line.quantity) || 0);
    if (qty <= 0) continue;
    const inv = inventory.find((i) => i.sku === line.sku);
    if (!inv) continue;
    const current = Number(inv.ecuadorStock ?? 0);
    items.push({
      description: line.description,
      sku: line.sku,
      quantity: qty,
      currentStock: current,
      newStock: current + qty,
    });
  }
  return items;
}

/** Aggregate qty by inventory id (handles duplicate SKUs on a note). */
function qtyByInventoryId(
  lines: AutoconsumoLine[],
  inventory: InventoryItem[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    const inv = inventory.find((i) => i.sku === line.sku);
    if (!inv) continue;
    const qty = Math.max(0, Number(line.quantity) || 0);
    if (qty <= 0) continue;
    map.set(inv.id, (map.get(inv.id) ?? 0) + qty);
  }
  return map;
}

/**
 * Deduct ecuadorStock immediately for autoconsumo create.
 * Throws if any SKU lacks available stock (respects reservedStock).
 */
export async function deductStockForAutoconsumo(
  lines: AutoconsumoLine[],
  inventory: InventoryItem[],
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>
): Promise<void> {
  const byId = qtyByInventoryId(lines, inventory);
  for (const [id, qty] of byId) {
    const item = inventory.find((i) => i.id === id);
    if (!item) throw new Error(`Inventario no encontrado para descontar`);
    const available = getAvailableStock(item);
    if (qty > available) {
      throw new Error(
        `Stock insuficiente para ${item.sku}: disponible ${available}, solicitado ${qty}`
      );
    }
  }
  for (const [id, qty] of byId) {
    const item = inventory.find((i) => i.id === id);
    if (!item) continue;
    const current = Number(item.ecuadorStock ?? 0);
    await updateInventoryItem(id, {
      ecuadorStock: Math.max(0, current - qty),
    });
  }
}

/** Restore ecuadorStock when deleting (optional). */
export async function restoreStockForAutoconsumo(
  note: AutoconsumoNote,
  inventory: InventoryItem[],
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>
): Promise<void> {
  const byId = qtyByInventoryId(note.items, inventory);
  for (const [id, qty] of byId) {
    const item = inventory.find((i) => i.id === id);
    if (!item) continue;
    const current = Number(item.ecuadorStock ?? 0);
    await updateInventoryItem(id, {
      ecuadorStock: current + qty,
    });
  }
}

export async function deleteAutoconsumoWithStockOption(
  note: AutoconsumoNote,
  revertInventory: boolean,
  inventory: InventoryItem[],
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>
): Promise<void> {
  if (revertInventory) {
    await restoreStockForAutoconsumo(note, inventory, updateInventoryItem);
  }
  await deleteAutoconsumoNote(note.id);
}

/**
 * Apply stock deltas when editing a note (new qty − old qty per SKU).
 * Positive delta = additional deduction; negative = restore.
 */
export async function applyAutoconsumoEditStockDeltas(
  oldLines: AutoconsumoLine[],
  newLines: AutoconsumoLine[],
  inventory: InventoryItem[],
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>
): Promise<void> {
  const oldById = qtyByInventoryId(oldLines, inventory);
  const newById = qtyByInventoryId(newLines, inventory);
  const allIds = new Set([...oldById.keys(), ...newById.keys()]);

  // Validate increases first
  for (const id of allIds) {
    const delta = (newById.get(id) ?? 0) - (oldById.get(id) ?? 0);
    if (delta <= 0) continue;
    const item = inventory.find((i) => i.id === id);
    if (!item) throw new Error('Inventario no encontrado al editar autoconsumo');
    const available = getAvailableStock(item);
    if (delta > available) {
      throw new Error(
        `Stock insuficiente para ${item.sku}: disponible ${available}, adicional ${delta}`
      );
    }
  }

  for (const id of allIds) {
    const delta = (newById.get(id) ?? 0) - (oldById.get(id) ?? 0);
    if (delta === 0) continue;
    const item = inventory.find((i) => i.id === id);
    if (!item) continue;
    const current = Number(item.ecuadorStock ?? 0);
    await updateInventoryItem(id, {
      ecuadorStock: Math.max(0, current - delta),
    });
  }
}

export async function saveAutoconsumoEditWithStock(
  noteId: string,
  oldNote: AutoconsumoNote,
  updates: {
    recipient: string;
    notes?: string;
    date: Date;
    items: AutoconsumoLine[];
    totalCost: number;
  },
  inventory: InventoryItem[],
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>
): Promise<void> {
  await applyAutoconsumoEditStockDeltas(
    oldNote.items,
    updates.items,
    inventory,
    updateInventoryItem
  );
  await updateAutoconsumoNote(noteId, {
    recipient: updates.recipient,
    notes: updates.notes,
    date: updates.date,
    items: updates.items,
    totalCost: updates.totalCost,
  });
}
