'use client';

import { useState, useRef, useEffect } from 'react';
import { PurchaseOrder, PurchaseOrderStatus } from '../types';
import { useTranslation } from '../context/TranslationContext';
import { getNextStatus, statusLabelKey } from '../utils/purchaseOrderStatusFlow';
import { getScanProgress, isLineReadyToConfirm } from '../utils/purchaseOrderBarcodeScan';
import {
  PO_ACTIVE_STATUSES,
  PO_STATUS_BADGE_CLASS,
  effectivePurchaseOrderStatus,
} from '../utils/purchaseOrderStatusTheme';
import PoStatusIcon from './icons/PoStatusIcon';
import { IconPoChevronRight, IconPoDots, IconPoLock } from './icons/PoLineIcons';

interface PurchaseOrderStatusCellProps {
  order: PurchaseOrder;
  onStatusChange: (order: PurchaseOrder, newStatus: PurchaseOrderStatus) => void;
  onAdvance?: (order: PurchaseOrder) => void;
  onEditVerification?: (order: PurchaseOrder) => void;
  compact?: boolean;
}

export default function PurchaseOrderStatusCell({
  order,
  onStatusChange,
  onAdvance,
  onEditVerification,
  compact = false,
}: PurchaseOrderStatusCellProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const status = effectivePurchaseOrderStatus(order.status);
  const nextStatus = getNextStatus(status);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const label = t(`purchaseOrders.${statusLabelKey(status)}`);
  const scanProg = status === 'Received' ? getScanProgress(order) : null;
  const scanBadge =
    scanProg && scanProg.scanned > 0
      ? isLineReadyToConfirm(order)
        ? t('purchaseOrders.scanBadgeReady')
            .replace('{scanned}', String(scanProg.scanned))
            .replace('{expected}', String(scanProg.expected))
        : t('purchaseOrders.scanBadgePartial')
            .replace('{scanned}', String(scanProg.scanned))
            .replace('{expected}', String(scanProg.expected))
      : null;

  const advanceLabel =
    nextStatus === 'Received'
      ? t('purchaseOrders.advanceReceived')
      : nextStatus === 'Verified'
        ? t('purchaseOrders.advanceVerify')
        : null;

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex min-w-0 flex-col items-start gap-0.5">
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${PO_STATUS_BADGE_CLASS[status]}`}
          title={status === 'Verified' ? t('purchaseOrders.inventoryUpdated') : undefined}
        >
          <PoStatusIcon status={status} className="h-3.5 w-3.5 shrink-0" />
          {label}
          {status === 'Verified' && <IconPoLock className="h-3 w-3 text-green-700/60" />}
        </span>
        {scanBadge && (
          <span
            className={`text-[10px] font-semibold leading-tight ${
              isLineReadyToConfirm(order) ? 'text-amber-700' : 'text-indigo-600'
            }`}
          >
            {scanBadge}
          </span>
        )}
        {status === 'Verified' && order.supplierClaimStatus === 'pending' && (
          <span className="text-[10px] font-semibold text-red-600">{t('purchaseOrders.claimPendingBadge')}</span>
        )}
      </div>

      {nextStatus && onAdvance && (
        <button
          type="button"
          onClick={() => onAdvance(order)}
          className="inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          title={advanceLabel ?? ''}
        >
          {!compact && <span className="max-w-[5rem] truncate sm:max-w-none">{advanceLabel}</span>}
          <IconPoChevronRight className="h-3 w-3 shrink-0 text-gray-500" />
        </button>
      )}

      {status === 'Verified' && onEditVerification && (
        <button
          type="button"
          onClick={() => onEditVerification(order)}
          className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          {t('purchaseOrders.editVerificationShort')}
        </button>
      )}

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded-md p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label={t('purchaseOrders.changeStatus')}
        >
          <IconPoDots className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 z-30 mt-1 min-w-[10rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {PO_ACTIVE_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={s === status}
                onClick={() => {
                  setMenuOpen(false);
                  onStatusChange(order, s);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                <PoStatusIcon status={s} className="h-3.5 w-3.5" />
                {t(`purchaseOrders.${statusLabelKey(s)}`)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
