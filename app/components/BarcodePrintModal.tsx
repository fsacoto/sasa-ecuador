'use client';

import { useState, useMemo } from 'react';
import { PurchaseOrder, InventoryItem } from '../types';
import { useTranslation } from '../context/TranslationContext';
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

export default function BarcodePrintModal({
  purchaseOrders,
  inventory,
  onClose,
  onPrint,
}: BarcodePrintModalProps) {
  const { t } = useTranslation();
  const [groupingMode, setGroupingMode] = useState<'invoice' | 'item'>('invoice');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<'full' | 'one-per-item' | 'single'>('full');
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

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 duration-300">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {t('purchaseOrders.printBarcodes') || 'Print Barcodes'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-12rem)] p-6 space-y-4">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              {t('purchaseOrders.groupingMode') || 'Grouping Mode'}
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="groupingMode"
                  value="invoice"
                  checked={groupingMode === 'invoice'}
                  onChange={() => {
                    setGroupingMode('invoice');
                    setSelectedOrderIds([]);
                    setSelectedInvoice(null);
                  }}
                  className="w-4 h-4 text-[#4f0c1b] border-gray-300 focus:ring-[#4f0c1b]"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {t('purchaseOrders.groupByInvoice') || 'Group by Invoice'}
                  </span>
                  <p className="text-xs text-gray-600">
                    {t('purchaseOrders.groupByInvoiceDesc') ||
                      'Select and print items grouped by invoice'}
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="groupingMode"
                  value="item"
                  checked={groupingMode === 'item'}
                  onChange={() => {
                    setGroupingMode('item');
                    setSelectedOrderIds([]);
                    setSelectedInvoice(null);
                  }}
                  className="w-4 h-4 text-[#4f0c1b] border-gray-300 focus:ring-[#4f0c1b]"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {t('purchaseOrders.groupByItem') || 'Group by Item'}
                  </span>
                  <p className="text-xs text-gray-600">
                    {t('purchaseOrders.groupByItemDesc') || 'Select individual lines (all purchase orders)'}
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              {t('purchaseOrders.printMode') || 'Print Mode'}
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="printMode"
                  value="full"
                  checked={printMode === 'full'}
                  onChange={(e) => setPrintMode(e.target.value as 'full')}
                  className="w-4 h-4 text-[#4f0c1b] border-gray-300 focus:ring-[#4f0c1b]"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {t('purchaseOrders.printFullInvoice') || 'Print Full Invoice'}
                  </span>
                  <p className="text-xs text-gray-600">
                    {t('purchaseOrders.printFullInvoiceDesc') ||
                      'One label per unit (uses on-hand stock if in inventory, otherwise PO quantity)'}
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="printMode"
                  value="one-per-item"
                  checked={printMode === 'one-per-item'}
                  onChange={(e) => setPrintMode(e.target.value as 'one-per-item')}
                  className="w-4 h-4 text-[#4f0c1b] border-gray-300 focus:ring-[#4f0c1b]"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {t('purchaseOrders.printOnePerItem') || 'One Barcode Per Item'}
                  </span>
                  <p className="text-xs text-gray-600">
                    {t('purchaseOrders.printOnePerItemDesc') ||
                      'One label per purchase line / SKU'}
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="printMode"
                  value="single"
                  checked={printMode === 'single'}
                  onChange={(e) => setPrintMode(e.target.value as 'single')}
                  className="w-4 h-4 text-[#4f0c1b] border-gray-300 focus:ring-[#4f0c1b]"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {t('purchaseOrders.printSingle') || 'Print Single Barcode'}
                  </span>
                  <p className="text-xs text-gray-600">
                    {t('purchaseOrders.printSingleDesc') || 'Print just one barcode (first line)'}
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div>
            <input
              type="text"
              placeholder={
                groupingMode === 'invoice'
                  ? t('purchaseOrders.searchInvoices') || 'Search invoices...'
                  : t('purchaseOrders.searchItems') || 'Search by invoice, SKU, description...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent text-sm"
            />
          </div>

          <div className="flex gap-2">
            {groupingMode === 'item' && (
              <>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="px-3 py-1.5 text-sm text-[#4f0c1b] hover:bg-[#4f0c1b] hover:text-white border border-[#4f0c1b] rounded-lg transition-colors"
                >
                  {t('purchaseOrders.selectAll') || 'Select All'}
                </button>
                <button
                  type="button"
                  onClick={handleSelectNone}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 border border-gray-300 rounded-lg transition-colors"
                >
                  {t('purchaseOrders.selectNone') || 'Select None'}
                </button>
              </>
            )}
            {groupingMode === 'invoice' && (
              <div className="text-sm text-gray-600 italic">
                {t('purchaseOrders.selectOneInvoiceOnly') || 'Select one invoice to print'}
              </div>
            )}
            <div className="flex-1 text-right text-sm text-gray-600 flex items-center justify-end">
              {groupingMode === 'invoice' ? (
                <>
                  {selectedInvoice ? (
                    <>
                      {t('purchaseOrders.selected') || 'Selected'}:{' '}
                      <span className="font-semibold ml-1">{selectedInvoice}</span>
                      {totalSelectedItems > 0 && (
                        <span className="ml-2">
                          ({totalSelectedItems}{' '}
                          {t('purchaseOrders.linesWithBarcodes') || 'lines with barcodes'})
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-400">
                      {t('purchaseOrders.noInvoiceSelected') || 'No invoice selected'}
                    </span>
                  )}
                </>
              ) : (
                <>
                  {t('purchaseOrders.selected') || 'Selected'}:{' '}
                  <span className="font-semibold ml-1">{totalSelectedItems}</span>{' '}
                  {t('purchaseOrders.lines') || 'lines'}
                </>
              )}
            </div>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {groupingMode === 'invoice' ? (
              filteredInvoices.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
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
                    <div
                      key={invoice}
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-[#4f0c1b] bg-[#4f0c1b]/5'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                      onClick={() => handleInvoiceSelect(invoice)}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="invoiceSelection"
                          checked={isSelected}
                          onChange={() => handleInvoiceSelect(invoice)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 w-4 h-4 text-[#4f0c1b] border-gray-300 focus:ring-[#4f0c1b]"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-gray-900">{invoice}</h4>
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-xs text-gray-500">
                                {rows.length}{' '}
                                {t('purchaseOrders.linesWithBarcodes') || 'lines with barcodes'}
                              </span>
                              {totalOrders > 0 && (
                                <span className="text-xs text-gray-400">
                                  {totalOrders}{' '}
                                  {totalOrders === 1
                                    ? t('purchaseOrders.order') || 'order'
                                    : t('purchaseOrders.orders') || 'orders'}
                                </span>
                              )}
                            </div>
                          </div>
                          {rows.length > 0 ? (
                            <div className="mt-2 space-y-1">
                              {rows.slice(0, 5).map((row) => (
                                <div
                                  key={row.order.id}
                                  className="text-sm text-gray-600 flex items-center gap-2"
                                >
                                  <span className="text-green-600 text-xs">✓</span>
                                  <span>
                                    {row.order.description} ({row.order.sku})
                                  </span>
                                  {!row.inventoryItem && (
                                    <span className="text-xs text-amber-700">
                                      ({t('purchaseOrders.poOnly') || 'PO only'})
                                    </span>
                                  )}
                                </div>
                              ))}
                              {rows.length > 5 && (
                                <div className="text-xs text-gray-400">
                                  +{rows.length - 5} {t('purchaseOrders.more') || 'more'}...
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-gray-400 italic">
                              {t('purchaseOrders.noBarcodesOnInvoice') ||
                                'No barcodes yet — save lines with a SKU to generate labels.'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            ) : filteredPrintRows.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {allPrintRows.length === 0
                  ? t('purchaseOrders.noLinesWithBarcodes') ||
                    'No purchase order lines have barcodes yet. Save or update POs with SKUs.'
                  : t('purchaseOrders.noItemsMatchSearch') || 'No lines match your search'}
              </div>
            ) : (
              filteredPrintRows.map((row) => {
                const isSelected = selectedOrderIds.includes(row.order.id);
                const units = labelCountForFullPrint(row.order, row.inventoryItem);

                return (
                  <div
                    key={row.order.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#4f0c1b] bg-[#4f0c1b]/5'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    onClick={() => handleOrderToggle(row.order.id)}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleOrderToggle(row.order.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 w-4 h-4 text-[#4f0c1b] border-gray-300 rounded focus:ring-[#4f0c1b]"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">{row.order.description}</h4>
                            <div className="text-xs text-gray-500 mt-1 font-mono">{row.order.sku}</div>
                          </div>
                          <span className="text-xs text-gray-500 ml-2">
                            {t('purchaseOrders.invoice') || 'Invoice'}: {row.order.invoice}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                          {row.inventoryItem ? (
                            <span>
                              {t('purchaseOrders.fullPrintUnits') || 'Full print'}: {units}{' '}
                              {t('purchaseOrders.labels') || 'labels'}
                            </span>
                          ) : (
                            <span>
                              {t('purchaseOrders.fullPrintUnits') || 'Full print'}: {units}{' '}
                              {t('purchaseOrders.labels') || 'labels'} (
                              {t('purchaseOrders.fromPO') || 'from PO'})
                            </span>
                          )}
                          {!row.inventoryItem && (
                            <span className="text-amber-700">
                              {t('purchaseOrders.poOnly') || 'Not in inventory yet'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
          >
            {t('common.cancel') || 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={groupingMode === 'invoice' ? !selectedInvoice : selectedOrderIds.length === 0}
            className="px-4 py-2 bg-[#4f0c1b] text-white hover:bg-[#3d0a15] rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('purchaseOrders.print') || 'Print'}
          </button>
        </div>
      </div>
    </div>
  );
}
