'use client';

import { useMemo } from 'react';
import POModalShell from './ui/POModalShell';
import { useTranslation } from '../context/TranslationContext';
import { listBulkImportGroups } from '../utils/bulkImportSystem';
import type { PurchaseOrder } from '../types';

interface BulkImportEditPickerModalProps {
  purchaseOrders: PurchaseOrder[];
  onClose: () => void;
  onSelect: (groupId: string) => void;
}

function formatWhen(date: Date): string {
  try {
    return date.toLocaleString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function BulkImportEditPickerModal({
  purchaseOrders,
  onClose,
  onSelect,
}: BulkImportEditPickerModalProps) {
  const { t } = useTranslation();
  const items = useMemo(() => listBulkImportGroups(purchaseOrders), [purchaseOrders]);

  return (
    <POModalShell
      title={t('bulkImport.editPickerTitle')}
      titleId="bulk-import-edit-picker-title"
      maxWidthClass="max-w-md"
      zIndexClass="z-[60]"
      onClose={onClose}
      headerExtra={
        <p className="mt-1 text-sm text-gray-500">{t('bulkImport.editPickerSubtitle')}</p>
      }
    >
      <div className="max-h-[min(24rem,50vh)] overflow-y-auto p-4">
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">{t('bulkImport.editPickerEmpty')}</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="sasa-modal-row w-full px-4 py-3 text-left text-sm transition-colors"
                  onClick={() => onSelect(item.id)}
                >
                  <div className="truncate font-medium text-gray-900">{item.label}</div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {item.invoice}
                    {' · '}
                    {t('bulkImport.sessionPickerRows').replace('{count}', String(item.rowCount))}
                    {' · '}
                    {formatWhen(item.importedAt)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-gray-200 px-4 py-4">
        <button
          type="button"
          className="w-full rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          onClick={onClose}
        >
          {t('common.cancel')}
        </button>
      </div>
    </POModalShell>
  );
}
