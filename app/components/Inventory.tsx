'use client';

import { useState, useEffect } from 'react';
import { useInventory } from '../context/InventoryContext';
import { InventoryItem } from '../types';
import InventoryDetailPanel from './InventoryDetailPanel';
import { generateUniqueSKU } from '../utils/skuGenerator';
import { syncInventoryToOrders } from '../utils/syncUpdates';

export default function Inventory() {
  const { inventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, purchaseOrders, updatePurchaseOrder } = useInventory();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    supplierSKU: '',
    linkedPurchaseOrders: [] as string[],
    sku: '',
    description: '',
    category: '',
    line: '',
    ecuadorStock: 0,
    usaStock: 0,
    image: '',
  });

  // Auto-generate SKU when category or line changes (unless manually edited)
  useEffect(() => {
    if (!editingItem && !skuManuallyEdited && formData.category && formData.line) {
      const existingSkus = inventory.map(item => item.sku);
      const newSku = generateUniqueSKU(formData.category, formData.line, existingSkus);
      setFormData(prev => ({ ...prev, sku: newSku }));
    }
  }, [formData.category, formData.line, editingItem, skuManuallyEdited, inventory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      // Update the inventory item
      const updatedItem = { ...editingItem, ...formData };
      updateInventoryItem(editingItem.id, formData);
      
      // Sync changes to linked purchase orders
      syncInventoryToOrders(updatedItem, purchaseOrders, updatePurchaseOrder);
    } else {
      addInventoryItem(formData);
    }
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      supplierSKU: '',
      linkedPurchaseOrders: [],
      sku: '',
      description: '',
      category: '',
      line: '',
      ecuadorStock: 0,
      usaStock: 0,
      image: '',
    });
    setEditingItem(null);
    setIsFormOpen(false);
    setSkuManuallyEdited(false);
  };

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      supplierSKU: item.supplierSKU,
      linkedPurchaseOrders: item.linkedPurchaseOrders,
      sku: item.sku,
      description: item.description,
      category: item.category,
      line: item.line,
      ecuadorStock: item.ecuadorStock,
      usaStock: item.usaStock,
      image: item.image,
    });
    setSkuManuallyEdited(true); // Don't auto-generate when editing
    setIsFormOpen(true);
  };

  const handleSkuChange = (newSku: string) => {
    setFormData({ ...formData, sku: newSku });
    setSkuManuallyEdited(true);
  };

  const handleRegenerateSku = () => {
    if (formData.category && formData.line) {
      const existingSkus = inventory.map(item => item.sku).filter(sku => sku !== formData.sku);
      const newSku = generateUniqueSKU(formData.category, formData.line, existingSkus);
      setFormData({ ...formData, sku: newSku });
      setSkuManuallyEdited(false);
    }
  };

  const handlePurchaseOrderToggle = (orderId: string) => {
    const linkedOrders = formData.linkedPurchaseOrders.includes(orderId)
      ? formData.linkedPurchaseOrders.filter(id => id !== orderId)
      : [...formData.linkedPurchaseOrders, orderId];
    setFormData({ ...formData, linkedPurchaseOrders: linkedOrders });
  };

  const getTotalStock = (item: InventoryItem) => {
    return item.ecuadorStock + item.usaStock;
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Inventory</h2>
          <p className="text-sm text-gray-500 mt-1">Manage your jewelry inventory</p>
        </div>
        <button
          onClick={() => setIsFormOpen(true)}
          className="bg-[#4f0c1b] hover:bg-[#3d0a15] text-white px-5 py-2.5 rounded-lg transition-all font-medium text-sm shadow-sm hover:shadow active:scale-95"
        >
          Add Inventory Item
        </button>
      </div>

      {/* Warning Banner for Items Needing Review */}
      {inventory.some(item => item.category.includes('NEEDS REVIEW')) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h3 className="text-sm font-semibold text-amber-900">Items Need Review</h3>
            <p className="text-sm text-amber-700 mt-1">
              {inventory.filter(item => item.category.includes('NEEDS REVIEW')).length} items from bulk import need additional information.
              Click on them to edit and complete the details.
            </p>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 duration-300">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingItem ? 'Edit Inventory Item' : 'Add New Inventory Item'}
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
            <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-8rem)] p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Category *</label>
                  <input
                    type="text"
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="e.g., Rings, Necklaces"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Line *</label>
                  <input
                    type="text"
                    required
                    value={formData.line}
                    onChange={(e) => setFormData({ ...formData, line: e.target.value })}
                    placeholder="e.g., Gold, Silver"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Internal SKU *</label>
                  <button
                    type="button"
                    onClick={handleRegenerateSku}
                    disabled={!formData.category || !formData.line}
                    className="text-xs text-[#4f0c1b] hover:text-[#3d0a15] font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    ↻ Regenerate
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={formData.sku}
                  onChange={(e) => handleSkuChange(e.target.value)}
                  placeholder="Auto-generated from category & line"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent bg-white font-mono"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Format: {formData.category ? formData.category.substring(0, 2).toUpperCase() : 'XX'}
                  {formData.line ? formData.line.substring(0, 2).toUpperCase() : 'XX'}-#####
                  {!editingItem && ' (auto-generates when you enter category & line)'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Supplier SKU</label>
                <input
                  type="text"
                  value={formData.supplierSKU}
                  onChange={(e) => setFormData({ ...formData, supplierSKU: e.target.value })}
                  placeholder="SKU from supplier"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Ecuador Stock *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.ecuadorStock}
                    onChange={(e) => setFormData({ ...formData, ecuadorStock: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">USA Stock *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.usaStock}
                    onChange={(e) => setFormData({ ...formData, usaStock: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
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

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Linked Purchase Orders</label>
                <div className="border border-gray-300 rounded-lg p-4 max-h-60 overflow-y-auto bg-gray-50">
                  {purchaseOrders.length === 0 ? (
                    <p className="text-sm text-gray-500">No purchase orders available</p>
                  ) : (
                    <div className="space-y-2">
                      {purchaseOrders.map((order) => (
                        <label key={order.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-2 rounded">
                          <input
                            type="checkbox"
                            checked={formData.linkedPurchaseOrders.includes(order.id)}
                            onChange={() => handlePurchaseOrderToggle(order.id)}
                            className="rounded border-gray-300 text-[#4f0c1b] focus:ring-[#4f0c1b]"
                          />
                          <span className="text-sm text-gray-700">
                            {order.invoice} - {order.description} ({order.quantity} units)
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
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
                {editingItem ? 'Update' : 'Add'} Inventory Item
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
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SKU
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Line
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ecuador
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  USA
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {inventory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-sm text-gray-500">
                    No inventory items yet. Add your first item to get started.
                  </td>
                </tr>
              ) : (
                inventory.map((item) => {
                  const needsReview = item.category.includes('NEEDS REVIEW');
                  return (
                    <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${needsReview ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => setSelectedItem(item)}
                          className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
                        >
                          {item.image && (
                            <img src={item.image} alt={item.name} className="w-10 h-10 object-cover rounded-lg border border-gray-200" />
                          )}
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[#4f0c1b] hover:underline">{item.name}</span>
                            {needsReview && (
                              <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">
                                Needs Review
                              </span>
                            )}
                          </div>
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.sku}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {needsReview ? '-' : item.category}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.line || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-700">{item.ecuadorStock}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-700">{item.usaStock}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center font-semibold text-gray-900">{getTotalStock(item)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <button
                          onClick={() => handleEdit(item)}
                          className="text-[#4f0c1b] hover:text-[#3d0a15] font-medium mr-4 transition-colors"
                        >
                          {needsReview ? 'Complete Info' : 'Edit'}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this inventory item?')) {
                              deleteInventoryItem(item.id);
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
      {selectedItem && (
        <InventoryDetailPanel
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}