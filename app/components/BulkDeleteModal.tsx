'use client';

import { useMemo, useState } from 'react';
import { PurchaseOrder, Supplier } from '../types';
import ConfirmDialog from './ui/ConfirmDialog';
import { useTranslation } from '../context/TranslationContext';
import { effectivePurchaseOrderStatus } from '../utils/purchaseOrderStatusTheme';
import { statusLabelKey } from '../utils/purchaseOrderStatusFlow';
import { formatPONumber } from '../utils/purchaseOrderFormat';

const PREVIEW_LINE_LIMIT = 4;

interface BulkDeleteModalProps {
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  onClose: () => void;
  onBulkDelete: (invoiceNumbers: string[]) => void | Promise<void>;
}

function formatStatusLabel(
  status: string,
  t: (key: string) => string
): string {
  const normalized = effectivePurchaseOrderStatus(status);
  const key = `purchaseOrders.${statusLabelKey(normalized)}`;
  const label = t(key);
  return label === key ? normalized : label;
}

export default function BulkDeleteModal({
  purchaseOrders,
  suppliers,
  onClose,
  onBulkDelete,
}: BulkDeleteModalProps) {
  const { t } = useTranslation();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingInvoices, setPendingInvoices] = useState<string[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());

  const supplierNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of suppliers) {
      map.set(s.id, s.name);
    }
    return map;
  }, [suppliers]);

  const supplierOptions = useMemo(() => {
    const ids = new Set(purchaseOrders.map((o) => o.supplierId).filter(Boolean));
    return [...ids].sort((a, b) =>
      (supplierNameById.get(a) ?? a).localeCompare(supplierNameById.get(b) ?? '')
    );
  }, [purchaseOrders, supplierNameById]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const order of purchaseOrders) {
      set.add(effectivePurchaseOrderStatus(order.status));
    }
    return [...set].sort();
  }, [purchaseOrders]);

  const filteredOrders = useMemo(
    () =>
      purchaseOrders.filter((order) => {
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          !q ||
          order.invoice.toLowerCase().includes(q) ||
          order.description.toLowerCase().includes(q) ||
          (order.sku || '').toLowerCase().includes(q);
        const matchesSupplier =
          filterSupplier === 'all' || order.supplierId === filterSupplier;
        const matchesStatus =
          filterStatus === 'all' ||
          effectivePurchaseOrderStatus(order.status) === filterStatus;
        return matchesSearch && matchesSupplier && matchesStatus;
      }),
    [purchaseOrders, searchQuery, filterSupplier, filterStatus]
  );

  const ordersByInvoice = useMemo(() => {
    const acc: Record<string, PurchaseOrder[]> = {};
    for (const order of filteredOrders) {
      if (!acc[order.invoice]) acc[order.invoice] = [];
      acc[order.invoice].push(order);
    }
    return acc;
  }, [filteredOrders]);

  const invoiceKeys = useMemo(
    () => Object.keys(ordersByInvoice).sort((a, b) => a.localeCompare(b)),
    [ordersByInvoice]
  );

  const toggleExpanded = (invoice: string) => {
    setExpandedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(invoice)) next.delete(invoice);
      else next.add(invoice);
      return next;
    });
  };

  const handleInvoiceToggle = (invoice: string) => {
    setSelectedInvoices((prev) =>
      prev.includes(invoice) ? prev.filter((inv) => inv !== invoice) : [...prev, invoice]
    );
  };

  const handleSelectAll = () => {
    setSelectedInvoices(invoiceKeys);
  };

  const handleSelectNone = () => {
    setSelectedInvoices([]);
  };

  const handleDelete = () => {
    if (selectedInvoices.length === 0) {
      alert(t('purchaseOrders.bulkDelete.selectOneAlert'));
      return;
    }
    setPendingInvoices(selectedInvoices);
    setDeleteConfirmOpen(true);
  };

  const deleteConfirmDescription = useMemo(() => {
    if (pendingInvoices.length === 0) return '';
    const totalOrders = pendingInvoices.reduce(
      (total, inv) => total + (ordersByInvoice[inv]?.length ?? 0),
      0
    );
    const invoiceCount = pendingInvoices.length;
    const invoicePhrase =
      invoiceCount === 1
        ? t('common.bulkDeleteWarningInvoiceOne')
        : t('common.bulkDeleteWarningInvoiceMany').replace('{count}', String(invoiceCount));
    return t('common.bulkDeleteWarning')
      .replace('{totalOrders}', String(totalOrders))
      .replace('{invoicePhrase}', invoicePhrase);
  }, [pendingInvoices, ordersByInvoice, t]);

  const ordersCountLabel = (count: number) =>
    count === 1
      ? t('purchaseOrders.bulkDelete.ordersCountOne')
      : t('purchaseOrders.bulkDelete.ordersCount').replace('{count}', String(count));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 p-0 backdrop-blur-sm animate-in fade-in duration-200 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl animate-in slide-in-from-bottom duration-300 sm:max-w-6xl sm:rounded-2xl sm:slide-in-from-bottom-0">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {t('purchaseOrders.bulkDelete.title')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-600"
            aria-label={t('common.close')}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[calc(90vh-8rem)] space-y-4 overflow-y-auto p-6">
          <div className="space-y-3 rounded-lg bg-gray-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder={t('purchaseOrders.bulkDelete.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="w-full sm:w-48">
                <select
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="all">{t('purchaseOrders.allSuppliers')}</option>
                  {supplierOptions.map((supplierId) => (
                    <option key={supplierId} value={supplierId}>
                      {supplierNameById.get(supplierId) ?? t('purchaseOrders.unknownSupplier')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-full sm:w-40">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="all">{t('purchaseOrders.allStatus')}</option>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {formatStatusLabel(status, t)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="rounded bg-gray-200 px-3 py-1 text-sm text-gray-700 transition-colors hover:bg-gray-300"
              >
                {t('purchaseOrders.selectAll')}
              </button>
              <button
                type="button"
                onClick={handleSelectNone}
                className="rounded bg-gray-200 px-3 py-1 text-sm text-gray-700 transition-colors hover:bg-gray-300"
              >
                {t('purchaseOrders.selectNone')}
              </button>
              <span className="text-sm text-gray-600">
                {t('purchaseOrders.bulkDelete.selectionCount')
                  .replace('{selected}', String(selectedInvoices.length))
                  .replace('{total}', String(invoiceKeys.length))}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {invoiceKeys.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                {t('purchaseOrders.bulkDelete.noResults')}
              </div>
            ) : (
              invoiceKeys.map((invoice) => {
                const orders = ordersByInvoice[invoice];
                const total = orders.reduce(
                  (sum, order) => sum + (order.totalCostWithDiscount ?? 0),
                  0
                );
                const currency = orders[0]?.currency || 'USD';
                const expanded = expandedInvoices.has(invoice);
                const previewOrders = expanded
                  ? orders
                  : orders.slice(0, PREVIEW_LINE_LIMIT);
                const hiddenCount = Math.max(0, orders.length - PREVIEW_LINE_LIMIT);

                return (
                  <div key={invoice} className="overflow-hidden rounded-lg border border-gray-200">
                    <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedInvoices.includes(invoice)}
                          onChange={() => handleInvoiceToggle(invoice)}
                          className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span className="font-semibold text-gray-900">
                              {t('purchaseOrders.bulkDelete.invoiceLabel')}: {invoice}
                            </span>
                            <span className="text-sm text-gray-500">
                              {formatPONumber(invoice)}
                            </span>
                            <span className="text-sm text-gray-600">{ordersCountLabel(orders.length)}</span>
                            <span className="text-sm font-medium text-gray-700">
                              {t('purchaseOrders.bulkDelete.totalLabel')}:{' '}
                              {total.toLocaleString('es-EC', {
                                style: 'currency',
                                currency,
                              })}
                            </span>
                          </div>
                        </div>
                      </label>
                    </div>

                    <div className="px-4 py-2">
                      <div className="mb-1 hidden gap-4 border-b border-gray-100 pb-1 text-xs font-medium uppercase tracking-wide text-gray-400 sm:flex">
                        <span className="min-w-0 flex-1">{t('common.description')}</span>
                        <span className="w-16 text-right">{t('common.quantity')}</span>
                        <span className="w-24 text-right">{t('purchaseOrders.bulkDelete.skuColumn')}</span>
                        <span className="w-24">{t('purchaseOrders.bulkDelete.statusColumn')}</span>
                      </div>
                      <ul className="divide-y divide-gray-100">
                        {previewOrders.map((order) => (
                          <li
                            key={order.id}
                            className="flex flex-wrap items-center gap-x-4 gap-y-0.5 py-2 text-sm text-gray-600 sm:flex-nowrap"
                          >
                            <span className="min-w-0 flex-1 truncate font-medium text-gray-800">
                              {order.description || '—'}
                            </span>
                            <span className="w-16 shrink-0 text-right tabular-nums">
                              {t('purchaseOrders.bulkDelete.quantityUnits').replace(
                                '{count}',
                                String(order.quantity ?? 0)
                              )}
                            </span>
                            <span className="w-24 shrink-0 truncate font-mono text-xs text-gray-500">
                              {order.sku || '—'}
                            </span>
                            <span className="w-24 shrink-0 text-xs">
                              {formatStatusLabel(order.status, t)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {hiddenCount > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(invoice)}
                          className="mt-2 text-sm font-medium text-[#515151] hover:underline"
                        >
                          {expanded
                            ? t('purchaseOrders.bulkDelete.previewLess')
                            : t('purchaseOrders.bulkDelete.previewMore').replace(
                                '{count}',
                                String(hiddenCount)
                              )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="sticky bottom-0 flex gap-3 border-t border-gray-100 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-300 px-6 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={selectedInvoices.length === 0}
            className="sasa-btn-primary flex-1 rounded-xl px-6 py-2.5 font-medium shadow-sm transition-all hover:shadow active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {selectedInvoices.length === 1
              ? t('purchaseOrders.bulkDelete.deleteInvoiceOne')
              : t('purchaseOrders.bulkDelete.deleteInvoices').replace(
                  '{count}',
                  String(selectedInvoices.length)
                )}
          </button>
        </div>
      </div>

      {pendingInvoices.length > 0 && (
        <ConfirmDialog
          open={deleteConfirmOpen}
          title={t('purchaseOrders.bulkDelete.confirmTitle')}
          description={deleteConfirmDescription}
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          confirmVariant="default"
          onConfirm={async () => {
            const invoices = [...pendingInvoices];
            setDeleteConfirmOpen(false);
            setPendingInvoices([]);
            onClose();
            await onBulkDelete(invoices);
          }}
          onCancel={() => {
            setDeleteConfirmOpen(false);
            setPendingInvoices([]);
          }}
        />
      )}
    </div>
  );
}
