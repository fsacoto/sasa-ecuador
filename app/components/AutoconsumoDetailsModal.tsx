'use client';

import { useMemo } from 'react';
import type { AutoconsumoNote, InventoryItem } from '../types';
import { useTranslation } from '../context/TranslationContext';
import { useDarkMode } from '../hooks/useDarkMode';
import { formatDateDMY } from '../utils/formatDate';
import ModalPortal from './ui/ModalPortal';

function resolveItemImageUrl(sku: string, inventory: InventoryItem[]): string | null {
  const trimmed = sku.trim();
  if (!trimmed) return null;
  const item = inventory.find((inv) => inv.sku === trimmed);
  const url = item?.images?.find((img) => typeof img === 'string' && img.trim());
  return url?.trim() || null;
}

function NoPhotoThumb({ label }: { label: string }) {
  return (
    <div
      className="flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-md border border-gray-200 bg-gray-100"
      title={label}
    >
      <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6" />
      </svg>
      <span className="text-[8px] font-medium uppercase leading-none tracking-wide text-gray-400">
        {label}
      </span>
    </div>
  );
}

export type AutoconsumoDetailsModalProps = {
  note: AutoconsumoNote;
  inventory?: InventoryItem[];
  onClose: () => void;
};

export default function AutoconsumoDetailsModal({
  note,
  inventory = [],
  onClose,
}: AutoconsumoDetailsModalProps) {
  const { t } = useTranslation();
  const darkMode = useDarkMode();
  const noPhotoLabel = t('invoiceTracking.noPhoto') || 'Sin foto';

  const imageBySku = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const item of note.items || []) {
      const sku = (item.sku || '').trim();
      if (!sku || sku in map) continue;
      map[sku] = resolveItemImageUrl(sku, inventory);
    }
    return map;
  }, [note.items, inventory]);

  return (
    <ModalPortal>
      <div
        className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="autoconsumo-details-title"
        onClick={onClose}
      >
        <div
          className="sasa-modal-panel max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h3 id="autoconsumo-details-title" className="text-2xl font-bold text-[#515151]">
                {note.noteNumber}
              </h3>
              <p className="mt-1 text-sm text-gray-500">{t('autoconsumo.detailsTitle')}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-2xl leading-none text-gray-400 hover:text-gray-600"
              aria-label={t('common.close') || 'Cerrar'}
            >
              ×
            </button>
          </div>

          <div className="space-y-6">
            <div className="rounded-lg bg-gray-50 p-4">
              <h4 className="mb-3 font-semibold text-gray-900">{t('autoconsumo.noteInfo')}</h4>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-gray-600">{t('autoconsumo.recipient')}:</span>
                  <span className="ml-2 font-medium">{note.recipient}</span>
                </div>
                <div>
                  <span className="text-gray-600">{t('autoconsumo.date')}:</span>
                  <span className="ml-2 font-medium">{formatDateDMY(note.date)}</span>
                </div>
                {note.createdBy ? (
                  <div>
                    <span className="text-gray-600">{t('autoconsumo.createdBy')}:</span>
                    <span className="ml-2 font-medium">{note.createdBy}</span>
                  </div>
                ) : null}
                {note.notes ? (
                  <div className="sm:col-span-2">
                    <span className="text-gray-600">{t('autoconsumo.notes')}:</span>
                    <span className="ml-2 font-medium">{note.notes}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div>
              <h4 className="mb-3 font-semibold text-gray-900">{t('autoconsumo.items')}</h4>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('invoiceTracking.photo') || 'Foto'}
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('invoiceTracking.sku')}
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('invoiceTracking.description')}
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('invoiceTracking.qty')}
                      </th>
                      <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('autoconsumo.unitCost')}
                      </th>
                      <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('autoconsumo.lineCost')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(note.items || []).map((item, index) => {
                      const sku = (item.sku || '').trim();
                      const imageUrl = sku ? imageBySku[sku] : null;
                      return (
                        <tr key={`${sku}-${index}`} className="transition-colors hover:bg-gray-50">
                          <td className="px-3 py-2.5">
                            {imageUrl ? (
                              <div className="h-12 w-12 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                                <img
                                  src={imageUrl}
                                  alt={item.description || sku}
                                  className="h-full w-full object-contain object-center"
                                />
                              </div>
                            ) : (
                              <NoPhotoThumb label={noPhotoLabel} />
                            )}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-gray-900">{item.sku}</td>
                          <td className="px-3 py-3 text-gray-700">{item.description}</td>
                          <td className="px-3 py-3 text-center tabular-nums text-gray-700">
                            {item.quantity}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                            {item.unitCost != null ? `$${Number(item.unitCost).toFixed(2)}` : '—'}
                          </td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums text-gray-900">
                            ${Number(item.lineCost || 0).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end rounded-lg bg-gray-50 px-4 py-3">
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-gray-500">
                  {t('autoconsumo.totalExpense')}
                </div>
                <div className="text-xl font-bold tabular-nums text-gray-900">
                  ${Number(note.totalCost || 0).toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
