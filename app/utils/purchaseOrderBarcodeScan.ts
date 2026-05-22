import type { PurchaseOrder } from '../types';
import { scannedCodeMatchesSku } from './barcodeGenerator';
import { effectivePurchaseOrderStatus } from './purchaseOrderStatusTheme';

export type ScanProgress = {
  scanned: number;
  expected: number;
  remaining: number;
  isComplete: boolean;
};

export function getQuantityScanned(order: PurchaseOrder): number {
  const n = order.quantityScanned;
  if (typeof n === 'number' && !Number.isNaN(n) && n >= 0) return Math.floor(n);
  return 0;
}

export function getScanProgress(order: PurchaseOrder): ScanProgress {
  const expected = Math.max(0, order.quantity ?? 0);
  const scanned = Math.min(getQuantityScanned(order), expected);
  const remaining = Math.max(0, expected - scanned);
  return {
    scanned,
    expected,
    remaining,
    isComplete: expected > 0 && scanned >= expected,
  };
}

export function isLineEligibleForScanner(order: PurchaseOrder): boolean {
  return effectivePurchaseOrderStatus(order.status) === 'Received';
}

/** Recibido y aún no verificado (puede tener escaneo parcial o completo pendiente de confirmar). */
export function isLinePendingScanner(order: PurchaseOrder): boolean {
  return isLineEligibleForScanner(order);
}

/** Todas las unidades escaneadas; falta confirmar para pasar a Verificado e inventario. */
export function isLineReadyToConfirm(order: PurchaseOrder): boolean {
  if (!isLineEligibleForScanner(order)) return false;
  return getScanProgress(order).isComplete;
}

/** Lines with at least one scan registered (still Received). */
export function isLinePartiallyScanned(order: PurchaseOrder): boolean {
  if (!isLineEligibleForScanner(order)) return false;
  return getScanProgress(order).scanned > 0;
}

export function hasActiveScanProgress(order: PurchaseOrder): boolean {
  if (!isLineEligibleForScanner(order)) return false;
  const p = getScanProgress(order);
  return p.scanned > 0 && !p.isComplete;
}

export function purchaseOrderLineMatchesScan(order: PurchaseOrder, scannedRaw: string): boolean {
  return scannedCodeMatchesSku(scannedRaw, order.sku, order.supplierSKU);
}

export type FindLinesOptions = {
  invoice?: string;
  onlyPending?: boolean;
};

/**
 * Find PO lines matching a scanner read within a pool (typically one invoice session).
 */
export function findPurchaseOrderLinesByBarcodeScan(
  orders: PurchaseOrder[],
  scannedRaw: string,
  options?: FindLinesOptions
): PurchaseOrder[] {
  const code = scannedRaw.trim();
  if (!code) return [];

  return orders.filter((order) => {
    if (options?.invoice && order.invoice !== options.invoice) return false;
    if (!isLineEligibleForScanner(order)) return false;
    if (options?.onlyPending !== false && !isLineEligibleForScanner(order)) return false;
    return purchaseOrderLineMatchesScan(order, code);
  });
}

export type InvoiceScannerSummary = {
  invoice: string;
  supplierId: string;
  lineCount: number;
  pendingLines: number;
  pendingUnits: number;
  completedLines: number;
};

export function summarizeInvoiceForScanner(
  invoice: string,
  orders: PurchaseOrder[]
): InvoiceScannerSummary | null {
  const lines = orders.filter((o) => o.invoice === invoice);
  if (lines.length === 0) return null;

  let pendingLines = 0;
  let pendingUnits = 0;
  let completedLines = 0;

  for (const order of lines) {
    if (!isLineEligibleForScanner(order)) continue;
    const prog = getScanProgress(order);
    pendingLines++;
    pendingUnits += prog.remaining;
    if (prog.isComplete) {
      completedLines++;
    }
  }

  return {
    invoice,
    supplierId: lines[0]?.supplierId ?? '',
    lineCount: lines.filter(isLineEligibleForScanner).length,
    pendingLines,
    pendingUnits,
    completedLines,
  };
}

export function listInvoicesEligibleForScanner(orders: PurchaseOrder[]): string[] {
  const invoices = new Set<string>();
  for (const order of orders) {
    if (isLineEligibleForScanner(order)) {
      invoices.add(order.invoice);
    }
  }
  return [...invoices].sort((a, b) => a.localeCompare(b));
}

/** Stable key for remembering line choice when same SKU appears on multiple rows. */
export function scanDisambiguationKey(scannedRaw: string): string {
  return scannedRaw.trim().toLowerCase();
}
