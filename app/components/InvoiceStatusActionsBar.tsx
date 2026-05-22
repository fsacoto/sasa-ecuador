'use client';

import { PurchaseOrder } from '../types';
import { useTranslation } from '../context/TranslationContext';
import { effectivePurchaseOrderStatus } from '../utils/purchaseOrderStatusTheme';
import PoStatusIcon from './icons/PoStatusIcon';

interface InvoiceStatusActionsBarProps {
  invoice: string;
  orders: PurchaseOrder[];
  onMarkReceived: () => void;
  onVerifyInvoice: () => void;
  onOpenScanner?: () => void;
  busy?: boolean;
}

export function getInvoiceWorkflowActions(orders: PurchaseOrder[]) {
  const active = orders.filter((o) => effectivePurchaseOrderStatus(o.status) !== 'Verified');
  const canMarkReceived = active.some((o) => effectivePurchaseOrderStatus(o.status) === 'Ordered');
  const canVerify = orders.some((o) => effectivePurchaseOrderStatus(o.status) === 'Received');
  const allVerified =
    orders.length > 0 && orders.every((o) => effectivePurchaseOrderStatus(o.status) === 'Verified');
  return { canMarkReceived, canVerify, allVerified };
}

export default function InvoiceStatusActionsBar({
  orders,
  onMarkReceived,
  onVerifyInvoice,
  onOpenScanner,
  busy = false,
}: InvoiceStatusActionsBarProps) {
  const { t } = useTranslation();
  const { canMarkReceived, canVerify, allVerified } = getInvoiceWorkflowActions(orders);

  if (allVerified) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-800">
        <PoStatusIcon status="Verified" className="h-3.5 w-3.5" />
        {t('purchaseOrders.invoiceFullyVerified')}
      </span>
    );
  }

  const btnClass =
    'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50';

  return (
    <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {canMarkReceived && (
        <button type="button" disabled={busy} onClick={onMarkReceived} className={btnClass}>
          <PoStatusIcon status="Received" className="h-3.5 w-3.5" />
          {t('purchaseOrders.markInvoiceReceived')}
        </button>
      )}
      {canVerify && (
        <button type="button" disabled={busy} onClick={onVerifyInvoice} className={btnClass}>
          <PoStatusIcon status="Verified" className="h-3.5 w-3.5" />
          {t('purchaseOrders.verifyInvoice')}
        </button>
      )}
      {onOpenScanner && (canMarkReceived || canVerify) && (
        <button type="button" disabled={busy} onClick={onOpenScanner} className={btnClass}>
          <svg className="h-3.5 w-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 16h4.01M8 16H4.01M8 12H4.01M8 8H4.01M12 8h4.01" />
          </svg>
          {t('purchaseOrders.scanner.openButton')}
        </button>
      )}
    </div>
  );
}
