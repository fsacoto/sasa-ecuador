'use client';

import { useState, useEffect, useRef } from 'react';
import { SalesInvoice, SalesInvoiceLine, InventoryItem, Client } from '../types';
import { getAllInvoices, updateInvoice } from '../services/invoicesService';
import { getAllClients } from '../services/clientsService';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';

export default function InvoiceTracking() {
  const { user } = useAuth();
  const { inventory, updateInventoryItem, purchaseOrders } = useInventory();
  const editDropdownRef = useRef<HTMLDivElement>(null);
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [uniqueClients, setUniqueClients] = useState<{id: string, name: string}[]>([]);
  const [filters, setFilters] = useState({
    clientId: '',
    paymentStatus: '',
    deliveryStatus: '',
    dateFrom: '',
    dateTo: ''
  });
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [showModal, setShowModal] = useState(false);
  
  // Edit state
  const [editingInvoice, setEditingInvoice] = useState<SalesInvoice | null>(null);
  const [editItems, setEditItems] = useState<SalesInvoiceLine[]>([]);
  const [editDiscountType, setEditDiscountType] = useState<'percentage' | 'flat'>('percentage');
  const [editDiscountValue, setEditDiscountValue] = useState(0);
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editPaymentComment, setEditPaymentComment] = useState('');
  
  // Search state for edit modal
  const [editSearchTerm, setEditSearchTerm] = useState('');
  const [editShowDropdown, setEditShowDropdown] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, []);

  // Extract unique clients from invoices
  useEffect(() => {
    if (invoices.length > 0) {
      const uniqueClientMap = new Map<string, string>();
      invoices.forEach(invoice => {
        if (invoice.clientId && invoice.clientName) {
          uniqueClientMap.set(invoice.clientId, invoice.clientName);
        }
      });
      const uniqueClientsArray = Array.from(uniqueClientMap.entries()).map(([id, name]) => ({
        id,
        name
      }));
      setUniqueClients(uniqueClientsArray);
      console.log('Unique clients from invoices:', uniqueClientsArray);
    }
  }, [invoices]);

  // Filter inventory for edit modal
  const getFilteredEditInventory = () => {
    if (!editSearchTerm.trim()) return [];
    const searchLower = editSearchTerm.toLowerCase();
    return inventory.filter(item =>
      item.sku.toLowerCase().includes(searchLower) ||
      item.name.toLowerCase().includes(searchLower) ||
      item.description?.toLowerCase().includes(searchLower)
    ).slice(0, 10);
  };

  const addProductToEditItems = (product: InventoryItem) => {
    // Calculate unit price from landed cost
    let unitPrice = 25; // Default price
    
    if (product.linkedPurchaseOrders.length > 0) {
      const linkedOrders = purchaseOrders.filter(po => 
        product.linkedPurchaseOrders.includes(po.id) && po.status === 'Verified'
      );
      
      if (linkedOrders.length > 0) {
        const avgLandedCost = linkedOrders.reduce((sum, po) => sum + po.landedCostPerUnit, 0) / linkedOrders.length;
        unitPrice = avgLandedCost * 2.5;
      }
    }

    const maxQuantity = product.ecuadorStock + product.usaStock; // Total available stock

    const newItem: SalesInvoiceLine & { maxQuantity?: number } = {
      sku: product.sku,
      description: product.description || product.name,
      line: product.line,
      category: product.category,
      quantity: 1,
      unitPrice: unitPrice,
      totalPrice: unitPrice,
      maxQuantity: maxQuantity
    };

    setEditItems([...editItems, newItem]);
    setEditSearchTerm('');
    setEditShowDropdown(false);
  };

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

  const openEditModal = (invoice: SalesInvoice) => {
    setEditingInvoice(invoice);
    setEditItems([...invoice.items]);
    setEditDiscountType(invoice.discountType || 'percentage');
    setEditDiscountValue(invoice.discountValue || 0);
    setEditPaymentMethod(invoice.paymentMethod || '');
    setEditPaymentComment(invoice.paymentComment || '');
  };

  const closeEditModal = () => {
    setEditingInvoice(null);
    setEditItems([]);
    setEditDiscountType('percentage');
    setEditDiscountValue(0);
    setEditPaymentMethod('');
    setEditPaymentComment('');
  };

  const handleEditItem = (index: number, field: string, value: any) => {
    const updatedItems = [...editItems];
    if (field === 'quantity' || field === 'unitPrice') {
      let parsedValue = parseFloat(value) || 0;
      
      // For quantity, validate against max stock
      if (field === 'quantity') {
        const item = updatedItems[index] as any;
        if (item.maxQuantity) {
          parsedValue = Math.min(Math.max(1, parsedValue), item.maxQuantity);
          if (parseFloat(value) > item.maxQuantity) {
            alert(`Cannot exceed available stock. Maximum quantity is ${item.maxQuantity}`);
          }
        }
      }
      
      updatedItems[index] = {
        ...updatedItems[index],
        [field]: parsedValue
      };
      updatedItems[index].totalPrice = updatedItems[index].quantity * updatedItems[index].unitPrice;
    } else {
      updatedItems[index] = {
        ...updatedItems[index],
        [field]: value
      };
    }
    setEditItems(updatedItems);
  };

  const removeEditItem = (index: number) => {
    setEditItems(editItems.filter((_, i) => i !== index));
  };

  const addEditItem = () => {
    setEditItems([...editItems, {
      sku: '',
      description: '',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      line: '',
      category: ''
    }]);
  };

  const calculateEditSubtotal = () => {
    return editItems.reduce((sum, item) => sum + item.totalPrice, 0);
  };

  const calculateEditDiscount = () => {
    const subtotal = calculateEditSubtotal();
    if (editDiscountType === 'percentage') {
      return (subtotal * editDiscountValue) / 100;
    }
    return editDiscountValue;
  };

  const calculateEditGrandTotal = () => {
    return calculateEditSubtotal() - calculateEditDiscount();
  };

  const saveInvoiceEdit = async () => {
    if (!editingInvoice) return;
    
    if (editItems.length === 0) {
      alert('Invoice must have at least one item');
      return;
    }

    try {
      const updatedInvoice: any = {
        items: editItems,
        subtotal: calculateEditSubtotal(),
        discountType: editDiscountType,
        discountValue: editDiscountValue,
        discountTotal: calculateEditDiscount(),
        grandTotal: calculateEditGrandTotal(),
        remainingBalance: editingInvoice.paymentStatus === 'Paid' ? 0 : (calculateEditGrandTotal() - (editingInvoice.amountPaid || 0))
      };

      if (editPaymentMethod) {
        updatedInvoice.paymentMethod = editPaymentMethod;
      }
      if (editPaymentComment) {
        updatedInvoice.paymentComment = editPaymentComment;
      }

      await updateInvoice(editingInvoice.id, updatedInvoice);
      alert('Invoice updated successfully');
      closeEditModal();
      loadInvoices();
    } catch (error) {
      console.error('Error updating invoice:', error);
      alert('Error updating invoice');
    }
  };

  const handleUpdateDelivery = async (invoice: SalesInvoice, status: 'Pending' | 'Partially Delivered' | 'Delivered' | 'Canceled') => {
    if (!confirm(`Change delivery status to ${status}?`)) return;

    try {
      const updateData: any = {
        deliveryStatus: status,
      };
      
      if (status === 'Delivered' || status === 'Partially Delivered') {
        updateData.deliveryDate = new Date();
      }

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

      const updateData: any = {
        paymentStatus: status,
        amountPaid: paymentAmount,
        remainingBalance: remainingBalance,
      };
      
      if (status === 'Paid') {
        updateData.paymentDate = new Date();
      }

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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Customer</label>
            <select
              value={filters.clientId}
              onChange={(e) => setFilters({ ...filters, clientId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All Customers</option>
              {uniqueClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
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
                  onClick={() => openEditModal(invoice)}
                  className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors text-sm"
                >
                  Edit Invoice
                </button>
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

      {/* Edit Modal */}
      {editingInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">Edit Invoice - {editingInvoice.invoiceNumber}</h3>
            
            {/* Items Table */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-semibold">Items</h4>
              </div>
              
              {/* Inventory Search */}
              <div className="mb-4 relative" ref={editDropdownRef}>
                <label className="block text-sm font-medium text-gray-700 mb-2">Add Product from Inventory</label>
                <input
                  type="text"
                  placeholder="Search by SKU, name, or description..."
                  value={editSearchTerm}
                  onChange={(e) => {
                    setEditSearchTerm(e.target.value);
                    setEditShowDropdown(true);
                  }}
                  onFocus={() => setEditShowDropdown(true)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                />
                
                {editShowDropdown && getFilteredEditInventory().length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {getFilteredEditInventory().map((product) => (
                      <div
                        key={product.id}
                        onClick={() => addProductToEditItems(product)}
                        className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <div className="font-mono text-sm font-semibold text-[#4f0c1b]">{product.sku}</div>
                        <div className="text-sm text-gray-600">{product.name}</div>
                        <div className="text-xs text-gray-500">Stock: {product.ecuadorStock} | {product.category} - {product.line}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left">SKU</th>
                      <th className="px-2 py-2 text-left">Description</th>
                      <th className="px-2 py-2 text-center">Qty</th>
                      <th className="px-2 py-2 text-right">Unit Price</th>
                      <th className="px-2 py-2 text-right">Total</th>
                      <th className="px-2 py-2 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editItems.map((item, index) => (
                      <tr key={index} className="border-t">
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={item.sku}
                            onChange={(e) => handleEditItem(index, 'sku', e.target.value)}
                            className="w-full px-2 py-1 border rounded"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => handleEditItem(index, 'description', e.target.value)}
                            className="w-full px-2 py-1 border rounded"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-col items-center gap-1">
                            <input
                              type="number"
                              min="1"
                              max={(item as any).maxQuantity || undefined}
                              value={item.quantity}
                              onChange={(e) => handleEditItem(index, 'quantity', e.target.value)}
                              className="w-20 px-2 py-1 border rounded text-center"
                            />
                            {(item as any).maxQuantity && (
                              <div className="text-xs text-gray-500">
                                Max: {(item as any).maxQuantity}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => handleEditItem(index, 'unitPrice', e.target.value)}
                            className="w-24 px-2 py-1 border rounded text-right"
                          />
                        </td>
                        <td className="px-2 py-2 text-right font-semibold">
                          ${item.totalPrice.toFixed(2)}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            onClick={() => removeEditItem(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Discount */}
            <div className="mb-6 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Discount Type</label>
                <select
                  value={editDiscountType}
                  onChange={(e) => setEditDiscountType(e.target.value as 'percentage' | 'flat')}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat">Flat Amount</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Discount Value</label>
                <input
                  type="number"
                  value={editDiscountValue}
                  onChange={(e) => setEditDiscountValue(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                />
              </div>
            </div>

            {/* Payment Method */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Payment Method</label>
              <select
                value={editPaymentMethod}
                onChange={(e) => setEditPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              >
                <option value="">Select payment method...</option>
                <option value="card">💳 Card</option>
                <option value="cash">💵 Cash</option>
                <option value="transfer">🏦 Wire Transfer</option>
              </select>
            </div>

            {/* Payment Comment */}
            {editPaymentMethod && (
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Payment Notes</label>
                <textarea
                  value={editPaymentComment}
                  onChange={(e) => setEditPaymentComment(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                />
              </div>
            )}

            {/* Totals */}
            <div className="border-t pt-4 mb-6">
              <div className="flex justify-between mb-2">
                <span>Subtotal:</span>
                <span className="font-semibold">${calculateEditSubtotal().toFixed(2)}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span>Discount:</span>
                <span className="font-semibold">${calculateEditDiscount().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold text-[#4f0c1b] pt-2 border-t">
                <span>Grand Total:</span>
                <span>${calculateEditGrandTotal().toFixed(2)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={saveInvoiceEdit}
                className="flex-1 px-4 py-2 bg-[#4f0c1b] text-white rounded-lg hover:bg-[#5c1327]"
              >
                Save Changes
              </button>
              <button
                onClick={closeEditModal}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
