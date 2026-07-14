'use client';

import { useMemo } from 'react';
import { SalesInvoice } from '../types';
import { useInventory } from '../context/InventoryContext';
import { useTranslation } from '../context/TranslationContext';
import { useDarkMode } from '../hooks/useDarkMode';
import ModalPortal from './ui/ModalPortal';
import {
  buildDeleteReturnItems,
  deleteSalesInvoiceWithStockRevert,
  type InvoiceDeleteReturnItem,
} from '../utils/salesInvoiceDelete';

export type SalesInvoiceDeleteModalProps = {
  open: boolean;
  invoice: SalesInvoice | null;
  onClose: () => void;
  onDeleted: () => void;
  onError: (message: string) => void;
};

export default function SalesInvoiceDeleteModal({
  open,
  invoice,
  onClose,
  onDeleted,
  onError,
}: SalesInvoiceDeleteModalProps) {
  const { inventory, updateInventoryItem } = useInventory();
  const { t } = useTranslation();
  const darkMode = useDarkMode();

  const itemsReturningToStock = useMemo((): InvoiceDeleteReturnItem[] => {
    if (!invoice) return [];
    return buildDeleteReturnItems(invoice, inventory);
  }, [invoice, inventory]);

  if (!open || !invoice) return null;

  const runDelete = async (revertInventory: boolean) => {
    const inv = invoice;
    const items = revertInventory ? [...itemsReturningToStock] : [];
    onClose();
    try {
      await deleteSalesInvoiceWithStockRevert(inv, items, revertInventory, inventory, updateInventoryItem);
      onDeleted();
    } catch (error) {
      console.error('Error deleting invoice:', error);
      onError(t('invoiceTracking.errorDeletingInvoice'));
    }
  };

  return (
    <ModalPortal>
      <div
        className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm`}
        role="dialog"
        aria-modal="true"
        onClick={onClose}
      >
        <div
          className="sasa-modal-panel w-full max-w-2xl overflow-hidden rounded-2xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-gray-200 px-6 py-5">
            <h3 className="text-xl font-semibold text-gray-900">{t('invoiceTracking.deleteInvoice')}</h3>
            <p className="mt-2 text-sm text-gray-500">{t('invoiceTracking.deleteInvoiceOptions')}</p>
          </div>

          <div className="max-h-[min(70vh,520px)] overflow-y-auto space-y-4 px-6 py-5">
            {itemsReturningToStock.length > 0 ? (
              <div className="sasa-delete-preview rounded-xl border border-gray-200 p-4">
                <h4 className="mb-1 font-semibold text-gray-900">{t('invoiceTracking.itemsReturningToStock')}</h4>
                <p className="mb-3 text-sm text-gray-500">
                  {invoice.sourceConsignmentFirestoreId
                    ? t('invoiceTracking.deleteConsignmentItemsMessage')
                    : t('invoiceTracking.itemsReturningToStockMessage')}
                </p>
                <div className="space-y-2">
                  {itemsReturningToStock.map((item, index) => (
                    <div
                      key={`${item.sku}-${index}`}
                      className="sasa-delete-preview-row flex flex-col gap-2 rounded-lg border border-gray-200 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900">{item.description}</div>
                        <div className="text-sm text-gray-500">
                          {t('invoiceTracking.quantityReturning')}: {item.quantity} {t('invoiceTracking.units')}
                        </div>
                      </div>
                      <div className="shrink-0 text-left sm:text-right">
                        <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                          {item.kind === 'consignment'
                            ? t('invoiceTracking.consignmentStockLabel')
                            : t('invoiceTracking.ecuadorStock')}
                        </div>
                        <div className="font-semibold tabular-nums text-gray-900">
                          {item.currentStock} <span className="font-normal text-gray-400">→</span> {item.newStock}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-500">
                {t('invoiceTracking.deleteNoStockToReturn')}
              </p>
            )}

            <div className="space-y-3">
              {itemsReturningToStock.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => void runDelete(true)}
                    className="sasa-delete-option sasa-delete-option--primary w-full rounded-xl px-4 py-3 text-left transition-colors"
                  >
                    <div className="font-semibold text-gray-900">{t('invoiceTracking.reverseAndReturn')}</div>
                    <div className="mt-1 text-sm text-gray-500">
                      {t('invoiceTracking.reverseAndReturnDescription')}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void runDelete(false)}
                    className="sasa-delete-option w-full rounded-xl px-4 py-3 text-left transition-colors"
                  >
                    <div className="font-semibold text-gray-900">{t('invoiceTracking.cancelWithoutAffecting')}</div>
                    <div className="mt-1 text-sm text-gray-500">
                      {t('invoiceTracking.cancelWithoutAffectingDescription')}
                    </div>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void runDelete(false)}
                  className="sasa-delete-option sasa-delete-option--primary w-full rounded-xl px-4 py-3 text-left transition-colors"
                >
                  <div className="font-semibold text-gray-900">{t('invoiceTracking.deleteInvoiceOnly')}</div>
                  <div className="mt-1 text-sm text-gray-500">
                    {t('invoiceTracking.deleteInvoiceOnlyDescription')}
                  </div>
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-gray-200 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className={`w-full rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                darkMode
                  ? 'border-white/20 bg-transparent text-gray-200 hover:bg-white/10'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {t('invoiceTracking.cancel')}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
