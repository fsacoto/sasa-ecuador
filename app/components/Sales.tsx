'use client';

import { useState, useEffect, useRef } from 'react';
import { SalesInvoiceLine, Client, InventoryItem, SalesInvoice } from '../types';
import { getAllClients } from '../services/clientsService';
import { createInvoice } from '../services/invoicesService';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';

interface InvoiceLineWithDetails extends SalesInvoiceLine {
  line?: string;
  category?: string;
  maxQuantity: number;
  availableStock: number;
}

export default function Sales() {
  const { user, hasPermission } = useAuth();
  const { inventory, purchaseOrders } = useInventory();
  const { t } = useTranslation();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceLineWithDetails[]>([]);
  const [discountType, setDiscountType] = useState<'percentage' | 'flat'>('percentage');
  const [discountValue, setDiscountValue] = useState(0);
  const [showClientModal, setShowClientModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'transfer' | ''>('');
  const [paymentComment, setPaymentComment] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          searchInputRef.current && !searchInputRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadClients = async () => {
    try {
      const country = user?.role === 'sales' ? 'Ecuador' : undefined;
      const data = await getAllClients(country);
      setClients(data);
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  };

  // Get Ecuador inventory only for sales role
  const getAvailableInventory = () => {
    if (user?.role === 'sales') {
      return inventory.filter(item => item.ecuadorStock > 0);
    }
    return inventory;
  };

  // Filter inventory based on search term
  const getFilteredInventory = () => {
    if (!searchTerm.trim()) return [];
    const searchLower = searchTerm.toLowerCase();
    return getAvailableInventory().filter(item =>
      item.sku.toLowerCase().includes(searchLower) ||
      item.name.toLowerCase().includes(searchLower) ||
      item.description?.toLowerCase().includes(searchLower)
    ).slice(0, 10); // Limit to 10 results
  };

  const addProductToInvoice = (product: InventoryItem) => {
    // Calculate unit price from landed cost (with markup)
    let unitPrice = 25; // Default price
    
    // Try to get average landed cost per unit
    if (product.linkedPurchaseOrders.length > 0) {
      const linkedOrders = purchaseOrders.filter(po => 
        product.linkedPurchaseOrders.includes(po.id) && po.status === 'Verified'
      );
      
      if (linkedOrders.length > 0) {
        const avgLandedCost = linkedOrders.reduce((sum, po) => sum + po.landedCostPerUnit, 0) / linkedOrders.length;
        unitPrice = avgLandedCost * 2.5; // 2.5x markup for sales price
      }
    }

    // Get available stock based on user role
    const availableStock = user?.role === 'sales' ? product.ecuadorStock : (product.ecuadorStock + product.usaStock);

    const newItem: InvoiceLineWithDetails = {
      sku: product.sku,
      description: product.description || product.name,
      line: product.line,
      category: product.category,
      quantity: 1,
      unitPrice: unitPrice,
      totalPrice: unitPrice,
      maxQuantity: availableStock,
      availableStock: availableStock
    };

    setInvoiceItems([...invoiceItems, newItem]);
    setSearchTerm('');
    setShowDropdown(false);
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    const updatedItems = [...invoiceItems];
    const item = updatedItems[index];
    
    // Validate against max quantity
    const validQuantity = Math.min(Math.max(1, quantity), item.maxQuantity);
    
    updatedItems[index].quantity = validQuantity;
    updatedItems[index].totalPrice = updatedItems[index].unitPrice * validQuantity;
    setInvoiceItems(updatedItems);
    
      // Show warning if trying to exceed available stock
    if (quantity > item.maxQuantity) {
      alert(`${t('sales.cannotExceedStock')} ${item.maxQuantity}`);
    }
  };

  const handlePriceChange = (index: number, price: number) => {
    const updatedItems = [...invoiceItems];
    updatedItems[index].unitPrice = price;
    updatedItems[index].totalPrice = price * updatedItems[index].quantity;
    setInvoiceItems(updatedItems);
  };

  const removeItem = (index: number) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
  };

  const calculateSubtotal = () => {
    return invoiceItems.reduce((sum, item) => sum + item.totalPrice, 0);
  };

  const calculateDiscount = () => {
    const subtotal = calculateSubtotal();
    if (discountType === 'percentage') {
      return (subtotal * discountValue) / 100;
    }
    return discountValue;
  };

  const calculateGrandTotal = () => {
    return calculateSubtotal() - calculateDiscount();
  };

  const submitInvoice = async () => {
    if (invoiceItems.length === 0) {
      alert(t('sales.pleaseAddProducts'));
      return;
    }

    try {
      // Invoice number will be auto-generated in createInvoice
      const newInvoice: any = {
        invoiceNumber: 'TEMP', // Will be replaced with sequential number
        clientId: selectedClient?.id || '',
        clientName: selectedClient?.name || 'Walk-in Customer',
        clientAddress: selectedClient ? `${selectedClient.address}, ${selectedClient.city}, ${selectedClient.country}` : '',
        items: invoiceItems,
        subtotal: calculateSubtotal(),
        discountType: discountType,
        discountValue: discountValue,
        discountTotal: calculateDiscount(),
        grandTotal: calculateGrandTotal(),
        date: new Date(invoiceDate),
        notes: '',
        salesAgent: user?.name || user?.email || '',
        currency: 'USD',
        deliveryStatus: 'Pending',
        paymentStatus: 'Unpaid',
        amountPaid: 0,
        remainingBalance: calculateGrandTotal()
      };

      // Only add optional fields if they have values
      if (paymentMethod) {
        newInvoice.paymentMethod = paymentMethod;
      }
      if (paymentComment) {
        newInvoice.paymentComment = paymentComment;
      }

      await createInvoice(newInvoice);
      
      alert(t('sales.invoiceSubmitted'));
      
      // Reset form
      setInvoiceItems([]);
      setSelectedClient(null);
      setPaymentMethod('');
      setPaymentComment('');
      setInvoiceDate(new Date().toISOString().split('T')[0]);
    } catch (error) {
      console.error('Error submitting invoice:', error);
      alert(t('sales.errorSubmitting'));
    }
  };

  const filteredInventory = getFilteredInventory();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">{t('sales.title')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('sales.subtitle')}</p>
        </div>
      </div>

      {/* Client Selection */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{t('sales.clientInformation')}</h3>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">{t('sales.date')}:</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
            />
          </div>
        </div>
        {selectedClient ? (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sales.clientName')}</div>
                  <div className="font-semibold text-gray-900">{selectedClient.name}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sales.country')}</div>
                  <div className="font-medium text-gray-900">{selectedClient.country === 'Ecuador' ? '🇪🇨 Ecuador' : '🇺🇸 USA'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sales.address')}</div>
                  <div className="text-gray-700">{selectedClient.address}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sales.city')}</div>
                  <div className="text-gray-700">{selectedClient.city}</div>
                </div>
                {selectedClient.email && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sales.email')}</div>
                    <div className="text-gray-700">{selectedClient.email}</div>
                  </div>
                )}
                {selectedClient.phone && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sales.phone')}</div>
                    <div className="text-gray-700">{selectedClient.phone}</div>
                  </div>
                )}
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => setShowClientModal(true)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {t('sales.changeClient')}
                </button>
                <button
                  onClick={() => setSelectedClient(null)}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                >
                  {t('sales.clear')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <span className="text-gray-500 italic">{t('sales.walkInCustomer')}</span>
            <button
              onClick={() => setShowClientModal(true)}
              className="px-4 py-2 bg-[#4f0c1b] text-white rounded-lg hover:bg-[#5c1327] transition-colors"
            >
              {t('sales.selectClient')}
            </button>
          </div>
        )}
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('sales.invoiceItems')}</h3>
          
          <div className="mb-4 relative" ref={dropdownRef}>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.searchSku')}</label>
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t('sales.searchSkuPlaceholder')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
            />
            
            {showDropdown && filteredInventory.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {filteredInventory.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => addProductToInvoice(product)}
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                  >
                    <div className="font-mono text-sm font-semibold text-[#4f0c1b]">{product.sku}</div>
                    <div className="text-sm text-gray-600">{product.name}</div>
                    <div className="text-xs text-gray-500">{t('sales.stock')}: {product.ecuadorStock} | {product.category} - {product.line}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {invoiceItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('sales.sku')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('sales.description')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('sales.line')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('sales.category')}</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('sales.quantity')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('sales.unitPrice')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('sales.totalPrice')}</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('sales.actions')}</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invoiceItems.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono text-sm font-medium text-gray-900">{item.sku}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">{item.description}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{item.line || '-'}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{item.category || '-'}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="flex flex-col items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            max={isNaN(item.maxQuantity) ? undefined : item.maxQuantity}
                            value={isNaN(item.quantity) ? '' : String(item.quantity)}
                            onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 1)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                          />
                          <div className="text-xs text-gray-500">
                            {t('sales.max')}: {item.availableStock}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={isNaN(item.unitPrice) ? '' : String(item.unitPrice)}
                          onChange={(e) => handlePriceChange(index, parseFloat(e.target.value) || 0)}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="text-sm font-semibold text-gray-900">${item.totalPrice.toFixed(2)}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <button
                          onClick={() => removeItem(index)}
                          className="text-red-600 hover:text-red-700 text-sm font-medium"
                        >
                          {t('sales.remove')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              {t('sales.noItemsAdded')}
            </div>
          )}
        </div>

      {/* Totals */}
      {invoiceItems.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('sales.invoiceSummary')}</h3>
          
          <div className="space-y-3 mb-4">
            <div className="flex justify-between text-gray-700">
              <span>{t('sales.subtotal')}:</span>
              <span className="font-semibold">${calculateSubtotal().toFixed(2)}</span>
            </div>
            
            <div className="flex items-center gap-4 pt-3 border-t border-gray-200">
              <label className="text-sm font-medium text-gray-700">{t('sales.discount')}:</label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'flat')}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="percentage">{t('sales.percentage')} (%)</option>
                <option value="flat">{t('sales.flatAmount')}</option>
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
                placeholder={discountType === 'percentage' ? '0' : '0.00'}
              />
              <span className="text-gray-600 font-medium">
                = ${calculateDiscount().toFixed(2)}
              </span>
            </div>
            
            <div className="flex justify-between font-bold text-xl text-[#4f0c1b] pt-3 border-t-2 border-gray-300">
              <span>{t('sales.grandTotal')}:</span>
              <span>${calculateGrandTotal().toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Method Section */}
          <div className="border-t border-gray-200 pt-4 mt-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('sales.paymentMethodOptional')}
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'card' | 'cash' | 'transfer' | '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                >
                  <option value="">{t('sales.selectPaymentMethod')}</option>
                  <option value="card">{t('sales.card')}</option>
                  <option value="cash">{t('sales.cash')}</option>
                  <option value="transfer">{t('sales.transfer')}</option>
                </select>
              </div>
              
              {paymentMethod && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('sales.paymentDetails')}
                  </label>
                  <textarea
                    value={paymentComment}
                    onChange={(e) => setPaymentComment(e.target.value)}
                    placeholder={t('sales.paymentDetailsPlaceholder')}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
              )}
            </div>
          </div>

          <button
            onClick={submitInvoice}
            className="w-full px-6 py-3 bg-[#4f0c1b] text-white rounded-lg hover:bg-[#5c1327] transition-colors font-medium mt-4"
          >
            {t('sales.submitInvoice')}
          </button>
        </div>
      )}

      {/* Client Selection Modal */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">{t('sales.selectClient')}</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {clients.map((client) => (
                <div
                  key={client.id}
                  onClick={() => {
                    setSelectedClient(client);
                    setShowClientModal(false);
                  }}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="font-semibold text-gray-900">{client.name}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {client.address}, {client.city}, {client.country}
                  </div>
                  {(client.phone || client.email) && (
                    <div className="text-xs text-gray-400 mt-1">
                      {client.phone && `📞 ${client.phone}`} {client.email && `📧 ${client.email}`}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowClientModal(false)}
              className="mt-4 w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
