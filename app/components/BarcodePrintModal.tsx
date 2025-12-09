'use client';

import { useState } from 'react';
import { PurchaseOrder, InventoryItem } from '../types';
import { useTranslation } from '../context/TranslationContext';

interface BarcodePrintModalProps {
  purchaseOrders: PurchaseOrder[];
  inventory: InventoryItem[];
  onClose: () => void;
  onPrint: (items: Array<{ order: PurchaseOrder; inventoryItem: InventoryItem | null; quantity: number }>, printMode: 'full' | 'one-per-item' | 'single') => void;
}

export default function BarcodePrintModal({ purchaseOrders, inventory, onClose, onPrint }: BarcodePrintModalProps) {
  const { t } = useTranslation();
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [printMode, setPrintMode] = useState<'full' | 'one-per-item' | 'single'>('full');
  const [searchQuery, setSearchQuery] = useState('');

  // Get unique invoices from verified orders that have inventory items
  const verifiedOrders = purchaseOrders.filter(order => order.status === 'Verified');
  const invoices = [...new Set(verifiedOrders.map(order => order.invoice))];

  // Filter invoices based on search
  const filteredInvoices = invoices.filter(invoice =>
    invoice.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group orders by invoice
  const ordersByInvoice = filteredInvoices.reduce((acc, invoice) => {
    acc[invoice] = verifiedOrders.filter(order => order.invoice === invoice);
    return acc;
  }, {} as Record<string, PurchaseOrder[]>);

  const handleInvoiceToggle = (invoice: string) => {
    setSelectedInvoices(prev =>
      prev.includes(invoice)
        ? prev.filter(inv => inv !== invoice)
        : [...prev, invoice]
    );
  };

  const handleSelectAll = () => {
    setSelectedInvoices(filteredInvoices);
  };

  const handleSelectNone = () => {
    setSelectedInvoices([]);
  };

  const handlePrint = () => {
    if (selectedInvoices.length === 0) {
      alert(t('purchaseOrders.selectAtLeastOneInvoice') || 'Please select at least one invoice.');
      return;
    }

    // Collect all items to print
    const itemsToPrint: Array<{ order: PurchaseOrder; inventoryItem: InventoryItem | null; quantity: number }> = [];

    selectedInvoices.forEach(invoice => {
      const orders = ordersByInvoice[invoice];
      orders.forEach(order => {
        // Find inventory item by SKU
        const inventoryItem = inventory.find(item => item.sku === order.sku);
        
        if (!inventoryItem || !inventoryItem.barcode) {
          // Skip items without barcodes
          return;
        }

        if (printMode === 'full') {
          // Print one barcode per quantity (use quantityGood if available, otherwise quantityReceived or quantity)
          const quantity = order.quantityGood !== undefined ? order.quantityGood : (order.quantityReceived || order.quantity);
          for (let i = 0; i < quantity; i++) {
            itemsToPrint.push({ order, inventoryItem, quantity: 1 });
          }
        } else if (printMode === 'one-per-item') {
          // Print one barcode per item (regardless of quantity)
          itemsToPrint.push({ order, inventoryItem, quantity: 1 });
        } else if (printMode === 'single') {
          // Print just one barcode total
          if (itemsToPrint.length === 0) {
            itemsToPrint.push({ order, inventoryItem, quantity: 1 });
          }
        }
      });
    });

    if (itemsToPrint.length === 0) {
      alert(t('purchaseOrders.noBarcodesFound') || 'No barcodes found for selected invoices. Make sure items are verified and have barcodes generated in inventory.');
      return;
    }

    onPrint(itemsToPrint, printMode);
  };

  const totalItems = selectedInvoices.reduce((total, invoice) => {
    const orders = ordersByInvoice[invoice];
    return total + orders.length;
  }, 0);

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 duration-300">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{t('purchaseOrders.printBarcodes') || 'Print Barcodes'}</h3>
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
          {/* Print Mode Selection */}
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
                    {t('purchaseOrders.printFullInvoiceDesc') || 'One barcode per item quantity (e.g., 5 items = 5 barcodes)'}
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
                    {t('purchaseOrders.printOnePerItemDesc') || 'One barcode per unique item across all invoices'}
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
                    {t('purchaseOrders.printSingleDesc') || 'Print just one barcode (first item)'}
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Search */}
          <div>
            <input
              type="text"
              placeholder={t('purchaseOrders.searchInvoices') || 'Search invoices...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent text-sm"
            />
          </div>

          {/* Selection Controls */}
          <div className="flex gap-2">
            <button
              onClick={handleSelectAll}
              className="px-3 py-1.5 text-sm text-[#4f0c1b] hover:bg-[#4f0c1b] hover:text-white border border-[#4f0c1b] rounded-lg transition-colors"
            >
              {t('purchaseOrders.selectAll') || 'Select All'}
            </button>
            <button
              onClick={handleSelectNone}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 border border-gray-300 rounded-lg transition-colors"
            >
              {t('purchaseOrders.selectNone') || 'Select None'}
            </button>
            <div className="flex-1 text-right text-sm text-gray-600 flex items-center justify-end">
              {t('purchaseOrders.selected') || 'Selected'}: <span className="font-semibold ml-1">{selectedInvoices.length}</span> {t('purchaseOrders.invoices') || 'invoices'} ({totalItems} {t('purchaseOrders.items') || 'items'})
            </div>
          </div>

          {/* Invoice List */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredInvoices.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {t('purchaseOrders.noVerifiedInvoices') || 'No verified invoices found'}
              </div>
            ) : (
              filteredInvoices.map(invoice => {
                const orders = ordersByInvoice[invoice];
                const itemsWithBarcodes = orders.filter(order => {
                  const inventoryItem = inventory.find(item => item.sku === order.sku);
                  return inventoryItem && inventoryItem.barcode;
                });

                return (
                  <div
                    key={invoice}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      selectedInvoices.includes(invoice)
                        ? 'border-[#4f0c1b] bg-[#4f0c1b]/5'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    onClick={() => handleInvoiceToggle(invoice)}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedInvoices.includes(invoice)}
                        onChange={() => handleInvoiceToggle(invoice)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 w-4 h-4 text-[#4f0c1b] border-gray-300 rounded focus:ring-[#4f0c1b]"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-gray-900">{invoice}</h4>
                          <span className="text-xs text-gray-500">
                            {itemsWithBarcodes.length} / {orders.length} {t('purchaseOrders.itemsWithBarcodes') || 'items with barcodes'}
                          </span>
                        </div>
                        <div className="mt-2 space-y-1">
                          {orders.slice(0, 3).map(order => {
                            const inventoryItem = inventory.find(item => item.sku === order.sku);
                            const hasBarcode = inventoryItem && inventoryItem.barcode;
                            return (
                              <div key={order.id} className="text-sm text-gray-600 flex items-center gap-2">
                                <span>{order.description}</span>
                                {hasBarcode ? (
                                  <span className="text-green-600 text-xs">✓</span>
                                ) : (
                                  <span className="text-red-600 text-xs">✗</span>
                                )}
                              </div>
                            );
                          })}
                          {orders.length > 3 && (
                            <div className="text-xs text-gray-400">
                              +{orders.length - 3} {t('purchaseOrders.more') || 'more'}...
                            </div>
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
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
          >
            {t('common.cancel') || 'Cancel'}
          </button>
          <button
            onClick={handlePrint}
            disabled={selectedInvoices.length === 0}
            className="px-4 py-2 bg-[#4f0c1b] text-white hover:bg-[#3d0a15] rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('purchaseOrders.print') || 'Print'}
          </button>
        </div>
      </div>
    </div>
  );
}

