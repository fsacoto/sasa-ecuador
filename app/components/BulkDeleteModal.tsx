'use client';

import { useState } from 'react';
import { PurchaseOrder } from '../types';
import ConfirmDialog from './ui/ConfirmDialog';
import { useTranslation } from '../context/TranslationContext';

interface BulkDeleteModalProps {
  purchaseOrders: PurchaseOrder[];
  onClose: () => void;
  onBulkDelete: (invoiceNumbers: string[]) => void;
}

export default function BulkDeleteModal({ purchaseOrders, onClose, onBulkDelete }: BulkDeleteModalProps) {
  const { t } = useTranslation();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingInvoices, setPendingInvoices] = useState<string[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
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

  const handleDelete = () => {
    console.log('Delete button clicked');
    console.log('Selected invoices:', selectedInvoices);
    console.log('Orders by invoice:', ordersByInvoice);
    
    if (selectedInvoices.length === 0) {
      alert('Please select at least one invoice to delete.');
      return;
    }

    const totalOrders = selectedInvoices.reduce((total, invoice) => total + ordersByInvoice[invoice].length, 0);
    
    console.log(`Total orders to delete: ${totalOrders} from ${selectedInvoices.length} invoices`);
    
    setPendingInvoices(selectedInvoices);
    setDeleteConfirmOpen(true);
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 duration-300">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Bulk Delete Purchase Orders</h3>
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
          {/* Search and Filters */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search by invoice or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                />
              </div>
              <div className="w-48">
                <select
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                >
                  <option value="all">All Suppliers</option>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                >
                  <option value="all">All Status</option>
                  {statuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleSelectAll}
                className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              >
                Select All
              </button>
              <button
                onClick={handleSelectNone}
                className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              >
                Select None
              </button>
              <span className="text-sm text-gray-600 self-center">
                {selectedInvoices.length} of {Object.keys(ordersByInvoice).length} invoices selected
              </span>
            </div>
          </div>

          {/* Orders List */}
          <div className="space-y-2">
            {Object.keys(ordersByInvoice).length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No purchase orders found matching your criteria.
              </div>
            ) : (
              Object.entries(ordersByInvoice).map(([invoice, orders]) => (
                <div key={invoice} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedInvoices.includes(invoice)}
                        onChange={() => handleInvoiceToggle(invoice)}
                        className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-4">
                          <span className="font-semibold text-gray-900">Invoice: {invoice}</span>
                          <span className="text-sm text-gray-600">
                            {orders.length} order{orders.length !== 1 ? 's' : ''}
                          </span>
                          <span className="text-sm text-gray-600">
                            Total: ${orders.reduce((sum, order) => sum + order.totalCostWithDiscount, 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </label>
                  </div>
                  
                  <div className="px-4 py-2">
                    <div className="space-y-1">
                      {orders.map(order => (
                        <div key={order.id} className="flex items-center gap-4 text-sm text-gray-600">
                          <span className="w-32 truncate">{order.description}</span>
                          <span className="w-20">{order.quantity} units</span>
                          <span className="w-20">${order.costPerUnitWithDiscount.toFixed(2)}</span>
                          <span className="w-20">{order.status}</span>
                          <span className="w-20">{order.destinationStock}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-6 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all font-medium text-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={selectedInvoices.length === 0}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl transition-all font-medium shadow-sm hover:shadow active:scale-95"
          >
            Delete {selectedInvoices.length} Invoice{selectedInvoices.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>

      {pendingInvoices.length > 0 && (
        <ConfirmDialog
          open={deleteConfirmOpen}
          title={`⚠️ ${t('common.deletePurchaseOrders')}`}
          description={t('common.bulkDeleteWarning')
            .replace('{totalOrders}', pendingInvoices.reduce((total, invoice) => total + ordersByInvoice[invoice].length, 0).toString())
            .replace('{invoiceCount}', pendingInvoices.length.toString())}
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          confirmVariant="danger"
          onConfirm={() => {
            console.log('User confirmed deletion, calling onBulkDelete');
            onBulkDelete(pendingInvoices);
            setPendingInvoices([]);
            setDeleteConfirmOpen(false);
            onClose();
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
