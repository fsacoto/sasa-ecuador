'use client';

import { useState, useMemo } from 'react';
import POModalShell from './ui/POModalShell';
import { PurchaseOrder, Supplier } from '../types';
import { useTranslation } from '../context/TranslationContext';
import { formatDateDMY, formatDateMedium } from '../utils/formatDate';
import { formatPONumber } from '../utils/purchaseOrderFormat';

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
  onSelect,
}: POVerificationModalProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const unverifiedInvoices = useMemo(() => {
    const invoiceMap = new Map<
      string,
      {
        orders: PurchaseOrder[];
        hasUnverified: boolean;
        supplierId: string;
        purchaseDate: Date;
      }
    >();

    purchaseOrders.forEach((order) => {
      if (!invoiceMap.has(order.invoice)) {
        invoiceMap.set(order.invoice, {
          orders: [],
          hasUnverified: false,
          supplierId: order.supplierId,
          purchaseDate: order.purchaseDate,
        });
      }
      const invoiceData = invoiceMap.get(order.invoice)!;
      invoiceData.orders.push(order);
      if (order.status !== 'Verified') {
        invoiceData.hasUnverified = true;
      }
    });

    const invoices: Array<{
      invoice: string;
      orders: PurchaseOrder[];
      supplierId: string;
      purchaseDate: Date;
    }> = [];

    invoiceMap.forEach((data, invoice) => {
      if (data.hasUnverified) {
        invoices.push({
          invoice,
          orders: data.orders,
          supplierId: data.supplierId,
          purchaseDate: data.purchaseDate,
        });
      }
    });

    return invoices.sort((a, b) => a.invoice.localeCompare(b.invoice));
  }, [purchaseOrders]);

  const filteredInvoices = useMemo(() => {
    if (!searchQuery.trim()) {
      return unverifiedInvoices;
    }

    const query = searchQuery.toLowerCase();
    return unverifiedInvoices.filter((inv) => {
      const supplier = suppliers.find((s) => s.id === inv.supplierId);
      const supplierName = supplier?.name.toLowerCase() || '';
      const invoiceLower = inv.invoice.toLowerCase();
      const purchaseDateStr = formatDateDMY(inv.purchaseDate).toLowerCase();

      const hasMatchingSku = inv.orders.some((order) => order.sku?.toLowerCase().includes(query));

      return (
        invoiceLower.includes(query) ||
        supplierName.includes(query) ||
        purchaseDateStr.includes(query) ||
        hasMatchingSku
      );
    });
  }, [unverifiedInvoices, searchQuery, suppliers]);

  return (
    <POModalShell
      title={t('purchaseOrders.selectInvoiceForVerification') || 'Select Purchase Order for Verification'}
      titleId="po-verification-title"
      onClose={onClose}
    >
      <div className="border-b border-gray-100 px-6 py-4">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder={
              t('purchaseOrders.searchInvoicePlaceholder') ||
              'Search by PO Number, Invoice, Date, Destination, or SKU...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 outline-none focus:border-[#515151] focus:ring-2 focus:ring-[#515151]"
          />
        </div>
      </div>

      <div className="max-h-[calc(90vh-250px)] overflow-y-auto">
        {filteredInvoices.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            {searchQuery
              ? t('purchaseOrders.noInvoicesMatchSearch') || 'No invoices match your search.'
              : t('purchaseOrders.allOrdersVerified') || 'All purchase orders are already verified.'}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredInvoices.map((inv) => {
              const supplier = suppliers.find((s) => s.id === inv.supplierId);
              const poNumber = formatPONumber(inv.invoice);
              const invoiceDate = formatDateMedium(inv.purchaseDate);

              return (
                <button
                  key={inv.invoice}
                  type="button"
                  onClick={() => onSelect(inv.invoice)}
                  className="sasa-modal-row w-full px-6 py-4 text-left transition-colors focus:outline-none"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-3">
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
                          <span className="font-medium">{t('purchaseOrders.invoiceDate') || 'Invoice Date'}</span>{' '}
                          <span>{invoiceDate}</span>
                        </div>
                        <div>
                          <span className="font-medium">{t('purchaseOrders.items') || 'Items'}:</span>{' '}
                          <span>{inv.orders.length}</span>
                        </div>
                      </div>
                    </div>
                    <svg
                      className="ml-4 h-5 w-5 shrink-0 text-gray-400"
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
    </POModalShell>
  );
}
