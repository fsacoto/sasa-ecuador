import type {
  AdditionalCost,
  AutoconsumoNote,
  InventoryItem,
  PurchaseOrder,
} from '../types';
import { resolveSkuUnitCost } from './landedCostCalculation';

export type AutoconsumoExpenseDateRange = { from: Date; to: Date };

export type AutoconsumoExpenseByNote = {
  noteId: string;
  noteNumber: string;
  recipient: string;
  date: Date;
  totalCost: number;
  itemCount: number;
  linesWithMissingCost: number;
};

export type AutoconsumoExpenseBySku = {
  sku: string;
  description: string;
  quantity: number;
  unitCost: number | null;
  totalCost: number;
  hasCost: boolean;
};

export type AutoconsumoExpenseSummary = {
  totalExpense: number;
  noteCount: number;
  unitCount: number;
  linesWithMissingCost: number;
};

export type AutoconsumoExpenseResult = {
  summary: AutoconsumoExpenseSummary;
  byNote: AutoconsumoExpenseByNote[];
  bySku: AutoconsumoExpenseBySku[];
};

function toJsDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const maybe = value as { toDate?: () => Date };
  if (typeof maybe.toDate === 'function') {
    const d = maybe.toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function noteDate(note: AutoconsumoNote): Date | null {
  return toJsDate(note.date) ?? toJsDate(note.createdAt);
}

/**
 * Gasto de autoconsumo en un período.
 * Prefiere el unitCost guardado en la nota; si falta, resuelve con desembarque actual.
 * No afecta estadísticas de notas de pedido.
 */
export function computeAutoconsumoExpense(
  notes: AutoconsumoNote[],
  inventory: InventoryItem[],
  purchaseOrders: PurchaseOrder[],
  additionalCosts: AdditionalCost[],
  range: AutoconsumoExpenseDateRange
): AutoconsumoExpenseResult {
  const byNote: AutoconsumoExpenseByNote[] = [];
  const skuMap = new Map<string, AutoconsumoExpenseBySku>();

  let totalExpense = 0;
  let unitCount = 0;
  let linesWithMissingCost = 0;

  for (const note of notes) {
    const d = noteDate(note);
    if (!d || d < range.from || d > range.to) continue;

    let noteCost = 0;
    let noteMissing = 0;
    let noteUnits = 0;

    for (const line of note.items || []) {
      const qty = Math.max(0, Number(line.quantity) || 0);
      if (qty <= 0) continue;
      noteUnits += qty;

      let unitCost =
        line.unitCost != null && Number.isFinite(line.unitCost) ? line.unitCost : null;
      if (unitCost == null) {
        const resolved = resolveSkuUnitCost(
          line.sku,
          inventory,
          purchaseOrders,
          additionalCosts
        );
        unitCost = resolved.unitCost;
      }

      const lineCost =
        unitCost != null
          ? qty * unitCost
          : Number(line.lineCost) > 0
            ? Number(line.lineCost)
            : 0;

      if (unitCost == null && !(Number(line.lineCost) > 0)) {
        noteMissing += 1;
        linesWithMissingCost += 1;
      }

      noteCost += lineCost;

      const existing = skuMap.get(line.sku);
      if (existing) {
        existing.quantity += qty;
        existing.totalCost += lineCost;
        if (unitCost != null) {
          existing.unitCost = unitCost;
          existing.hasCost = true;
        }
      } else {
        skuMap.set(line.sku, {
          sku: line.sku,
          description: line.description || line.sku,
          quantity: qty,
          unitCost,
          totalCost: lineCost,
          hasCost: unitCost != null || Number(line.lineCost) > 0,
        });
      }
    }

    totalExpense += noteCost;
    unitCount += noteUnits;

    byNote.push({
      noteId: note.id,
      noteNumber: note.noteNumber,
      recipient: note.recipient,
      date: d,
      totalCost: noteCost,
      itemCount: note.items?.length || 0,
      linesWithMissingCost: noteMissing,
    });
  }

  byNote.sort((a, b) => b.date.getTime() - a.date.getTime());

  return {
    summary: {
      totalExpense,
      noteCount: byNote.length,
      unitCount,
      linesWithMissingCost,
    },
    byNote,
    bySku: Array.from(skuMap.values()).sort((a, b) => b.totalCost - a.totalCost),
  };
}
