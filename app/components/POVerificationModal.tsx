'use client';

import { useState, useMemo } from 'react';
import { PurchaseOrder, Supplier } from '../types';
import { useTranslation } from '../context/TranslationContext';

interface POVerificationModalProps {
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  onClose: () => void;
  onSelect: (invoiceNumber: string) => void;
}

export default function POVerificationModal({ 
  purchaseOrders, 
  suppliers, 
  onClose, 
  onSelect 
}: POVerificationModalProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  // Get unique invoices that have at least one unverified order
  const unverifiedInvoices = useMemo(() => {
    const invoiceMap = new Map<string, { 
      orders: PurchaseOrder[], 
      hasUnverified: boolean,
      supplierId: string,
      destinationStock: 'Ecuador' | 'USA',
      purchaseDate: Date
    }>();
    
    purchaseOrders.forEach(order => {
      if (!invoiceMap.has(order.invoice)) {
        invoiceMap.set(order.invoice, { 
          orders: [], 
          hasUnverified: false,
          supplierId: order.supplierId,
          destinationStock: order.destinationStock,
          purchaseDate: order.purchaseDate
        });
      }
      const invoiceData = invoiceMap.get(order.invoice)!;
      invoiceData.orders.push(order);
      if (order.status !== 'Verified') {
        invoiceData.hasUnverified = true;
      }
    });
    
    // Return only invoices with unverified orders
    const invoices: Array<{
      invoice: string;
      orders: PurchaseOrder[];
      supplierId: string;
      destinationStock: 'Ecuador' | 'USA';
      purchaseDate: Date;
    }> = [];
    
    invoiceMap.forEach((data, invoice) => {
      if (data.hasUnverified) {
        invoices.push({ 
          invoice, 
          orders: data.orders,
          supplierId: data.supplierId,
          destinationStock: data.destinationStock,
          purchaseDate: data.purchaseDate
        });
      }
    });
    
    return invoices.sort((a, b) => a.invoice.localeCompare(b.invoice));
  }, [purchaseOrders]);

  // Filter invoices based on search
  const filteredInvoices = useMemo(() => {
    if (!searchQuery.trim()) {
      return unverifiedInvoices;
    }

    const query = searchQuery.toLowerCase();
    return unverifiedInvoices.filter(inv => {
      const supplier = suppliers.find(s => s.id === inv.supplierId);
      const supplierName = supplier?.name.toLowerCase() || '';
      const invoiceLower = inv.invoice.toLowerCase();
      const destinationLower = inv.destinationStock.toLowerCase();
      const purchaseDateStr = inv.purchaseDate.toLocaleDateString().toLowerCase();
      
      // Check if any order in this invoice matches
      const hasMatchingSku = inv.orders.some(order => 
        order.sku?.toLowerCase().includes(query)
      );

      return (
        invoiceLower.includes(query) ||
        supplierName.includes(query) ||
        destinationLower.includes(query) ||
        purchaseDateStr.includes(query) ||
        hasMatchingSku
      );
    });
  }, [unverifiedInvoices, searchQuery, suppliers]);

  // Format PO number
  const formatPONumber = (invoice: string): string => {
    if (invoice && invoice.startsWith('PO-')) {
      return invoice;
    }
    const numbers = invoice.match(/\d+/);
    if (numbers) {
      return `PO-${String(numbers[0]).padStart(5, '0')}`;
    }
    return invoice || 'PO-00000';
  };

  const handleSelect = (invoice: string) => {
    onSelect(invoice);
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-xl font-semibold text-gray-900">
            {t('purchaseOrders.selectInvoiceForVerification') || 'Select Purchase Order for Verification'}
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

        {/* Search Bar */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t('purchaseOrders.searchInvoicePlaceholder') || 'Search by PO Number, Invoice, Date, Destination, or SKU...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151] focus:border-[#515151] outline-none"
            />
          </div>
        </div>

        {/* Invoice List */}
        <div className="overflow-y-auto max-h-[calc(90vh-250px)]">
          {filteredInvoices.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              {searchQuery
                ? t('purchaseOrders.noInvoicesMatchSearch') || 'No invoices match your search.'
                : t('purchaseOrders.allOrdersVerified') || 'All purchase orders are already verified.'}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredInvoices.map((inv) => {
                const supplier = suppliers.find(s => s.id === inv.supplierId);
                const poNumber = formatPONumber(inv.invoice);
                const invoiceDate = inv.purchaseDate.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                });

                return (
                  <button
                    key={inv.invoice}
                    onClick={() => handleSelect(inv.invoice)}
                    className="w-full px-6 py-4 text-left hover:bg-gray-50 transition-colors focus:outline-none focus:bg-gray-50"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-semibold text-gray-900">{poNumber}</span>
                          <span className="text-sm text-gray-500">•</span>
                          <span className="text-sm text-gray-600">{inv.invoice}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">{t('purchaseOrders.supplier') || 'Supplier'}:</span>{' '}
                            <span>{supplier?.name || t('purchaseOrders.unknownSupplier') || 'Unknown'}</span>
                          </div>
                          <div>
                            <span className="font-medium">{t('purchaseOrders.invoiceDate') || 'Invoice Date'}:</span>{' '}
                            <span>{invoiceDate}</span>
                          </div>
                          <div>
                            <span className="font-medium">{t('purchaseOrders.destination') || 'Destination'}:</span>{' '}
                            <span>{inv.destinationStock}</span>
                          </div>
                          <div>
                            <span className="font-medium">{t('purchaseOrders.items') || 'Items'}:</span>{' '}
                            <span>{inv.orders.length}</span>
                          </div>
                        </div>
                      </div>
                      <svg
                        className="w-5 h-5 text-gray-400 ml-4 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

