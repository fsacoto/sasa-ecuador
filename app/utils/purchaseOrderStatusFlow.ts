import type { PurchaseOrderStatus } from '../types';
import { effectivePurchaseOrderStatus } from './purchaseOrderStatusTheme';

export const PO_STATUS_PIPELINE: PurchaseOrderStatus[] = ['Ordered', 'Received', 'Verified'];

const STATUS_INDEX: Record<PurchaseOrderStatus, number> = {
  Ordered: 0,
  Received: 1,
  Verified: 2,
};

export function getNextStatus(current: PurchaseOrderStatus | string | undefined): PurchaseOrderStatus | null {
  const normalized = effectivePurchaseOrderStatus(current);
  const idx = STATUS_INDEX[normalized];
  if (idx == null || idx >= PO_STATUS_PIPELINE.length - 1) return null;
  return PO_STATUS_PIPELINE[idx + 1];
}

export function canTransitionTo(
  from: PurchaseOrderStatus | string | undefined,
  to: PurchaseOrderStatus,
  options?: { allowOnlyNext?: boolean }
): boolean {
  const fromNorm = effectivePurchaseOrderStatus(from);
  const fromIdx = STATUS_INDEX[fromNorm];
  const toIdx = STATUS_INDEX[to];
  if (fromIdx == null || toIdx == null) return false;
  if (options?.allowOnlyNext) {
    return toIdx === fromIdx + 1;
  }
  return toIdx >= fromIdx;
}

export function statusLabelKey(status: PurchaseOrderStatus): string {
  switch (status) {
    case 'Ordered':
      return 'statusOrdered';
    case 'Received':
      return 'statusReceived';
    case 'Verified':
      return 'statusVerified';
    default:
      return 'statusOrdered';
  }
}
