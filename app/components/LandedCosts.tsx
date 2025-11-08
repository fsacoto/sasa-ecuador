'use client';

import { useState, useEffect, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';
import { AdditionalCost, AdditionalCostType, LandedCostCalculation } from '../types';
import { useTranslation } from '../context/TranslationContext';

export default function LandedCosts() {
  const { 
    purchaseOrders, 
    additionalCosts, 
    addAdditionalCost, 
    updateAdditionalCost, 
    deleteAdditionalCost,
    getAdditionalCostsByInvoice,
    calculateLandedCosts 
  } = useInventory();
  const { t } = useTranslation();

  const [selectedInvoice, setSelectedInvoice] = useState<string>('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<AdditionalCost | null>(null);
  const [formData, setFormData] = useState({
    invoiceNumber: '',
    costs: [
      { type: 'Shipping' as AdditionalCostType, amount: 0, description: '' },
      { type: 'Insurance' as AdditionalCostType, amount: 0, description: '' },
      { type: 'Duties' as AdditionalCostType, amount: 0, description: '' },
      { type: 'Import Fees' as AdditionalCostType, amount: 0, description: '' },
      { type: 'Other' as AdditionalCostType, amount: 0, description: '' },
    ],
    date: new Date().toISOString().split('T')[0],
    comments: '',
  });

  const formRef = useRef<HTMLDivElement>(null);

  // Get unique invoice numbers from purchase orders
  const invoiceNumbers = Array.from(new Set(purchaseOrders.map(order => order.invoice))).sort();

  // Get additional costs for selected invoice
  const invoiceAdditionalCosts = selectedInvoice ? getAdditionalCostsByInvoice(selectedInvoice) : [];

  // Calculate landed costs for selected invoice
  const landedCostCalculation = selectedInvoice ? calculateLandedCosts(selectedInvoice) : null;

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Filter out costs with zero amounts and add them
    const validCosts = formData.costs.filter(cost => cost.amount > 0);
    
    if (validCosts.length === 0) {
      alert(t('landedCosts.pleaseEnterCost'));
      return;
    }
    
    validCosts.forEach(cost => {
      const costData = {
        invoiceNumber: formData.invoiceNumber,
        type: cost.type,
        amount: cost.amount,
        description: cost.description || `${cost.type} - ${formData.comments}`.trim(),
        date: new Date(formData.date),
      };
      
      addAdditionalCost(costData);
    });
    
    resetForm();
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      invoiceNumber: selectedInvoice || '',
      costs: [
        { type: 'Shipping' as AdditionalCostType, amount: 0, description: '' },
        { type: 'Insurance' as AdditionalCostType, amount: 0, description: '' },
        { type: 'Duties' as AdditionalCostType, amount: 0, description: '' },
        { type: 'Import Fees' as AdditionalCostType, amount: 0, description: '' },
        { type: 'Other' as AdditionalCostType, amount: 0, description: '' },
      ],
      date: new Date().toISOString().split('T')[0],
      comments: '',
    });
    setIsFormOpen(false);
    setEditingCost(null);
  };

  // Handle edit
  const handleEdit = (cost: AdditionalCost) => {
    // For individual cost editing, we'll use a simpler approach
    const newDescription = prompt(t('landedCosts.editDescription'), cost.description);
    if (newDescription !== null) {
      updateAdditionalCost(cost.id, { description: newDescription });
    }
  };

  // Handle delete
  const handleDelete = (id: string) => {
    if (confirm(t('landedCosts.deleteConfirm'))) {
      deleteAdditionalCost(id);
    }
  };

  // Update individual cost field
  const updateCostField = (index: number, field: 'amount' | 'description', value: string | number) => {
    setFormData(prev => ({
      ...prev,
      costs: prev.costs.map((cost, i) => 
        i === index ? { ...cost, [field]: value } : cost
      )
    }));
  };

  // Close form when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(event.target as Node)) {
        resetForm();
      }
    };

    if (isFormOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFormOpen]);

  const costTypes: AdditionalCostType[] = ['Shipping', 'Insurance', 'Duties', 'Import Fees', 'Other'];

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">{t('landedCosts.title')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('landedCosts.subtitle')}</p>
        </div>
        <button
          onClick={() => setIsFormOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#4f0c1b] hover:bg-[#3d0a15] text-white rounded-lg transition-all font-medium text-sm shadow-sm hover:shadow-md active:scale-95"
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span className="text-sm font-medium text-white">{t('landedCosts.addAdditionalCosts')}</span>
        </button>
      </div>

      {/* Invoice Selection */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">{t('landedCosts.selectInvoice')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {invoiceNumbers.map(invoiceNumber => {
            const orders = purchaseOrders.filter(order => order.invoice === invoiceNumber);
            const totalValue = orders.reduce((sum, order) => sum + order.costInUSD, 0);
            const itemCount = orders.length;
            
            return (
              <button
                key={invoiceNumber}
                onClick={() => setSelectedInvoice(invoiceNumber)}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  selectedInvoice === invoiceNumber
                    ? 'border-[#4f0c1b] bg-[#4f0c1b]/5'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="font-medium text-gray-900">{invoiceNumber}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {itemCount} {t('landedCosts.items')} • ${totalValue.toFixed(2)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedInvoice && (
        <>
          {/* Additional Costs List */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">
                {t('landedCosts.additionalCosts')} - {selectedInvoice}
              </h3>
              <span className="text-sm text-gray-500">
                {invoiceAdditionalCosts.length} {invoiceAdditionalCosts.length !== 1 ? t('landedCosts.costsPlural') : t('landedCosts.costs')}
              </span>
            </div>

            {invoiceAdditionalCosts.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">{t('landedCosts.noAdditionalCosts')}</h3>
                <p className="text-gray-600">{t('landedCosts.noAdditionalCostsMessage')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {invoiceAdditionalCosts.map(cost => (
                  <div key={cost.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-1 bg-[#4f0c1b] text-white text-xs font-medium rounded">
                          {cost.type}
                        </span>
                        <span className="font-semibold text-gray-900">${cost.amount.toFixed(2)}</span>
                      </div>
                      <div className="text-sm text-gray-600 mt-1">{cost.description}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(cost.date).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric' 
                        })}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(cost)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(cost.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Landed Cost Calculation */}
          {landedCostCalculation && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">{t('landedCosts.landedCostCalculation')}</h3>
              
              {/* Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-500 mb-1">{t('landedCosts.baseItemTotal')}</div>
                  <div className="text-xl font-semibold text-gray-900">
                    ${landedCostCalculation.baseItemTotal.toFixed(2)}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-500 mb-1">{t('landedCosts.totalAdditionalCosts')}</div>
                  <div className="text-xl font-semibold text-gray-900">
                    ${landedCostCalculation.totalAdditionalCosts.toFixed(2)}
                  </div>
                </div>
                <div className="bg-[#4f0c1b]/10 rounded-lg p-4">
                  <div className="text-sm font-medium text-[#4f0c1b] mb-1">{t('landedCosts.totalLandedCost')}</div>
                  <div className="text-xl font-semibold text-[#4f0c1b]">
                    ${landedCostCalculation.totalLandedCost.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Item Breakdown */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="text-xs font-medium text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="text-left pb-3 uppercase tracking-wider">{t('landedCosts.sku')}</th>
                      <th className="text-left pb-3 uppercase tracking-wider">{t('landedCosts.description')}</th>
                      <th className="text-right pb-3 uppercase tracking-wider">{t('landedCosts.quantity')}</th>
                      <th className="text-right pb-3 uppercase tracking-wider">{t('landedCosts.baseCostPerUnit')}</th>
                      <th className="text-right pb-3 uppercase tracking-wider">{t('landedCosts.baseTotal')}</th>
                      <th className="text-right pb-3 uppercase tracking-wider">{t('landedCosts.allocationPercent')}</th>
                      <th className="text-right pb-3 uppercase tracking-wider">{t('landedCosts.additionalCost')}</th>
                      <th className="text-right pb-3 uppercase tracking-wider">{t('landedCosts.finalCostPerUnit')}</th>
                      <th className="text-right pb-3 uppercase tracking-wider">{t('landedCosts.finalTotal')}</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-gray-100">
                    {landedCostCalculation.items.map((item) => (
                      <tr key={item.purchaseOrderId} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 text-gray-900 font-mono">{item.sku}</td>
                        <td className="py-3 text-gray-700">{item.description}</td>
                        <td className="py-3 text-right text-gray-700">{item.quantity}</td>
                        <td className="py-3 text-right text-gray-700">${item.baseCostPerUnit.toFixed(2)}</td>
                        <td className="py-3 text-right text-gray-700">${item.baseItemTotal.toFixed(2)}</td>
                        <td className="py-3 text-right text-gray-700">{item.proportionalShare.toFixed(1)}%</td>
                        <td className="py-3 text-right text-gray-700">${item.additionalCostAllocation.toFixed(2)}</td>
                        <td className="py-3 text-right font-medium text-[#4f0c1b]">${item.finalCostPerUnit.toFixed(2)}</td>
                        <td className="py-3 text-right font-semibold text-[#4f0c1b]">${item.finalItemTotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add Multiple Costs Form */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div ref={formRef} className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Add Additional Costs</h3>
              <button
                onClick={resetForm}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Invoice Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Invoice Number</label>
                <select
                  value={formData.invoiceNumber}
                  onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  required
                >
                  <option value="">Select Invoice</option>
                  {invoiceNumbers.map(invoiceNumber => (
                    <option key={invoiceNumber} value={invoiceNumber}>{invoiceNumber}</option>
                  ))}
                </select>
              </div>

              {/* Cost Types */}
              <div>
                <h4 className="text-base font-semibold text-gray-900 mb-4">Additional Costs</h4>
                <div className="space-y-4">
                  {formData.costs.map((cost, index) => (
                    <div key={index} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="px-3 py-1 bg-[#4f0c1b] text-white text-sm font-medium rounded">
                          {cost.type}
                        </span>
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Amount (USD)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={cost.amount}
                            onChange={(e) => updateCostField(index, 'amount', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                        <input
                          type="text"
                          value={cost.description}
                          onChange={(e) => updateCostField(index, 'description', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                          placeholder={`Enter ${cost.type.toLowerCase()} details...`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  required
                />
              </div>

              {/* Additional Comments */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Additional Comments</label>
                <textarea
                  value={formData.comments}
                  onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  rows={3}
                  placeholder="Enter any additional comments or notes about these costs..."
                />
              </div>

              {/* Summary */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h5 className="text-sm font-semibold text-blue-900 mb-2">Cost Summary</h5>
                <div className="text-sm text-blue-800">
                  Total Additional Costs: <span className="font-semibold">
                    ${formData.costs.reduce((sum, cost) => sum + cost.amount, 0).toFixed(2)}
                  </span>
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  Only costs with amounts greater than $0 will be added
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-[#4f0c1b] hover:bg-[#3d0a15] text-white rounded-lg transition-colors font-medium"
                >
                  Add Costs
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
