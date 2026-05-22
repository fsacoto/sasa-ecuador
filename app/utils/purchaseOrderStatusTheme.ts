import type { PurchaseOrder, PurchaseOrderStatus } from '../types';

/** Un color sólido por estado (iconos y acentos). */
export const PO_STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  Ordered: '#6366f1',
  Received: '#2563eb',
  Verified: '#16a34a',
};

export const PO_STATUS_BADGE_CLASS: Record<PurchaseOrderStatus, string> = {
  Ordered: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  Received: 'border-blue-200 bg-blue-50 text-blue-900',
  Verified: 'border-green-200 bg-green-50 text-green-900',
};

export const PO_ACTIVE_STATUSES: PurchaseOrderStatus[] = ['Ordered', 'Received', 'Verified'];

/** Legacy Firestore / datos antiguos: Shipped se trata como Recibido. */
export function effectivePurchaseOrderStatus(
  raw: PurchaseOrder['status'] | string | undefined
): PurchaseOrderStatus {
  const s = String(raw ?? 'Ordered').trim();
  if (s === 'Shipped' || s.toLowerCase() === 'shipped') return 'Received';
  if (s === 'Ordered' || s === 'Received' || s === 'Verified') return s;
  return 'Ordered';
}

export function orderMatchesStatusFilter(
  order: PurchaseOrder,
  filterStatus: string
): boolean {
  if (filterStatus === 'all') return true;
  return effectivePurchaseOrderStatus(order.status) === filterStatus;
}
