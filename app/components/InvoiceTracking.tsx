'use client';

import { useState, useEffect } from 'react';
import { SalesInvoice } from '../types';
import { getAllInvoices, updateInvoice } from '../services/invoicesService';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';

export default function InvoiceTracking() {
  const { user } = useAuth();
  const { inventory, updateInventoryItem } = useInventory();
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    clientId: '',
    paymentStatus: '',
    deliveryStatus: '',
    dateFrom: '',
    dateTo: ''
  });
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const filterParams = {
        clientId: filters.clientId || undefined,
        paymentStatus: filters.paymentStatus || undefined,
        deliveryStatus: filters.deliveryStatus || undefined,
        dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
      };
      const data = await getAllInvoices(filterParams);
      setInvoices(data);
    } catch (error) {
      console.error('Error loading invoices:', error);
      alert('Error loading invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [filters]);

  const handleUpdateDelivery = async (invoice: SalesInvoice, status: 'Pending' | 'Partially Delivered' | 'Delivered' | 'Canceled') => {
    if (!confirm(`Change delivery status to ${status}?`)) return;

    try {
      const updateData: Partial<SalesInvoice> = {
        deliveryStatus: status,
        deliveryDate: status === 'Delivered' || status === 'Partially Delivered' ? new Date() : undefined
      };

      await updateInvoice(invoice.id, updateData);

      // Update inventory if delivered or partially delivered
      if (status === 'Delivered' || status === 'Partially Delivered') {
        for (const item of invoice.items) {
          const inventoryItem = inventory.find(inv => inv.sku === item.sku);
          if (inventoryItem) {
            const newEcuadorStock = Math.max(0, inventoryItem.ecuadorStock - item.quantity);
            await updateInventoryItem(inventoryItem.id, {
              ecuadorStock: newEcuadorStock
            });
          }
        }
      }

      alert('Delivery status updated successfully');
      loadInvoices();
    } catch (error) {
      console.error('Error updating delivery:', error);
      alert('Error updating delivery status');
    }
  };

  const handleUpdatePayment = async (invoice: SalesInvoice, status: 'Unpaid' | 'Partially Paid' | 'Paid', amountPaid?: number) => {
    try {
      const paymentAmount = amountPaid || invoice.grandTotal;
      const remainingBalance = invoice.grandTotal - paymentAmount;

      const updateData: Partial<SalesInvoice> = {
        paymentStatus: status,
        amountPaid: paymentAmount,
        remainingBalance: remainingBalance,
        paymentDate: status === 'Paid' ? new Date() : invoice.paymentDate
      };

      await updateInvoice(invoice.id, updateData);
      alert('Payment status updated successfully');
      loadInvoices();
    } catch (error) {
      console.error('Error updating payment:', error);
      alert('Error updating payment status');
    }
  };

  const calculateMetrics = () => {
    return {
      totalInvoices: invoices.length,
      unpaidInvoices: invoices.filter(inv => inv.paymentStatus === 'Unpaid').length,
      totalCollected: invoices.reduce((sum, inv) => sum + inv.amountPaid, 0),
      totalPending: invoices.reduce((sum, inv) => sum + inv.remainingBalance, 0)
    };
  };

  const generatePDF = (invoice: SalesInvoice) => {
    // Helper function to pad strings for table formatting
    const pad = (str: string, length: number) => (str || '').substring(0, length).padEnd(length);
    
    // Calculate column widths
    const colWidths = {
      sku: 12,
      description: 30,
      quantity: 10,
      unitPrice: 12,
      total: 12
    };
    
    // Create table header
    const header = `${pad('SKU', colWidths.sku)} | ${pad('Descripción', colWidths.description)} | ${pad('Cantidad', colWidths.quantity)} | ${pad('Precio Unit', colWidths.unitPrice)} | ${pad('Total', colWidths.total)}`;
    const separator = '-'.repeat(header.length);
    
    // Create table rows
    const rows = invoice.items.map(item => {
      return `${pad(item.sku, colWidths.sku)} | ${pad(item.description || '', colWidths.description)} | ${pad(String(item.quantity), colWidths.quantity)} | ${pad(`$${item.unitPrice.toFixed(2)}`, colWidths.unitPrice)} | ${pad(`$${item.totalPrice.toFixed(2)}`, colWidths.total)}`;
    }).join('\n');
    
    // Get client phone and email from address field or create separate fields
    const addressParts = invoice.clientAddress.split(', ');
    const city = addressParts.length > 1 ? addressParts[addressParts.length - 2] : '';
    const country = addressParts.length > 0 ? addressParts[addressParts.length - 1] : '';
    const streetAddress = addressParts.length > 2 ? addressParts.slice(0, -2).join(', ') : invoice.clientAddress;
    
    // Create PDF document
    let pdfContent = `

${'='.repeat(80)}
                      NOTA DE VENTA
${'='.repeat(80)}

Empresa: SASA
Cliente: ${invoice.clientName}
Dirección: ${streetAddress}${city ? `, ${city}` : ''}${country ? `, ${country}` : ''}
Fecha: ${new Date(invoice.date).toLocaleDateString()}
Número de Factura: ${invoice.invoiceNumber}

${'='.repeat(80)}
                      DETALLE DE PRODUCTOS
${'='.repeat(80)}

${header}
${separator}
${rows}

${'='.repeat(80)}
                                 TOTALES
${'='.repeat(80)}

${pad('', colWidths.sku + colWidths.description + colWidths.quantity + colWidths.unitPrice + 4)} | ${pad('SUBTOTAL:', colWidths.total)} $${invoice.subtotal.toFixed(2)}
${pad('', colWidths.sku + colWidths.description + colWidths.quantity + colWidths.unitPrice + 4)} | ${pad('DESCUENTO:', colWidths.total)} $${invoice.discountTotal.toFixed(2)}
${separator}
${pad('', colWidths.sku + colWidths.description + colWidths.quantity + colWidths.unitPrice + 4)} | ${pad('TOTAL:', colWidths.total)} $${invoice.grandTotal.toFixed(2)}

${invoice.paymentMethod ? `
${'='.repeat(80)}
                        MÉTODO DE PAGO
${'='.repeat(80)}

Método: ${invoice.paymentMethod.charAt(0).toUpperCase() + invoice.paymentMethod.slice(1)}
${invoice.paymentComment ? `Notas: ${invoice.paymentComment}` : ''}
` : ''}

${'='.repeat(80)}
                    Gracias por su compra
${'='.repeat(80)}

    `;

    // Create downloadable text file
    const blob = new Blob([pdfContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.invoiceNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const metrics = calculateMetrics();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Invoice Tracking</h2>
          <p className="text-sm text-gray-500 mt-1">Track invoice delivery and payment status</p>
        </div>
      </div>

      {/* Summary Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Invoices</div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{metrics.totalInvoices}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Unpaid Invoices</div>
          <div className="text-2xl font-bold text-red-600 mt-2">{metrics.unpaidInvoices}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Collected</div>
          <div className="text-2xl font-bold text-green-600 mt-2">${metrics.totalCollected.toFixed(2)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending Collection</div>
          <div className="text-2xl font-bold text-amber-600 mt-2">${metrics.totalPending.toFixed(2)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Status</label>
            <select
              value={filters.paymentStatus}
              onChange={(e) => setFilters({ ...filters, paymentStatus: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All</option>
              <option value="Unpaid">Unpaid</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Paid">Paid</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Status</label>
            <select
              value={filters.deliveryStatus}
              onChange={(e) => setFilters({ ...filters, deliveryStatus: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All</option>
              <option value="Pending">Pending</option>
              <option value="Partially Delivered">Partially Delivered</option>
              <option value="Delivered">Delivered</option>
              <option value="Canceled">Canceled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Invoices List */}
      {loading ? (
        <div className="text-center py-12">Loading invoices...</div>
      ) : invoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No invoices found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {invoices.map((invoice) => (
            <div key={invoice.id} className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{invoice.invoiceNumber}</h3>
                  <div className="text-sm text-gray-500 mt-1">
                    {invoice.clientName} • {new Date(invoice.date).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-[#4f0c1b]">${invoice.grandTotal.toFixed(2)}</div>
                  <div className="text-sm text-gray-500">{invoice.currency}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-4">
                <div>
                  <div className="text-xs text-gray-500 uppercase mb-1">Delivery Status</div>
                  <div className="flex items-center gap-2">
                    <select
                      value={invoice.deliveryStatus}
                      onChange={(e) => handleUpdateDelivery(invoice, e.target.value as any)}
                      className="px-3 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="Pending">Pending</option>
                      <option value="Partially Delivered">Partially Delivered</option>
                      <option value="Delivered">Delivered</option>
                      <option value="Canceled">Canceled</option>
                    </select>
                    {invoice.deliveryDate && (
                      <span className="text-xs text-gray-500">
                        {new Date(invoice.deliveryDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {invoice.deliveryNotes && (
                    <div className="text-xs text-gray-600 mt-1">{invoice.deliveryNotes}</div>
                  )}
                </div>

                <div>
                  <div className="text-xs text-gray-500 uppercase mb-1">Payment Status</div>
                  <div className="space-y-1">
                    <select
                      value={invoice.paymentStatus}
                      onChange={(e) => handleUpdatePayment(invoice, e.target.value as any)}
                      className="px-3 py-1 border border-gray-300 rounded text-sm w-full"
                    >
                      <option value="Unpaid">Unpaid</option>
                      <option value="Partially Paid">Partially Paid</option>
                      <option value="Paid">Paid</option>
                    </select>
                    {invoice.paymentStatus === 'Partially Paid' && (
                      <div className="text-xs text-gray-600">
                        Paid: ${invoice.amountPaid.toFixed(2)} / Remaining: ${invoice.remainingBalance.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const amountPaid = prompt(`Enter amount paid (Total: $${invoice.grandTotal}):`);
                    if (amountPaid) {
                      handleUpdatePayment(invoice, 'Partially Paid', parseFloat(amountPaid));
                    }
                  }}
                  className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                >
                  Register Payment
                </button>
                <button
                  onClick={() => handleUpdateDelivery(invoice, 'Delivered')}
                  className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm"
                >
                  Mark as Delivered
                </button>
                <button
                  onClick={() => generatePDF(invoice)}
                  className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors text-sm"
                >
                  Generate PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

