import {
  Consignment,
  ConsignmentItem,
  ConsignmentSaleLine,
  ConsignmentSaleRecord,
  ConsignmentStatus,
  SalesInvoice,
  SalesInvoiceLine,
} from '../types';

export function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function consignmentStatusFromItems(items: ConsignmentItem[]): ConsignmentStatus {
  const totalDelivered = items.reduce((sum, item) => sum + item.quantityDelivered, 0);
  const totalSold = items.reduce((sum, item) => sum + item.quantitySold, 0);
  const totalReturned = items.reduce((sum, item) => sum + item.quantityReturned, 0);
  const totalAccounted = totalSold + totalReturned;
  if (totalAccounted >= totalDelivered) return 'Closed';
  if (totalAccounted > 0) return 'Partially Closed';
  return 'Open';
}

export function isActiveConsignmentSale(sale: ConsignmentSaleRecord): boolean {
  return !sale.reversed;
}

export function activeConsignmentSales(sales: ConsignmentSaleRecord[] | undefined): ConsignmentSaleRecord[] {
  return (sales || []).filter(isActiveConsignmentSale);
}

export function pendingConsignmentSales(sales: ConsignmentSaleRecord[] | undefined): ConsignmentSaleRecord[] {
  return activeConsignmentSales(sales).filter((s) => !s.invoiced);
}

export function saleRecordUnits(sale: ConsignmentSaleRecord): number {
  return sale.lines.reduce((sum, line) => sum + (line.quantity || 0), 0);
}

export function saleRecordTotal(sale: ConsignmentSaleRecord): number {
  return roundMoney2(sale.lines.reduce((sum, line) => sum + (line.totalPrice || 0), 0));
}

/** Merge sale lines by sku + unitPrice for a nota de pedido. */
export function aggregateConsignmentSaleLines(
  sales: ConsignmentSaleRecord[]
): SalesInvoiceLine[] {
  const map = new Map<string, SalesInvoiceLine>();
  for (const sale of sales) {
    for (const line of sale.lines) {
      const price = roundMoney2(line.unitPrice);
      const key = `${line.sku.trim().toLowerCase()}|${price.toFixed(2)}`;
      const existing = map.get(key);
      if (existing) {
        const quantity = existing.quantity + line.quantity;
        map.set(key, {
          ...existing,
          quantity,
          totalPrice: roundMoney2(quantity * price),
        });
      } else {
        map.set(key, {
          sku: line.sku,
          description: line.description,
          quantity: line.quantity,
          unitPrice: price,
          totalPrice: roundMoney2(line.quantity * price),
          line: line.line,
          category: line.category,
        });
      }
    }
  }
  return Array.from(map.values());
}

export function createConsignmentSaleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function parseConsignmentSales(raw: unknown): ConsignmentSaleRecord[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((entry) => {
    const s = entry as Record<string, unknown>;
    const createdAt =
      s.createdAt && typeof (s.createdAt as { toDate?: () => Date }).toDate === 'function'
        ? (s.createdAt as { toDate: () => Date }).toDate()
        : s.createdAt instanceof Date
          ? s.createdAt
          : s.createdAt
            ? new Date(s.createdAt as string | number)
            : new Date();
    const reversedAtRaw = s.reversedAt;
    const reversedAt =
      reversedAtRaw &&
      typeof (reversedAtRaw as { toDate?: () => Date }).toDate === 'function'
        ? (reversedAtRaw as { toDate: () => Date }).toDate()
        : reversedAtRaw instanceof Date
          ? reversedAtRaw
          : reversedAtRaw
            ? new Date(reversedAtRaw as string | number)
            : undefined;
    const lines = Array.isArray(s.lines)
      ? (s.lines as ConsignmentSaleLine[]).map((line) => ({
          itemIndex: Number(line.itemIndex) || 0,
          sku: String(line.sku || ''),
          description: String(line.description || ''),
          quantity: Number(line.quantity) || 0,
          unitPrice: Number(line.unitPrice) || 0,
          totalPrice: Number(line.totalPrice) || 0,
          ...(line.line ? { line: line.line } : {}),
          ...(line.category ? { category: line.category } : {}),
        }))
      : [];
    return {
      id: String(s.id || createConsignmentSaleId()),
      createdAt,
      ...(typeof s.createdBy === 'string' && s.createdBy ? { createdBy: s.createdBy } : {}),
      lines,
      invoiced: Boolean(s.invoiced),
      ...(s.reversed ? { reversed: true } : {}),
      ...(reversedAt ? { reversedAt } : {}),
    } satisfies ConsignmentSaleRecord;
  });
}

