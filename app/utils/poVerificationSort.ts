import type { PurchaseOrder } from '../types';
import { displayCategory, displayLine } from './merchandiseLabels';

export type VerificationPdfSortMode = 'excel' | 'category' | 'line';

function createdAtMs(order: PurchaseOrder): number {
  const raw = order.createdAt as Date | string | number | undefined;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'string' || typeof raw === 'number') {
    const ms = new Date(raw).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });
}

function sortLabel(value: string): string {
  const trimmed = value.trim();
  return trimmed || '\uFFFF';
}

function inferredImportIndex(order: PurchaseOrder): number | null {
  if (typeof order.bulkImportRowIndex === 'number' && Number.isFinite(order.bulkImportRowIndex)) {
    return order.bulkImportRowIndex;
  }
  const match = (order.sku || '').match(/^IMP\d{5}(\d{3})$/i);
  if (match) return Number(match[1]);
  return null;
}

function compareExcelOrder(
  a: PurchaseOrder,
  b: PurchaseOrder,
  indexA: number,
  indexB: number
): number {
  const ra = inferredImportIndex(a);
  const rb = inferredImportIndex(b);
  if (ra != null && rb != null && ra !== rb) return ra - rb;
  if ((ra != null) !== (rb != null)) return ra != null ? -1 : 1;

  const ta = createdAtMs(a);
  const tb = createdAtMs(b);
  if (ta !== tb) return ta - tb;

  return indexA - indexB;
}

export function sortItemsByPurchaseOrderList<T extends { order: PurchaseOrder }>(
  items: T[],
  mode: VerificationPdfSortMode
): T[] {
  if (items.length <= 1) return items.slice();
  const sortedOrders = sortPurchaseOrdersForVerification(
    items.map((item) => item.order),
    mode
  );
  const byId = new Map(items.map((item) => [item.order.id, item]));
  const out: T[] = [];
  for (const order of sortedOrders) {
    const item = byId.get(order.id);
    if (item) out.push(item);
  }
  return out;
}

export function sortPurchaseOrdersForVerification(
  orders: PurchaseOrder[],
  mode: VerificationPdfSortMode
): PurchaseOrder[] {
  const indexed = orders.map((order, index) => ({ order, index }));

  indexed.sort((a, b) => {
    if (mode === 'excel') {
      return compareExcelOrder(a.order, b.order, a.index, b.index);
    }

    const catA = sortLabel(displayCategory(a.order.category));
    const catB = sortLabel(displayCategory(b.order.category));
    const lineA = sortLabel(displayLine(a.order.line));
    const lineB = sortLabel(displayLine(b.order.line));

    if (mode === 'category') {
      const byCat = compareText(catA, catB);
      if (byCat !== 0) return byCat;
      const byLine = compareText(lineA, lineB);
      if (byLine !== 0) return byLine;
    } else {
      const byLine = compareText(lineA, lineB);
      if (byLine !== 0) return byLine;
      const byCat = compareText(catA, catB);
      if (byCat !== 0) return byCat;
    }

    const byDesc = compareText(a.order.description || '', b.order.description || '');
    if (byDesc !== 0) return byDesc;
    return compareExcelOrder(a.order, b.order, a.index, b.index);
  });

  return indexed.map((entry) => entry.order);
}
