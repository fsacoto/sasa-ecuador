'use client';

import { useEffect, useState } from 'react';
import POModalShell from './ui/POModalShell';
import { PurchaseOrder, Supplier } from '../types';
import { useTranslation } from '../context/TranslationContext';
import { useDarkMode } from '../hooks/useDarkMode';
import { getScanProgress } from '../utils/purchaseOrderBarcodeScan';

interface POScanLinePickerModalProps {
  scannedCode: string;
  candidates: PurchaseOrder[];
  suppliers: Supplier[];
  onSelect: (order: PurchaseOrder) => void;
  onCancel: () => void;
}

export default function POScanLinePickerModal({
  scannedCode,
  candidates,
  suppliers,
  onSelect,
  onCancel,
}: POScanLinePickerModalProps) {
  const { t } = useTranslation();
  const darkMode = useDarkMode();
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    setHighlight(0);
  }, [candidates]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
      if (e.key === 'Enter' && candidates[highlight]) {
        e.preventDefault();
        onSelect(candidates[highlight]);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, candidates.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [candidates, highlight, onCancel, onSelect]);

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? '—';

  const rowActiveClass = darkMode ? 'bg-white/10' : 'bg-gray-100';
  const rowHoverClass = darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-50';

  return (
    <POModalShell
      title={t('purchaseOrders.scanner.pickLineTitle')}
      titleId="po-scan-picker-title"
      maxWidthClass="max-w-lg"
      panelMaxHeightClass="max-h-[85vh]"
      panelClassName="flex flex-col"
      zIndexClass="z-[210]"
      onClose={onCancel}
      headerExtra={
        <>
          <p className="mt-1 text-sm text-gray-600">{t('purchaseOrders.scanner.pickLineDesc')}</p>
          <p className="mt-2 font-mono text-xs text-gray-500">{scannedCode}</p>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-gray-100">
          {candidates.map((order, idx) => {
            const prog = getScanProgress(order);
            const active = idx === highlight;
            return (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => onSelect(order)}
                  onMouseEnter={() => setHighlight(idx)}
                  className={`w-full px-5 py-3 text-left transition-colors ${
                    active ? rowActiveClass : rowHoverClass
                  }`}
                >
                  <div className="font-medium text-gray-900">{order.description}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-600">
                    <span className="font-mono">{order.sku}</span>
                    <span>
                      {t('purchaseOrders.scanner.supplierSku')}: {order.supplierSKU || '—'}
                    </span>
                    <span>{supplierName(order.supplierId)}</span>
                    <span>
                      {t('purchaseOrders.scanner.pending')}: {prog.scanned}/{prog.expected}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              darkMode
                ? 'bg-white/10 text-gray-200 hover:bg-white/15'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={!candidates[highlight]}
            onClick={() => candidates[highlight] && onSelect(candidates[highlight])}
            className="rounded-lg bg-[#515151] px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {t('purchaseOrders.scanner.pickLineConfirm')}
          </button>
        </div>
      </div>
    </POModalShell>
  );
}