/** Build sale records from existing linked invoices (one-time soft migration). */
export function saleRecordsFromLegacyInvoices(
  invoices: SalesInvoice[]
): {
  sales: ConsignmentSaleRecord[];
  linkedSalesInvoiceId?: string;
  linkedSalesInvoiceNumber?: string;
} {
  const sorted = [...invoices].sort(
    (a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0)
  );
  const sales: ConsignmentSaleRecord[] = sorted.map((inv) => ({
    id: `legacy-${inv.id}`,
    createdAt: inv.date instanceof Date ? inv.date : new Date(inv.date),
    lines: (inv.items || []).map((item, itemIndex) => ({
      itemIndex,
      sku: item.sku,
      description: item.description,
      quantity: item.quantity,
      unitPrice: roundMoney2(item.unitPrice),
      totalPrice: roundMoney2(item.totalPrice),
      ...(item.line ? { line: item.line } : {}),
      ...(item.category ? { category: item.category } : {}),
    })),
    invoiced: true,
  }));

  const primary = sorted[0];
  return {
    sales,
    ...(primary
      ? {
          linkedSalesInvoiceId: primary.id,
          linkedSalesInvoiceNumber: primary.invoiceNumber,
        }
      : {}),
  };
}

export function applyRegisterSaleQuantities(
  items: ConsignmentItem[],
  lines: ConsignmentSaleLine[]
): ConsignmentItem[] {
  const next = items.map((item) => ({ ...item }));
  for (const line of lines) {
    const idx = line.itemIndex;
    if (idx < 0 || idx >= next.length) continue;
    next[idx] = {
      ...next[idx],
      quantitySold: next[idx].quantitySold + line.quantity,
    };
  }
  return next;
}

/** Safer reverse: deduct by itemIndex first, then by SKU for any leftover. */
export function reverseSaleQuantitiesOnItems(
  items: ConsignmentItem[],
  lines: ConsignmentSaleLine[]
): ConsignmentItem[] {
  const next = items.map((item) => ({ ...item }));
  const leftover: Array<{ sku: string; quantity: number }> = [];

  for (const line of lines) {
    const idx = line.itemIndex;
    if (idx >= 0 && idx < next.length && next[idx].sku.trim() === line.sku.trim()) {
      next[idx] = {
        ...next[idx],
        quantitySold: Math.max(0, next[idx].quantitySold - line.quantity),
      };
    } else {
      leftover.push({ sku: line.sku, quantity: line.quantity });
    }
  }

  for (const { sku, quantity } of leftover) {
    let remaining = quantity;
    for (let i = 0; i < next.length && remaining > 0; i++) {
      if (next[i].sku.trim() !== sku.trim()) continue;
      const take = Math.min(next[i].quantitySold, remaining);
      if (take <= 0) continue;
      next[i] = {
        ...next[i],
        quantitySold: next[i].quantitySold - take,
      };
      remaining -= take;
    }
  }

  return next;
}

export type LinkedNotePaymentSnapshot = Pick<
  SalesInvoice,
  'paymentStatus' | 'amountPaid' | 'remainingBalance' | 'paymentDate' | 'paymentMethod' | 'paymentComment' | 'paymentHistory'
>;

/** Keep prior payments when adjusting a linked note; clamp amountPaid to new total. */
export function paymentFieldsForAdjustedNote(
  grandTotal: number,
  previous?: LinkedNotePaymentSnapshot | null
): {
  paymentStatus: SalesInvoice['paymentStatus'];
  amountPaid: number;
  remainingBalance: number;
  paymentDate?: Date;
  paymentMethod?: string;
  paymentComment?: string;
  paymentHistory?: SalesInvoice['paymentHistory'];
} {
  if (!previous) {
    return {
      paymentStatus: 'Unpaid',
      amountPaid: 0,
      remainingBalance: grandTotal,
    };
  }

  const paid = roundMoney2(Math.min(previous.amountPaid || 0, grandTotal));
  let paymentStatus: SalesInvoice['paymentStatus'] = 'Unpaid';
  if (grandTotal <= 0.005) {
    paymentStatus = 'Paid';
  } else if (paid <= 0.005) {
    paymentStatus = 'Unpaid';
  } else if (paid >= grandTotal - 0.005) {
    paymentStatus = 'Paid';
  } else {
    paymentStatus = 'Partially Paid';
  }

  return {
    paymentStatus,
    amountPaid: paid,
    remainingBalance: roundMoney2(Math.max(0, grandTotal - paid)),
    ...(previous.paymentDate ? { paymentDate: previous.paymentDate } : {}),
    ...(previous.paymentMethod ? { paymentMethod: previous.paymentMethod } : {}),
    ...(previous.paymentComment ? { paymentComment: previous.paymentComment } : {}),
    ...(previous.paymentHistory ? { paymentHistory: previous.paymentHistory } : {}),
  };
}

export function pickLinkedInvoice(
  consignment: Consignment,
  invoices: SalesInvoice[]
): SalesInvoice | null {
  if (consignment.linkedSalesInvoiceId) {
    const byId = invoices.find(
      (inv) =>
        inv.id === consignment.linkedSalesInvoiceId && inv.deliveryStatus !== 'Canceled'
    );
    if (byId) return byId;
  }
  const linked = invoices.filter(
    (inv) =>
      inv.sourceConsignmentFirestoreId === consignment.id && inv.deliveryStatus !== 'Canceled'
  );
  if (linked.length === 0) return null;
  linked.sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
  return linked[0];
}
