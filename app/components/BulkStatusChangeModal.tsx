'use client';

import { useState } from 'react';
import { PurchaseOrder, PurchaseOrderStatus } from '../types';
import ConfirmDialog from './ui/ConfirmDialog';
import { useTranslation } from '../context/TranslationContext';

interface BulkStatusChangeModalProps {
  purchaseOrders: PurchaseOrder[];
  onClose: () => void;
  onBulkStatusChange: (orderIds: string[], newStatus: PurchaseOrderStatus) => void;
}

export default function BulkStatusChangeModal({ purchaseOrders, onClose, onBulkStatusChange }: BulkStatusChangeModalProps) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [newStatus, setNewStatus] = useState<PurchaseOrderStatus>('Ordered');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Get unique suppliers
  const suppliers = [...new Set(purchaseOrders.map(order => order.supplierId))];
  
  // Get unique statuses
  const statuses = [...new Set(purchaseOrders.map(order => order.status))];

  // Filter orders based on search and filters
  const filteredOrders = purchaseOrders.filter(order => {
    const matchesSearch = order.invoice.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         order.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSupplier = filterSupplier === 'all' || order.supplierId === filterSupplier;
    const matchesStatus = filterStatus === 'all' || order.status === filterStatus;
    
    return matchesSearch && matchesSupplier && matchesStatus;
  });

  // Group orders by invoice
  const ordersByInvoice = filteredOrders.reduce((acc, order) => {
    if (!acc[order.invoice]) {
      acc[order.invoice] = [];
    }
    acc[order.invoice].push(order);
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
    const allInvoices = Object.keys(ordersByInvoice);
    setSelectedInvoices(allInvoices);
  };

  const handleSelectNone = () => {
    setSelectedInvoices([]);
  };

  const handleStatusChange = () => {
    if (selectedInvoices.length === 0) {
      alert(t('purchaseOrders.selectAtLeastOneInvoice') || 'Please select at least one invoice.');
      return;
    }

    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    const orderIds: string[] = [];
    selectedInvoices.forEach(invoice => {
      ordersByInvoice[invoice].forEach(order => {
        orderIds.push(order.id);
      });
    });
    
    onBulkStatusChange(orderIds, newStatus);
    setConfirmOpen(false);
    onClose();
  };

  const totalOrders = selectedInvoices.reduce((total, invoice) => total + ordersByInvoice[invoice].length, 0);

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 duration-300">
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">{t('purchaseOrders.bulkStatusChange') || 'Bulk Status Change'}</h3>
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

          <div className="overflow-y-auto max-h-[calc(90vh-8rem)] p-6 space-y-4">
            {/* Status Selection */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('purchaseOrders.selectNewStatus') || 'Select New Status'}
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as PurchaseOrderStatus)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent text-sm bg-white"
              >
                <option value="Ordered">📦 {t('purchaseOrders.statusOrdered') || 'Ordered'}</option>
                <option value="Shipped">🚚 {t('purchaseOrders.statusShipped') || 'Shipped'}</option>
                <option value="Received">📥 {t('purchaseOrders.statusReceived') || 'Received'}</option>
              </select>
              <p className="text-xs text-gray-500 mt-2">
                {t('purchaseOrders.bulkStatusChangeDesc') || 'This will change the status of all orders in the selected invoices to the chosen status. Verification must be done individually.'}
              </p>
            </div>

            {/* Search and Filters */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder={t('purchaseOrders.searchInvoices') || 'Search by invoice or description...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent text-sm"
                  />
                </div>
                <div className="w-48">
                  <select
                    value={filterSupplier}
                    onChange={(e) => setFilterSupplier(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent text-sm"
                  >
                    <option value="all">{t('purchaseOrders.allSuppliers') || 'All Suppliers'}</option>
                    {suppliers.map(supplierId => (
                      <option key={supplierId} value={supplierId}>
                        {supplierId}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-32">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent text-sm"
                  >
                    <option value="all">{t('purchaseOrders.allStatus') || 'All Status'}</option>
                    {statuses.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={handleSelectAll}
                  className="px-3 py-1.5 text-sm text-[#515151] hover:bg-[#515151] hover:text-white border border-[#515151] rounded-lg transition-colors"
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
                  {t('purchaseOrders.selected') || 'Selected'}: <span className="font-semibold ml-1">{selectedInvoices.length}</span> {t('purchaseOrders.invoices') || 'invoices'} ({totalOrders} {t('purchaseOrders.orders') || 'orders'})
                </div>
              </div>
            </div>

            {/* Invoice List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {Object.keys(ordersByInvoice).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {t('purchaseOrders.noInvoicesFound') || 'No invoices found'}
                </div>
              ) : (
                Object.entries(ordersByInvoice).map(([invoice, orders]) => (
                  <div
                    key={invoice}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      selectedInvoices.includes(invoice)
                        ? 'border-[#515151] bg-[#515151]/5'
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
                        className="mt-1 w-4 h-4 text-[#515151] border-gray-300 rounded focus:ring-[#515151]"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-gray-900">{invoice}</h4>
                          <span className="text-xs text-gray-500">
                            {orders.length} {orders.length === 1 ? t('purchaseOrders.order') : t('purchaseOrders.orders')}
                          </span>
                        </div>
                        <div className="mt-2 space-y-1">
                          {orders.slice(0, 3).map(order => (
                            <div key={order.id} className="text-sm text-gray-600">
                              {order.description} - <span className="font-medium">{order.status}</span>
                            </div>
                          ))}
                          {orders.length > 3 && (
                            <div className="text-xs text-gray-400">
                              +{orders.length - 3} {t('purchaseOrders.more') || 'more'}...
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
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
              onClick={handleStatusChange}
              disabled={selectedInvoices.length === 0}
              className="px-4 py-2 bg-[#515151] text-white hover:bg-[#000000] rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('purchaseOrders.changeStatus') || 'Change Status'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t('purchaseOrders.confirmBulkStatusChange') || 'Confirm Status Change'}
        description={
          t('purchaseOrders.bulkStatusChangeConfirmDesc')
            ?.replace('{count}', totalOrders.toString())
            ?.replace('{invoiceCount}', selectedInvoices.length.toString())
            ?.replace('{status}', newStatus) || 
          `Are you sure you want to change the status of ${totalOrders} order(s) from ${selectedInvoices.length} invoice(s) to "${newStatus}"?`
        }
        confirmText={t('common.confirm') || 'Confirm'}
        cancelText={t('common.cancel') || 'Cancel'}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

