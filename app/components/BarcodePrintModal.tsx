'use client';

import { useState, useMemo, type ReactNode } from 'react';
import { PurchaseOrder, InventoryItem } from '../types';
import { useTranslation } from '../context/TranslationContext';
import POModalShell from './ui/POModalShell';
import {
  buildPrintRowsByInvoice,
  buildAllPrintRows,
  buildInventoryForPdfLabel,
  labelCountForFullPrint,
  type BarcodePrintRow,
} from '../utils/barcodePrint';

interface BarcodePrintModalProps {
  purchaseOrders: PurchaseOrder[];
  inventory: InventoryItem[];
  onClose: () => void;
  onPrint: (
    items: Array<{ order: PurchaseOrder | null; inventoryItem: InventoryItem; quantity: number }>,
    printMode: 'full' | 'one-per-item' | 'single'
  ) => void;
}

type GroupingMode = 'invoice' | 'item';
type PrintMode = 'full' | 'one-per-item' | 'single';

type RadioOption<T extends string> = {
  value: T;
  label: string;
  hint?: string;
};

function RadioOptionGroup<T extends string>({
  title,
  name,
  value,
  onChange,
  options,
}: {
  title: string;
  name: string;
  value: T;
  onChange: (next: T) => void;
  options: RadioOption<T>[];
}) {
  return (
    <div className="sasa-modal-section p-4">
      <p className="mb-3 text-sm font-semibold text-gray-900">{title}</p>
      <div className="space-y-1.5" role="radiogroup" aria-label={title}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <label
              key={opt.value}
              className={`sasa-modal-row flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                selected
                  ? 'border-[#515151] bg-[#515151]/5 ring-1 ring-[#515151]/25'
                  : 'border-transparent hover:border-gray-200'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={selected}
                onChange={() => onChange(opt.value)}
                className="mt-0.5 h-4 w-4 shrink-0 border-gray-300 text-[#515151] focus:ring-[#515151]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900">{opt.label}</span>
                {opt.hint ? <span className="mt-0.5 block text-xs text-gray-500">{opt.hint}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function SelectionMeta({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-gray-600">
      {children}
    </p>
  );
}

export default function BarcodePrintModal({
  purchaseOrders,
  inventory,
  onClose,
  onPrint,
}: BarcodePrintModalProps) {
  const { t } = useTranslation();
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('invoice');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>('full');
  const [searchQuery, setSearchQuery] = useState('');

  const itemsByInvoice = useMemo(
    () => buildPrintRowsByInvoice(purchaseOrders, inventory),
    [purchaseOrders, inventory]
  );

  const allPrintRows = useMemo(
    () => buildAllPrintRows(purchaseOrders, inventory),
    [purchaseOrders, inventory]
  );

  const invoices = useMemo(() => {
    const allInvoices = [...new Set(purchaseOrders.map((order) => order.invoice))];
    return allInvoices.sort();
  }, [purchaseOrders]);

  const filteredInvoices = useMemo(() => {
    if (!searchQuery.trim()) {
      return invoices;
    }
    const query = searchQuery.toLowerCase();
    return invoices.filter((invoice) => {
      if (invoice.toLowerCase().includes(query)) {
        return true;
      }
      const data = itemsByInvoice[invoice];
      if (!data) return false;
      if (
        data.rows.some(
          (r) =>
            r.order.description?.toLowerCase().includes(query) ||
            r.order.sku?.toLowerCase().includes(query)
        )
      ) {
        return true;
      }
      return data.orders.some(
        (o) =>
          o.description?.toLowerCase().includes(query) || o.sku?.toLowerCase().includes(query)
      );
    });
  }, [invoices, itemsByInvoice, searchQuery]);

  const filteredPrintRows = useMemo(() => {
    if (!searchQuery.trim()) {
      return allPrintRows;
    }
    const query = searchQuery.toLowerCase();
    return allPrintRows.filter(
      (r) =>
        r.order.invoice?.toLowerCase().includes(query) ||
        r.order.description?.toLowerCase().includes(query) ||
        r.order.sku?.toLowerCase().includes(query) ||
        r.order.category?.toLowerCase().includes(query) ||
        r.order.line?.toLowerCase().includes(query)
    );
  }, [allPrintRows, searchQuery]);

  const handleOrderToggle = (orderId: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  const handleInvoiceSelect = (invoice: string) => {
    setSelectedInvoice((prev) => (prev === invoice ? null : invoice));
  };

  const handleSelectAll = () => {
    if (groupingMode === 'invoice') {
      if (!selectedInvoice && filteredInvoices.length > 0) {
        setSelectedInvoice(filteredInvoices[0]);
      }
    } else {
      setSelectedOrderIds(filteredPrintRows.map((r) => r.order.id));
    }
  };

  const handleSelectNone = () => {
    if (groupingMode === 'invoice') {
      setSelectedInvoice(null);
    } else {
      setSelectedOrderIds([]);
    }
  };

  const appendLabelsForRow = (
    row: BarcodePrintRow,
    itemsToPrint: Array<{
      order: PurchaseOrder | null;
      inventoryItem: InventoryItem;
      quantity: number;
    }>
  ) => {
    const invPdf = buildInventoryForPdfLabel(row);
    const relatedOrder = row.order;

    if (printMode === 'full') {
      const n = labelCountForFullPrint(row.order, row.inventoryItem);
      for (let i = 0; i < n; i++) {
        itemsToPrint.push({ order: relatedOrder, inventoryItem: invPdf, quantity: 1 });
      }
    } else if (printMode === 'one-per-item') {
      itemsToPrint.push({ order: relatedOrder, inventoryItem: invPdf, quantity: 1 });
    } else if (printMode === 'single') {
      if (itemsToPrint.length === 0) {
        itemsToPrint.push({ order: relatedOrder, inventoryItem: invPdf, quantity: 1 });
      }
    }
  };

  const handlePrint = () => {
    const itemsToPrint: Array<{
      order: PurchaseOrder | null;
      inventoryItem: InventoryItem;
      quantity: number;
    }> = [];

    if (groupingMode === 'invoice') {
      if (!selectedInvoice) {
        alert(t('purchaseOrders.selectOneInvoice') || 'Please select one invoice to print.');
        return;
      }

      const invoiceData = itemsByInvoice[selectedInvoice];
      if (!invoiceData || invoiceData.rows.length === 0) {
        alert(
          t('purchaseOrders.noBarcodesOnInvoice') ||
            'No barcodes found for this invoice. Save purchase orders with a SKU so barcodes are generated.'
        );
        return;
      }

      invoiceData.rows.forEach((row) => appendLabelsForRow(row, itemsToPrint));
    } else {
      if (selectedOrderIds.length === 0) {
        alert(t('purchaseOrders.selectAtLeastOneItem') || 'Please select at least one item.');
        return;
      }

      selectedOrderIds.forEach((orderId) => {
        const row = filteredPrintRows.find((r) => r.order.id === orderId);
        if (row) {
          appendLabelsForRow(row, itemsToPrint);
        }
      });
    }

    if (itemsToPrint.length === 0) {
      alert(
        t('purchaseOrders.noBarcodesFound') ||
          'No barcodes found for the selection. Ensure purchase orders have barcodes (save PO with SKU) or inventory has barcode URLs.'
      );
      return;
    }

    onPrint(itemsToPrint, printMode);
  };

  const totalSelectedItems =
    groupingMode === 'invoice'
      ? selectedInvoice
        ? itemsByInvoice[selectedInvoice]?.rows.length || 0
        : 0
      : selectedOrderIds.length;

  const canPrint = groupingMode === 'invoice' ? Boolean(selectedInvoice) : selectedOrderIds.length > 0;

  const groupingOptions: RadioOption<GroupingMode>[] = [
    {
      value: 'invoice',
      label: t('purchaseOrders.groupByInvoice') || 'Group by Invoice',
      hint:
        t('purchaseOrders.groupByInvoiceDesc') ||
        'Select and print items grouped by invoice',
    },
    {
      value: 'item',
      label: t('purchaseOrders.groupByItem') || 'Group by Item',
      hint:
        t('purchaseOrders.groupByItemDesc') || 'Select individual lines (all purchase orders)',
    },
  ];

  const printModeOptions: RadioOption<PrintMode>[] = [
    {
      value: 'full',
      label: t('purchaseOrders.printFullInvoice') || 'Print Full Invoice',
      hint:
        t('purchaseOrders.printFullInvoiceDesc') ||
        'One label per unit (uses on-hand stock if in inventory, otherwise PO quantity)',
    },
    {
      value: 'one-per-item',
      label: t('purchaseOrders.printOnePerItem') || 'One Barcode Per Item',
      hint:
        t('purchaseOrders.printOnePerItemDesc') ||
        'One label per purchase line / SKU',
    },
    {
      value: 'single',
      label: t('purchaseOrders.printSingle') || 'Print Single Barcode',
      hint: t('purchaseOrders.printSingleDesc') || 'Print just one barcode (first line)',
    },
  ];

  const rowSourceLabel = (row: BarcodePrintRow) => {
    if (row.inventoryItem) return null;
    if ((row.order.barcode || '').trim()) {
      return t('purchaseOrders.labelFromPO');
    }
    return t('purchaseOrders.poOnly');
  };

  return (
    <POModalShell
      title={t('purchaseOrders.printBarcodes') || 'Print Barcodes'}
      titleId="barcode-print-modal-title"
      maxWidthClass="max-w-3xl"
      onClose={onClose}
    >
      <div className="max-h-[calc(90vh-11rem)] overflow-y-auto px-6 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <RadioOptionGroup
            title={t('purchaseOrders.groupingMode') || 'Grouping Mode'}
            name="groupingMode"
            value={groupingMode}
            onChange={(next) => {
              setGroupingMode(next);
              setSelectedOrderIds([]);
              setSelectedInvoice(null);
            }}
            options={groupingOptions}
          />
          <RadioOptionGroup
            title={t('purchaseOrders.printMode') || 'Print Mode'}
            name="printMode"
            value={printMode}
            onChange={setPrintMode}
            options={printModeOptions}
          />
        </div>

        <div className="mt-4 space-y-3">
          <input
            type="text"
            placeholder={
              groupingMode === 'invoice'
                ? t('purchaseOrders.searchInvoices') || 'Search invoices...'
                : t('purchaseOrders.searchItems') || 'Search by invoice, SKU, description...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#515151]"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {groupingMode === 'item' ? (
                <>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    {t('purchaseOrders.selectAll') || 'Select All'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectNone}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    {t('purchaseOrders.selectNone') || 'Select None'}
                  </button>
                </>
              ) : (
                <span className="text-xs text-gray-500">
                  {t('purchaseOrders.selectOneInvoiceOnly') || 'Select one invoice to print'}
                </span>
              )}
            </div>
            <SelectionMeta>
              {groupingMode === 'invoice' ? (
                selectedInvoice ? (
                  <>
                    <span className="font-semibold text-gray-900">{selectedInvoice}</span>
                    {totalSelectedItems > 0 ? (
                      <span className="text-gray-500">
                        {' '}
                        · {totalSelectedItems}{' '}
                        {t('purchaseOrders.linesWithBarcodes') || 'lines with barcodes'}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-gray-400">
                    {t('purchaseOrders.noInvoiceSelected') || 'No invoice selected'}
                  </span>
                )
              ) : (
                <>
                  <span className="font-semibold text-gray-900">{totalSelectedItems}</span>{' '}
                  {t('purchaseOrders.lines') || 'lines'}
                </>
              )}
            </SelectionMeta>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
            {groupingMode === 'invoice' ? (
              filteredInvoices.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-gray-500">
                  {invoices.length === 0
                    ? t('purchaseOrders.noInvoices') || 'No purchase orders yet'
                    : t('purchaseOrders.noInvoicesMatchSearch') || 'No invoices match your search'}
                </div>
              ) : (
                filteredInvoices.map((invoice) => {
                  const invoiceData = itemsByInvoice[invoice];
                  const rows = invoiceData?.rows || [];
                  const totalOrders = invoiceData?.orders.length || 0;
                  const isSelected = selectedInvoice === invoice;

                  return (
                    <label
                      key={invoice}
                      className={`sasa-modal-row flex cursor-pointer gap-3 px-4 py-3 transition-colors ${
                        isSelected ? 'bg-[#515151]/5' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="invoiceSelection"
                        checked={isSelected}
                        onChange={() => handleInvoiceSelect(invoice)}
                        className="mt-1 h-4 w-4 shrink-0 border-gray-300 text-[#515151] focus:ring-[#515151]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-semibold text-gray-900">{invoice}</span>
                          <span className="text-xs text-gray-500">
                            {rows.length} {t('purchaseOrders.linesWithBarcodes') || 'lines with barcodes'}
                            {totalOrders > 0
                              ? ` · ${totalOrders} ${
                                  totalOrders === 1
                                    ? t('purchaseOrders.order') || 'order'
                                    : t('purchaseOrders.orders') || 'orders'
                                }`
                              : ''}
                          </span>
                        </span>
                        {rows.length > 0 ? (
                          <span className="mt-1.5 block space-y-0.5">
                            {rows.slice(0, 4).map((row) => (
                              <span
                                key={row.order.id}
                                className="block truncate text-xs text-gray-500"
                                title={`${row.order.description} (${row.order.sku})`}
                              >
                                {row.order.description}{' '}
                                <span className="font-mono text-gray-400">({row.order.sku})</span>
                                {rowSourceLabel(row) ? (
                                  <span className="text-gray-400"> · {rowSourceLabel(row)}</span>
                                ) : null}
                              </span>
                            ))}
                            {rows.length > 4 ? (
                              <span className="text-xs text-gray-400">
                                +{rows.length - 4} {t('purchaseOrders.more') || 'more'}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="mt-1 block text-xs italic text-gray-400">
                            {t('purchaseOrders.noBarcodesOnInvoice') ||
                              'No barcodes yet — save lines with a SKU to generate labels.'}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })
              )
            ) : filteredPrintRows.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-500">
                {allPrintRows.length === 0
                  ? t('purchaseOrders.noLinesWithBarcodes') ||
                    'No purchase order lines have barcodes yet. Save or update POs with SKUs.'
                  : t('purchaseOrders.noItemsMatchSearch') || 'No lines match your search'}
              </div>
            ) : (
              filteredPrintRows.map((row) => {
                const isSelected = selectedOrderIds.includes(row.order.id);
                const units = labelCountForFullPrint(row.order, row.inventoryItem);
                const source = rowSourceLabel(row);

                return (
                  <label
                    key={row.order.id}
                    className={`sasa-modal-row flex cursor-pointer gap-3 px-4 py-3 transition-colors ${
                      isSelected ? 'bg-[#515151]/5' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleOrderToggle(row.order.id)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-[#515151] focus:ring-[#515151]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block font-medium text-gray-900">{row.order.description}</span>
                          <span className="mt-0.5 block font-mono text-xs text-gray-500">{row.order.sku}</span>
                        </span>
                        <span className="shrink-0 text-xs text-gray-500">
                          {t('purchaseOrders.invoice') || 'Invoice'}: {row.order.invoice}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-gray-500">
                        {t('purchaseOrders.fullPrintUnits') || 'Full print'}: {units}{' '}
                        {t('purchaseOrders.labels') || 'labels'}
                        {source ? ` · ${source}` : ''}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-gray-300 bg-transparent px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          {t('common.cancel') || 'Cancel'}
        </button>
        <button
          type="button"
          onClick={handlePrint}
          disabled={!canPrint}
          className="rounded-xl bg-[#515151] px-4 py-2 font-medium text-white transition-colors hover:bg-[#000000] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('purchaseOrders.print') || 'Print'}
        </button>
      </div>
    </POModalShell>
  );
}
