'use client';

import { useState, useMemo } from 'react';
import { PurchaseOrder, InventoryItem } from '../types';
import { useTranslation } from '../context/TranslationContext';

interface BarcodePrintModalProps {
  purchaseOrders: PurchaseOrder[];
  inventory: InventoryItem[];
  onClose: () => void;
  onPrint: (items: Array<{ order: PurchaseOrder | null; inventoryItem: InventoryItem; quantity: number }>, printMode: 'full' | 'one-per-item' | 'single') => void;
}

export default function BarcodePrintModal({ purchaseOrders, inventory, onClose, onPrint }: BarcodePrintModalProps) {
  const { t } = useTranslation();
  const [groupingMode, setGroupingMode] = useState<'invoice' | 'item'>('invoice');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null); // Single invoice selection
  const [printMode, setPrintMode] = useState<'full' | 'one-per-item' | 'single'>('full');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter inventory items that have barcodes
  const itemsWithBarcodes = useMemo(() => {
    return inventory.filter(item => item.barcode);
  }, [inventory]);

  // Create a map of inventory items to their invoices (for tracing)
  const itemToInvoicesMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    
    itemsWithBarcodes.forEach(item => {
      // Get purchase orders linked to this inventory item
      const linkedOrders = purchaseOrders.filter(order => 
        item.linkedPurchaseOrders?.includes(order.id) || order.sku === item.sku
      );
      
      // Get unique invoices for this item
      const invoices = [...new Set(linkedOrders.map(order => order.invoice))];
      if (invoices.length > 0) {
        map[item.id] = invoices;
      }
    });
    
    return map;
  }, [itemsWithBarcodes, purchaseOrders]);

  // Group items by invoice - show ALL invoices from purchase orders
  const itemsByInvoice = useMemo(() => {
    const invoiceMap: Record<string, { items: InventoryItem[]; orders: PurchaseOrder[] }> = {};
    
    // First, initialize all invoices from purchase orders
    purchaseOrders.forEach(order => {
      if (!invoiceMap[order.invoice]) {
        invoiceMap[order.invoice] = { items: [], orders: [] };
      }
      // Add order if not already added
      if (!invoiceMap[order.invoice].orders.find(o => o.id === order.id)) {
        invoiceMap[order.invoice].orders.push(order);
      }
    });
    
    // Then, add inventory items that have barcodes and are linked to these invoices
    itemsWithBarcodes.forEach(item => {
      // Get purchase orders linked to this inventory item
      const linkedOrders = purchaseOrders.filter(order => 
        item.linkedPurchaseOrders?.includes(order.id) || order.sku === item.sku
      );
      
      // Group by invoice
      linkedOrders.forEach(order => {
        if (invoiceMap[order.invoice]) {
          // Add item if not already added for this invoice
          if (!invoiceMap[order.invoice].items.find(i => i.id === item.id)) {
            invoiceMap[order.invoice].items.push(item);
          }
        }
      });
    });
    
    return invoiceMap;
  }, [itemsWithBarcodes, purchaseOrders]);

  // Get unique invoices - ALL invoices from purchase orders
  const invoices = useMemo(() => {
    const allInvoices = [...new Set(purchaseOrders.map(order => order.invoice))];
    return allInvoices.sort();
  }, [purchaseOrders]);

  // Filter invoices based on search
  const filteredInvoices = useMemo(() => {
    if (!searchQuery.trim()) {
      return invoices;
    }
    const query = searchQuery.toLowerCase();
    return invoices.filter(invoice => {
      // Search by invoice name
      if (invoice.toLowerCase().includes(query)) {
        return true;
      }
      // Search by items in the invoice
      const invoiceData = itemsByInvoice[invoice];
      if (invoiceData && invoiceData.items.some(item =>
        item.name.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
      )) {
        return true;
      }
      // Search by purchase orders in the invoice
      if (invoiceData && invoiceData.orders.some(order =>
        order.description?.toLowerCase().includes(query) ||
        order.sku?.toLowerCase().includes(query)
      )) {
        return true;
      }
      return false;
    });
  }, [invoices, itemsByInvoice, searchQuery]);

  // Filter items based on search (by name, SKU, description, category, or line)
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return itemsWithBarcodes;
    }
    const query = searchQuery.toLowerCase();
    return itemsWithBarcodes.filter(item =>
      item.name.toLowerCase().includes(query) ||
      item.sku.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query) ||
      item.category?.toLowerCase().includes(query) ||
      item.line?.toLowerCase().includes(query)
    );
  }, [itemsWithBarcodes, searchQuery]);

  const handleItemToggle = (itemId: string) => {
    setSelectedItemIds(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleInvoiceSelect = (invoice: string) => {
    // Only allow one invoice to be selected at a time
    setSelectedInvoice(prev => prev === invoice ? null : invoice);
  };

  const handleSelectAll = () => {
    if (groupingMode === 'invoice') {
      // In invoice mode, select the first invoice if none selected
      if (!selectedInvoice && filteredInvoices.length > 0) {
        setSelectedInvoice(filteredInvoices[0]);
      }
    } else {
      setSelectedItemIds(filteredItems.map(item => item.id));
    }
  };

  const handleSelectNone = () => {
    if (groupingMode === 'invoice') {
      setSelectedInvoice(null);
    } else {
      setSelectedItemIds([]);
    }
  };

  const handlePrint = () => {
    // Collect all items to print
    const itemsToPrint: Array<{ order: PurchaseOrder | null; inventoryItem: InventoryItem; quantity: number }> = [];

    if (groupingMode === 'invoice') {
      if (!selectedInvoice) {
        alert(t('purchaseOrders.selectOneInvoice') || 'Please select one invoice to print.');
        return;
      }

      const invoiceData = itemsByInvoice[selectedInvoice];
      if (!invoiceData) {
        alert(t('purchaseOrders.invoiceNotFound') || 'Selected invoice not found.');
        return;
      }

      // Only print items that have barcodes
      const itemsToPrintForInvoice = invoiceData.items.filter(item => item.barcode);

      itemsToPrintForInvoice.forEach(inventoryItem => {
        // Find the purchase order for this item in this invoice
        const relatedOrder = invoiceData.orders.find(order => 
          order.sku === inventoryItem.sku || inventoryItem.linkedPurchaseOrders?.includes(order.id)
        ) || null;

        if (printMode === 'full') {
          // Print one barcode per unit in stock
          const totalStock = (inventoryItem.ecuadorStock || 0) + (inventoryItem.usaStock || 0) + (inventoryItem.consignmentStock || 0);
          for (let i = 0; i < totalStock; i++) {
            itemsToPrint.push({ order: relatedOrder, inventoryItem, quantity: 1 });
          }
        } else if (printMode === 'one-per-item') {
          // Print one barcode per item (regardless of quantity)
          itemsToPrint.push({ order: relatedOrder, inventoryItem, quantity: 1 });
        } else if (printMode === 'single') {
          // Print just one barcode total
          if (itemsToPrint.length === 0) {
            itemsToPrint.push({ order: relatedOrder, inventoryItem, quantity: 1 });
          }
        }
      });
    } else {
      if (selectedItemIds.length === 0) {
        alert(t('purchaseOrders.selectAtLeastOneItem') || 'Please select at least one item.');
        return;
      }

      selectedItemIds.forEach(itemId => {
        const inventoryItem = filteredItems.find(item => item.id === itemId);
        
        if (!inventoryItem || !inventoryItem.barcode) {
          return;
        }

        // Find related purchase orders - prefer linked orders, fallback to SKU match
        const linkedOrders = purchaseOrders.filter(order => 
          inventoryItem.linkedPurchaseOrders?.includes(order.id) || order.sku === inventoryItem.sku
        );
        const relatedOrder = linkedOrders.length > 0 ? linkedOrders[0] : null;
        
        // Calculate total stock quantity
        const totalStock = (inventoryItem.ecuadorStock || 0) + (inventoryItem.usaStock || 0) + (inventoryItem.consignmentStock || 0);

        if (printMode === 'full') {
          // Print one barcode per unit in stock
          for (let i = 0; i < totalStock; i++) {
            itemsToPrint.push({ order: relatedOrder, inventoryItem, quantity: 1 });
          }
        } else if (printMode === 'one-per-item') {
          // Print one barcode per item (regardless of quantity)
          itemsToPrint.push({ order: relatedOrder, inventoryItem, quantity: 1 });
        } else if (printMode === 'single') {
          // Print just one barcode total
          if (itemsToPrint.length === 0) {
            itemsToPrint.push({ order: relatedOrder, inventoryItem, quantity: 1 });
          }
        }
      });
    }

    if (itemsToPrint.length === 0) {
      alert(t('purchaseOrders.noBarcodesFound') || 'No barcodes found for selected items. Make sure items have barcodes generated in inventory.');
      return;
    }

    onPrint(itemsToPrint, printMode);
  };

  const totalSelectedItems = groupingMode === 'invoice' 
    ? (selectedInvoice ? (itemsByInvoice[selectedInvoice]?.items.filter(item => item.barcode).length || 0) : 0)
    : selectedItemIds.length;

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
          {/* Grouping Mode Selection */}
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
                  onChange={(e) => {
                    setGroupingMode('invoice');
                    setSelectedItemIds([]);
                    setSelectedInvoice(null);
                  }}
                  className="w-4 h-4 text-[#4f0c1b] border-gray-300 focus:ring-[#4f0c1b]"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {t('purchaseOrders.groupByInvoice') || 'Group by Invoice'}
                  </span>
                  <p className="text-xs text-gray-600">
                    {t('purchaseOrders.groupByInvoiceDesc') || 'Select and print items grouped by invoice'}
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="groupingMode"
                  value="item"
                  checked={groupingMode === 'item'}
                  onChange={(e) => {
                    setGroupingMode('item');
                    setSelectedItemIds([]);
                    setSelectedInvoice(null);
                  }}
                  className="w-4 h-4 text-[#4f0c1b] border-gray-300 focus:ring-[#4f0c1b]"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {t('purchaseOrders.groupByItem') || 'Group by Item'}
                  </span>
                  <p className="text-xs text-gray-600">
                    {t('purchaseOrders.groupByItemDesc') || 'Select individual items to print'}
                  </p>
                </div>
              </label>
            </div>
          </div>

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
              placeholder={
                groupingMode === 'invoice'
                  ? (t('purchaseOrders.searchInvoices') || 'Search invoices...')
                  : (t('purchaseOrders.searchItems') || 'Search items by name, SKU, description...')
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent text-sm"
            />
          </div>

          {/* Selection Controls */}
          <div className="flex gap-2">
            {groupingMode === 'item' && (
              <>
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
                      {t('purchaseOrders.selected') || 'Selected'}: <span className="font-semibold ml-1">{selectedInvoice}</span>
                      {totalSelectedItems > 0 && (
                        <span className="ml-2">({totalSelectedItems} {t('purchaseOrders.items') || 'items'})</span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-400">{t('purchaseOrders.noInvoiceSelected') || 'No invoice selected'}</span>
                  )}
                </>
              ) : (
                <>
                  {t('purchaseOrders.selected') || 'Selected'}: <span className="font-semibold ml-1">{totalSelectedItems}</span> {t('purchaseOrders.items') || 'items'}
                </>
              )}
            </div>
          </div>

          {/* Invoice List or Inventory Items List */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {groupingMode === 'invoice' ? (
              filteredInvoices.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {invoices.length === 0
                    ? (t('purchaseOrders.noInvoicesWithBarcodes') || 'No invoices with items that have barcodes found')
                    : (t('purchaseOrders.noInvoicesMatchSearch') || 'No invoices match your search')}
                </div>
              ) : (
                filteredInvoices.map(invoice => {
                  const invoiceData = itemsByInvoice[invoice];
                  const itemsWithBarcodes = invoiceData?.items.filter(item => item.barcode) || [];
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
                                {itemsWithBarcodes.length} {t('purchaseOrders.itemsWithBarcodes') || 'items with barcodes'}
                              </span>
                              {totalOrders > 0 && (
                                <span className="text-xs text-gray-400">
                                  {totalOrders} {totalOrders === 1 ? (t('purchaseOrders.order') || 'order') : (t('purchaseOrders.orders') || 'orders')}
                                </span>
                              )}
                            </div>
                          </div>
                          {invoiceData && invoiceData.items.length > 0 ? (
                            <div className="mt-2 space-y-1">
                              {invoiceData.items.slice(0, 3).map(item => {
                                const hasBarcode = item.barcode;
                                return (
                                  <div key={item.id} className="text-sm text-gray-600 flex items-center gap-2">
                                    <span>{item.name} ({item.sku})</span>
                                    {hasBarcode ? (
                                      <span className="text-green-600 text-xs">✓</span>
                                    ) : (
                                      <span className="text-red-600 text-xs">✗</span>
                                    )}
                                  </div>
                                );
                              })}
                              {invoiceData.items.length > 3 && (
                                <div className="text-xs text-gray-400">
                                  +{invoiceData.items.length - 3} {t('purchaseOrders.more') || 'more'}...
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-gray-400 italic">
                              {t('purchaseOrders.noItemsLinkedToInvoice') || 'No inventory items linked to this invoice'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            ) : (
              filteredItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {itemsWithBarcodes.length === 0
                    ? (t('purchaseOrders.noItemsWithBarcodes') || 'No inventory items with barcodes found')
                    : (t('purchaseOrders.noItemsMatchSearch') || 'No items match your search')}
                </div>
              ) : (
                filteredItems.map(item => {
                  const totalStock = (item.ecuadorStock || 0) + (item.usaStock || 0) + (item.consignmentStock || 0);
                  const isSelected = selectedItemIds.includes(item.id);
                  const itemInvoices = itemToInvoicesMap[item.id] || [];

                  return (
                    <div
                      key={item.id}
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-[#4f0c1b] bg-[#4f0c1b]/5'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                      onClick={() => handleItemToggle(item.id)}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleItemToggle(item.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 w-4 h-4 text-[#4f0c1b] border-gray-300 rounded focus:ring-[#4f0c1b]"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-900">{item.name}</h4>
                              <div className="text-xs text-gray-500 mt-1 font-mono">{item.sku}</div>
                            </div>
                            <span className="text-xs text-gray-500 ml-2">
                              {totalStock} {t('purchaseOrders.inStock') || 'in stock'}
                            </span>
                          </div>
                          {item.description && (
                            <div className="mt-2 text-sm text-gray-600">
                              {item.description}
                            </div>
                          )}
                          {itemInvoices.length > 0 && (
                            <div className="mt-2 text-xs text-gray-500">
                              <span className="font-medium">{t('purchaseOrders.invoice') || 'Invoice'}:</span>{' '}
                              {itemInvoices.join(', ')}
                            </div>
                          )}
                          <div className="mt-2 flex gap-4 text-xs text-gray-500">
                            {item.category && (
                              <span>{t('inventory.category') || 'Category'}: {item.category}</span>
                            )}
                            {item.line && (
                              <span>{t('inventory.line') || 'Line'}: {item.line}</span>
                            )}
                            {(item.ecuadorStock > 0 || item.usaStock > 0) && (
                              <span>
                                Ecuador: {item.ecuadorStock || 0} | USA: {item.usaStock || 0}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )
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
            disabled={groupingMode === 'invoice' ? !selectedInvoice : selectedItemIds.length === 0}
            className="px-4 py-2 bg-[#4f0c1b] text-white hover:bg-[#3d0a15] rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('purchaseOrders.print') || 'Print'}
          </button>
        </div>
      </div>
    </div>
  );
}

