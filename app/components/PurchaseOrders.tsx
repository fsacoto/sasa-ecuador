'use client';

import { useState, useEffect } from 'react';
import { useInventory } from '../context/InventoryContext';
import { PurchaseOrder, Supplier } from '../types';
import SupplierDetailPanel from './SupplierDetailPanel';
import { generateUniqueSKU } from '../utils/skuGenerator';
import { getExchangeRates, getExchangeRate, formatLastUpdate } from '../utils/currencyApi';

export default function PurchaseOrders() {
  const { purchaseOrders, addPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, suppliers, inventory, addInventoryItem } = useInventory();
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>('');
  const [isCreatingNewItem, setIsCreatingNewItem] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<any>(null);
  const [isLoadingRates, setIsLoadingRates] = useState(false);
  const [lastRateUpdate, setLastRateUpdate] = useState<string>('');
  const [formData, setFormData] = useState({
    invoice: '',
    invoiceLink: '',
    supplierId: '',
    supplierSKU: '',
    description: '',
    sku: '',
    category: '',
    line: '',
    image: '',
    quantity: 0,
    destinationStock: 'Ecuador' as 'Ecuador' | 'USA',
    currency: 'USD',
    costPerUnit: 0,
    discountPerUnit: 0,
    exchangeRate: 1,
    shippingCost: 0,
    tariffCost: 0,
    otherFees: 0,
    purchaseDate: new Date().toISOString().split('T')[0],
  });

  // Auto-generate SKU when creating new item
  useEffect(() => {
    if (isCreatingNewItem && formData.category && formData.line && !editingOrder) {
      const existingSkus = inventory.map(item => item.sku);
      const newSku = generateUniqueSKU(formData.category, formData.line, existingSkus);
      setFormData(prev => ({ ...prev, sku: newSku }));
    }
  }, [formData.category, formData.line, isCreatingNewItem, editingOrder, inventory]);

  // When selecting an existing inventory item, auto-fill fields
  useEffect(() => {
    if (selectedInventoryId && selectedInventoryId !== 'new') {
      const item = inventory.find(i => i.id === selectedInventoryId);
      if (item) {
        setFormData(prev => ({
          ...prev,
          sku: item.sku,
          description: item.description || item.name,
          category: item.category,
          line: item.line,
          image: item.image,
          supplierSKU: item.supplierSKU,
        }));
        setIsCreatingNewItem(false);
      }
    } else if (selectedInventoryId === 'new') {
      setIsCreatingNewItem(true);
      // Clear product fields
      setFormData(prev => ({
        ...prev,
        sku: '',
        description: '',
        category: '',
        line: '',
        image: '',
        supplierSKU: '',
      }));
    }
  }, [selectedInventoryId, inventory]);

  // Fetch exchange rates when form opens
  useEffect(() => {
    if (isFormOpen && !exchangeRates) {
      fetchExchangeRates();
    }
  }, [isFormOpen]);

  // Auto-update exchange rate when currency changes
  useEffect(() => {
    if (exchangeRates && formData.currency !== 'USD') {
      const rate = getExchangeRate(formData.currency, 'USD', exchangeRates);
      if (rate !== formData.exchangeRate) {
        setFormData(prev => ({ ...prev, exchangeRate: rate }));
      }
    }
  }, [formData.currency, exchangeRates]);

  const fetchExchangeRates = async () => {
    setIsLoadingRates(true);
    try {
      const rates = await getExchangeRates('USD');
      if (rates) {
        setExchangeRates(rates);
        setLastRateUpdate(formatLastUpdate(rates.time_last_update_utc));
        
        // Auto-set exchange rate if currency is already selected
        if (formData.currency !== 'USD') {
          const rate = getExchangeRate(formData.currency, 'USD', rates);
          setFormData(prev => ({ ...prev, exchangeRate: rate }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch exchange rates:', error);
    } finally {
      setIsLoadingRates(false);
    }
  };

  const calculateTotals = () => {
    const totalCost = formData.quantity * formData.costPerUnit;
    const totalDiscount = formData.quantity * formData.discountPerUnit;
    const costPerUnitWithDiscount = formData.costPerUnit - formData.discountPerUnit;
    const totalCostWithDiscount = totalCost - totalDiscount;
    const costInUSD = totalCostWithDiscount * formData.exchangeRate;
    
    // Additional costs in USD
    const shippingCost = formData.shippingCost;
    const tariffCost = formData.tariffCost;
    const otherFees = formData.otherFees;
    
    // Total landed cost = product cost + all fees
    const totalLandedCost = costInUSD + shippingCost + tariffCost + otherFees;
    
    // Landed cost per unit = total landed cost / quantity
    const landedCostPerUnit = formData.quantity > 0 ? totalLandedCost / formData.quantity : 0;
    
    return {
      totalCost,
      totalDiscount,
      costPerUnitWithDiscount,
      totalCostWithDiscount,
      costInUSD,
      shippingCost,
      tariffCost,
      otherFees,
      totalLandedCost,
      landedCostPerUnit,
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totals = calculateTotals();
    const orderData = {
      ...formData,
      ...totals,
      purchaseDate: new Date(formData.purchaseDate),
    };

    if (editingOrder) {
      updatePurchaseOrder(editingOrder.id, orderData);
    } else {
      // Add the purchase order
      addPurchaseOrder(orderData);

      // If creating new item, add it to inventory
      if (isCreatingNewItem && formData.sku && formData.category && formData.line) {
        const newOrderId = Date.now().toString(); // This will be the order ID
        addInventoryItem({
          name: formData.description,
          sku: formData.sku,
          supplierSKU: formData.supplierSKU,
          category: formData.category,
          line: formData.line,
          description: formData.description,
          image: formData.image,
          ecuadorStock: formData.destinationStock === 'Ecuador' ? formData.quantity : 0,
          usaStock: formData.destinationStock === 'USA' ? formData.quantity : 0,
          linkedPurchaseOrders: [newOrderId],
        });
      }
    }
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      invoice: '',
      invoiceLink: '',
      supplierId: '',
      supplierSKU: '',
      description: '',
      sku: '',
      category: '',
      line: '',
      image: '',
      quantity: 0,
      destinationStock: 'Ecuador',
      currency: 'USD',
      costPerUnit: 0,
      discountPerUnit: 0,
      exchangeRate: 1,
      shippingCost: 0,
      tariffCost: 0,
      otherFees: 0,
      purchaseDate: new Date().toISOString().split('T')[0],
    });
    setEditingOrder(null);
    setIsFormOpen(false);
    setSelectedInventoryId('');
    setIsCreatingNewItem(false);
  };

  const handleEdit = (order: PurchaseOrder) => {
    setEditingOrder(order);
    setFormData({
      invoice: order.invoice,
      invoiceLink: order.invoiceLink,
      supplierId: order.supplierId,
      supplierSKU: order.supplierSKU,
      description: order.description,
      sku: order.sku,
      category: order.category,
      line: order.line,
      image: order.image,
      quantity: order.quantity,
      destinationStock: order.destinationStock,
      currency: order.currency,
      costPerUnit: order.costPerUnit,
      discountPerUnit: order.discountPerUnit,
      exchangeRate: order.exchangeRate,
      shippingCost: order.shippingCost,
      tariffCost: order.tariffCost,
      otherFees: order.otherFees,
      purchaseDate: order.purchaseDate.toISOString().split('T')[0],
    });
    setIsFormOpen(true);
  };

  const totals = calculateTotals();

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Purchase Orders</h2>
          <p className="text-sm text-gray-500 mt-1">Track orders from suppliers</p>
        </div>
        <button
          onClick={() => setIsFormOpen(true)}
          className="bg-[#4f0c1b] hover:bg-[#3d0a15] text-white px-5 py-2.5 rounded-lg transition-all font-medium text-sm shadow-sm hover:shadow active:scale-95"
        >
          Add Purchase Order
        </button>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 duration-300">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingOrder ? 'Edit Purchase Order' : 'Add New Purchase Order'}
              </h3>
              <button
                type="button"
                onClick={resetForm}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-8rem)] p-6 space-y-5">
              {/* Inventory Item Selector */}
              {!editingOrder && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
                  <div className="flex gap-2">
                    <select
                      value={selectedInventoryId}
                      onChange={(e) => setSelectedInventoryId(e.target.value)}
                      className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent bg-white text-sm"
                    >
                      <option value="">Select existing product or create new...</option>
                      <option value="new">Create New Product</option>
                      {inventory.length > 0 && <option disabled>──────────</option>}
                      {inventory.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.sku}
                        </option>
                      ))}
                    </select>
                    {selectedInventoryId === 'new' && (
                      <button
                        type="button"
                        onClick={() => setSelectedInventoryId('')}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  {selectedInventoryId && selectedInventoryId !== 'new' && (
                    <p className="text-xs text-gray-500 mt-1.5">
                      Product details loaded from inventory
                    </p>
                  )}
                  {isCreatingNewItem && (
                    <p className="text-xs text-[#4f0c1b] mt-1.5 font-medium">
                      New product will be added to inventory
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Invoice *</label>
                  <input
                    type="text"
                    required
                    value={formData.invoice}
                    onChange={(e) => setFormData({ ...formData, invoice: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Invoice Link</label>
                  <input
                    type="url"
                    value={formData.invoiceLink}
                    onChange={(e) => setFormData({ ...formData, invoiceLink: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Supplier *</label>
                  <select
                    required
                    value={formData.supplierId}
                    onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  >
                    <option value="">Select a supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Supplier SKU</label>
                  <input
                    type="text"
                    value={formData.supplierSKU}
                    onChange={(e) => setFormData({ ...formData, supplierSKU: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
              </div>

              {/* Product Details Section */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">
                    {isCreatingNewItem ? 'Product Name *' : 'Description'}
                  </label>
                  <input
                    type="text"
                    required={isCreatingNewItem}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={isCreatingNewItem ? 'e.g., Gold Diamond Ring' : 'Order description'}
                    disabled={selectedInventoryId && selectedInventoryId !== 'new'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">
                      Category {isCreatingNewItem && '*'}
                    </label>
                    <input
                      type="text"
                      required={isCreatingNewItem}
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder={isCreatingNewItem ? 'Rings' : ''}
                      disabled={selectedInventoryId && selectedInventoryId !== 'new'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">
                      Line {isCreatingNewItem && '*'}
                    </label>
                    <input
                      type="text"
                      required={isCreatingNewItem}
                      value={formData.line}
                      onChange={(e) => setFormData({ ...formData, line: e.target.value })}
                      placeholder={isCreatingNewItem ? 'Gold' : ''}
                      disabled={selectedInventoryId && selectedInventoryId !== 'new'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">
                      SKU {isCreatingNewItem && '*'}
                    </label>
                    <input
                      type="text"
                      required={isCreatingNewItem}
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      placeholder={isCreatingNewItem ? 'Auto' : ''}
                      disabled={selectedInventoryId && selectedInventoryId !== 'new'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 font-mono text-sm"
                    />
                  </div>
                </div>
                {isCreatingNewItem && formData.category && formData.line && formData.sku && (
                  <p className="text-xs text-gray-500">
                    SKU will be: {formData.sku}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Quantity *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Destination Stock *</label>
                  <select
                    required
                    value={formData.destinationStock}
                    onChange={(e) => setFormData({ ...formData, destinationStock: e.target.value as 'Ecuador' | 'USA' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  >
                    <option value="Ecuador">Ecuador</option>
                    <option value="USA">USA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Currency</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  >
                    <option value="USD">USD - US Dollar</option>
                    <option value="COP">COP - Colombian Peso</option>
                    <option value="BRL">BRL - Brazilian Real</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="CNY">CNY - Chinese Yuan</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Cost Per Unit *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.costPerUnit}
                    onChange={(e) => setFormData({ ...formData, costPerUnit: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Discount Per Unit</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.discountPerUnit}
                    onChange={(e) => setFormData({ ...formData, discountPerUnit: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Exchange Rate to USD</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={formData.exchangeRate}
                      onChange={(e) => setFormData({ ...formData, exchangeRate: parseFloat(e.target.value) || 1 })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={fetchExchangeRates}
                      disabled={isLoadingRates || formData.currency === 'USD'}
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Refresh exchange rate"
                    >
                      {isLoadingRates ? '...' : '↻'}
                    </button>
                  </div>
                  {lastRateUpdate && formData.currency !== 'USD' && (
                    <p className="text-xs text-gray-500 mt-1">
                      Rate updated: {lastRateUpdate}
                    </p>
                  )}
                  {formData.currency === 'USD' && (
                    <p className="text-xs text-gray-500 mt-1">
                      No conversion needed (USD)
                    </p>
                  )}
                </div>
              </div>

              {/* Additional Costs */}
              <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-sm text-gray-900">Additional Costs (USD)</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">Shipping</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.shippingCost}
                      onChange={(e) => setFormData({ ...formData, shippingCost: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">Tariffs/Duties</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.tariffCost}
                      onChange={(e) => setFormData({ ...formData, tariffCost: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">Other Fees</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.otherFees}
                      onChange={(e) => setFormData({ ...formData, otherFees: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Cost Summary */}
              <div className="bg-white border-2 border-[#4f0c1b] rounded-lg p-4">
                <h4 className="font-semibold mb-3 text-[#4f0c1b]">Cost Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Product Cost ({formData.currency}):</span>
                    <span>{totals.totalCostWithDiscount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Product Cost (USD):</span>
                    <span>${totals.costInUSD.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Shipping:</span>
                    <span>${totals.shippingCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Tariffs/Duties:</span>
                    <span>${totals.tariffCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Other Fees:</span>
                    <span>${totals.otherFees.toFixed(2)}</span>
                  </div>
                  <div className="border-t-2 border-gray-200 pt-2 mt-2">
                    <div className="flex justify-between font-semibold text-gray-900 text-base">
                      <span>Total Landed Cost:</span>
                      <span>${totals.totalLandedCost.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="bg-[#4f0c1b] text-white rounded-lg p-3 mt-3">
                    <div className="flex justify-between font-semibold">
                      <span>Landed Cost Per Unit:</span>
                      <span>${totals.landedCostPerUnit.toFixed(2)}</span>
                    </div>
                    <div className="text-xs mt-1 opacity-90">
                      vs Supplier Cost: {formData.currency} {totals.costPerUnitWithDiscount.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Purchase Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.purchaseDate}
                    onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Image URL</label>
                  <input
                    type="url"
                    value={formData.image}
                    onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
              </div>

            </form>
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 px-6 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all font-medium text-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                className="flex-1 bg-[#4f0c1b] hover:bg-[#3d0a15] text-white px-6 py-2.5 rounded-xl transition-all font-medium shadow-sm hover:shadow active:scale-95"
              >
                {editingOrder ? 'Update' : 'Add'} Purchase Order
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Supplier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SKU
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Destination
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Landed Cost/Unit
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {purchaseOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-sm text-gray-500">
                    No purchase orders yet. Add your first purchase order to get started.
                  </td>
                </tr>
              ) : (
                purchaseOrders.map((order) => {
                  const supplier = suppliers.find(s => s.id === order.supplierId);
                  return (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{order.invoice}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {supplier ? (
                          <button
                            onClick={() => setSelectedSupplier(supplier)}
                            className="text-[#4f0c1b] hover:text-[#3d0a15] hover:underline transition-colors font-medium"
                          >
                            {supplier.name}
                          </button>
                        ) : (
                          <span className="text-gray-500">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{order.description}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{order.sku}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{order.quantity}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{order.destinationStock}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="font-medium text-gray-900">${order.landedCostPerUnit.toFixed(2)}</div>
                        <div className="text-xs text-gray-500">Total: ${order.totalLandedCost.toFixed(2)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <button
                          onClick={() => handleEdit(order)}
                          className="text-[#4f0c1b] hover:text-[#3d0a15] font-medium mr-4 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this purchase order?')) {
                              deletePurchaseOrder(order.id);
                            }
                          }}
                          className="text-red-600 hover:text-red-700 font-medium transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedSupplier && (
        <SupplierDetailPanel
          supplier={selectedSupplier}
          onClose={() => setSelectedSupplier(null)}
        />
      )}
    </div>
  );
}