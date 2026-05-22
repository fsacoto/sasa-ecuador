'use client';

import { useMemo, useState } from 'react';
import { PurchaseOrder, PurchaseOrderStatus, Supplier } from '../types';
import ConfirmDialog from './ui/ConfirmDialog';
import { useTranslation } from '../context/TranslationContext';
import { getNextStatus, statusLabelKey } from '../utils/purchaseOrderStatusFlow';
import { effectivePurchaseOrderStatus, orderMatchesStatusFilter } from '../utils/purchaseOrderStatusTheme';
import PoStatusIcon from './icons/PoStatusIcon';
import { IconPoChevronRight } from './icons/PoLineIcons';

interface BulkStatusChangeModalProps {
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  onClose: () => void;
  onBulkAdvance: (orderIds: string[]) => void | Promise<void>;
}

export default function BulkStatusChangeModal({
  purchaseOrders,
  suppliers,
  onClose,
  onBulkAdvance,
}: BulkStatusChangeModalProps) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id;

  const filteredOrders = purchaseOrders.filter((order) => {
    const matchesSearch =
      order.invoice.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSupplier = filterSupplier === 'all' || order.supplierId === filterSupplier;
    const matchesStatus = orderMatchesStatusFilter(order, filterStatus);
    return matchesSearch && matchesSupplier && matchesStatus;
  });

  const ordersByInvoice = filteredOrders.reduce(
    (acc, order) => {
      if (!acc[order.invoice]) acc[order.invoice] = [];
      acc[order.invoice].push(order);
      return acc;
    },
    {} as Record<string, PurchaseOrder[]>
  );

  const supplierIds = [...new Set(purchaseOrders.map((o) => o.supplierId).filter(Boolean))];
  const statuses = [...new Set(purchaseOrders.map((o) => effectivePurchaseOrderStatus(o.status)))];

  const advancePreview = useMemo(() => {
    const ids: string[] = [];
    selectedInvoices.forEach((invoice) => {
      (ordersByInvoice[invoice] ?? []).forEach((order) => {
        const next = getNextStatus(order.status);
        if (next && next !== 'Verified') ids.push(order.id);
      });
    });
    return ids;
  }, [selectedInvoices, ordersByInvoice]);

  const handleInvoiceToggle = (invoice: string) => {
    setSelectedInvoices((prev) =>
      prev.includes(invoice) ? prev.filter((inv) => inv !== invoice) : [...prev, invoice]
    );
  };

  const handleSelectAll = () => setSelectedInvoices(Object.keys(ordersByInvoice));
  const handleSelectNone = () => setSelectedInvoices([]);

  const handleConfirm = () => {
    onBulkAdvance(advancePreview);
    setConfirmOpen(false);
    onClose();
  };

  const statusLabel = (status: PurchaseOrderStatus | string) =>
    t(`purchaseOrders.${statusLabelKey(effectivePurchaseOrderStatus(status))}`);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl">
          <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">{t('purchaseOrders.bulkStatusChange')}</h3>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="max-h-[calc(90vh-8rem)] space-y-4 overflow-y-auto p-6">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-800">{t('purchaseOrders.bulkAdvanceTitle')}</p>
              <p className="mt-1 text-xs text-gray-600">{t('purchaseOrders.bulkAdvanceDesc')}</p>
            </div>

            <div className="space-y-3 rounded-lg bg-gray-50 p-4">
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder={t('purchaseOrders.searchInvoices')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#515151]"
                />
                <select
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  className="w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="all">{t('purchaseOrders.allSuppliers')}</option>
                  {supplierIds.map((id) => (
                    <option key={id} value={id}>
                      {supplierName(id)}
                    </option>
                  ))}
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="all">{t('purchaseOrders.allStatus')}</option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="rounded-lg border border-[#515151] px-3 py-1.5 text-sm text-[#515151] hover:bg-[#515151] hover:text-white"
                >
                  {t('purchaseOrders.selectAll')}
                </button>
                <button
                  type="button"
                  onClick={handleSelectNone}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200"
                >
                  {t('purchaseOrders.selectNone')}
                </button>
                <div className="flex flex-1 items-center justify-end text-sm text-gray-600">
                  {t('purchaseOrders.selected')}: <span className="ml-1 font-semibold">{selectedInvoices.length}</span>{' '}
                  {t('purchaseOrders.invoices')} ({advancePreview.length} {t('purchaseOrders.orders')})
                </div>
              </div>
            </div>

            <div className="max-h-96 space-y-2 overflow-y-auto">
              {Object.keys(ordersByInvoice).length === 0 ? (
                <div className="py-8 text-center text-gray-500">{t('purchaseOrders.noInvoicesFound')}</div>
              ) : (
                Object.entries(ordersByInvoice).map(([invoice, orders]) => {
                  const advanceCount = orders.filter((o) => {
                    const n = getNextStatus(o.status);
                    return n && n !== 'Verified';
                  }).length;
                  return (
                    <div
                      key={invoice}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && handleInvoiceToggle(invoice)}
                      onClick={() => handleInvoiceToggle(invoice)}
                      className={`cursor-pointer rounded-lg border p-4 transition-all ${
                        selectedInvoices.includes(invoice)
                          ? 'border-[#515151] bg-[#515151]/5'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedInvoices.includes(invoice)}
                          onChange={() => handleInvoiceToggle(invoice)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-[#515151]"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-gray-900">{invoice}</h4>
                            <span className="text-xs text-gray-500">
                              {advanceCount > 0
                                ? `${advanceCount} ${t('purchaseOrders.willAdvance')}`
                                : t('purchaseOrders.noAdvanceForInvoice')}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1">
                            {orders.slice(0, 3).map((order) => {
                              const next = getNextStatus(order.status);
                              return (
                                <div key={order.id} className="flex items-center gap-2 text-sm text-gray-600">
                                  <span className="truncate">{order.description}</span>
                                  <span className="text-gray-400">·</span>
                                  <PoStatusIcon status={order.status} className="h-3.5 w-3.5 shrink-0" />
                                  <span>{statusLabel(order.status)}</span>
                                  {next && next !== 'Verified' && (
                                    <>
                                      <IconPoChevronRight className="h-3 w-3 text-gray-400" />
                                      <PoStatusIcon status={next} className="h-3.5 w-3.5 shrink-0" />
                                      <span className="text-gray-500">{statusLabel(next)}</span>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 hover:bg-gray-200"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedInvoices.length === 0) {
                  alert(t('purchaseOrders.selectAtLeastOneInvoice'));
                  return;
                }
                if (advancePreview.length === 0) {
                  alert(t('purchaseOrders.bulkNothingToAdvance'));
                  return;
                }
                setConfirmOpen(true);
              }}
              disabled={selectedInvoices.length === 0 || advancePreview.length === 0}
              className="rounded-lg bg-[#515151] px-4 py-2 font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('purchaseOrders.bulkAdvanceConfirmButton')}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t('purchaseOrders.confirmBulkStatusChange')}
        description={(t('purchaseOrders.bulkAdvanceConfirmDesc') || 'Avanzar {count} orden(es)?').replace(
          '{count}',
          String(advancePreview.length)
        )}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
