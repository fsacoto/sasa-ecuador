'use client';

import { useState, useEffect } from 'react';
import { useInventory } from '../context/InventoryContext';
import { InventoryItem } from '../types';
import InventoryDetailPanel from './InventoryDetailPanel';
import ProductCatalogModal from './ProductCatalogModal';
import { generateUniqueSKU } from '../utils/skuGenerator';
import { syncInventoryToOrders } from '../utils/syncUpdates';
import { handleMultipleImageUpload, validateImageFile } from '../utils/imageUpload';

export default function Inventory() {
  const { inventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, purchaseOrders, updatePurchaseOrder } = useInventory();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);
  const [categoryMode, setCategoryMode] = useState<'select' | 'new'>('select');
  const [lineMode, setLineMode] = useState<'select' | 'new'>('select');
  
  // Get unique categories and lines from existing inventory
  const existingCategories = [...new Set(inventory
    .map(item => item.category)
    .filter(cat => cat && !cat.includes('NEEDS REVIEW'))
  )].sort();
  
  const existingLines = [...new Set(inventory
    .map(item => item.line)
    .filter(line => line && line.trim() !== '')
  )].sort();
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
    images: [] as string[],
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
      images: [],
    });
    setEditingItem(null);
    setIsFormOpen(false);
    setSkuManuallyEdited(false);
    setCategoryMode('select');
    setLineMode('select');
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
      images: item.images || [],
    });
    setSkuManuallyEdited(true); // Don't auto-generate when editing
    setIsFormOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Validate all files first
    for (let i = 0; i < files.length; i++) {
      const validation = validateImageFile(files[i]);
      if (!validation.valid) {
        alert(`${files[i].name}: ${validation.error}`);
        return;
      }
    }

    // Convert to base64
    const newImages = await handleMultipleImageUpload(files);
    setFormData(prev => ({ ...prev, images: [...prev.images, ...newImages] }));
    
    // Reset input
    e.target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
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
        <div className="flex gap-3">
          <button
            onClick={() => setIsCatalogModalOpen(true)}
            disabled={inventory.length === 0}
            className="bg-white border-2 border-[#4f0c1b] text-[#4f0c1b] hover:bg-[#4f0c1b] hover:text-white px-5 py-2.5 rounded-lg transition-all font-medium text-sm shadow-sm hover:shadow active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Create Catalog
          </button>
          <button
            onClick={() => setIsFormOpen(true)}
            className="bg-[#4f0c1b] hover:bg-[#3d0a15] text-white px-5 py-2.5 rounded-lg transition-all font-medium text-sm shadow-sm hover:shadow active:scale-95"
          >
            Add Inventory Item
          </button>
        </div>
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
                  {categoryMode === 'select' ? (
                    <div className="flex gap-2">
                      <select
                        required
                        value={formData.category}
                        onChange={(e) => {
                          if (e.target.value === '__new__') {
                            setCategoryMode('new');
                            setFormData({ ...formData, category: '' });
                          } else {
                            setFormData({ ...formData, category: e.target.value });
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                      >
                        <option value="">Select category...</option>
                        {existingCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                        <option value="__new__">+ Add New Category</option>
                      </select>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        placeholder="Enter new category"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setCategoryMode('select')}
                        className="px-3 text-sm text-gray-600 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Line *</label>
                  {lineMode === 'select' ? (
                    <div className="flex gap-2">
                      <select
                        required
                        value={formData.line}
                        onChange={(e) => {
                          if (e.target.value === '__new__') {
                            setLineMode('new');
                            setFormData({ ...formData, line: '' });
                          } else {
                            setFormData({ ...formData, line: e.target.value });
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                      >
                        <option value="">Select line...</option>
                        {existingLines.map(line => (
                          <option key={line} value={line}>{line}</option>
                        ))}
                        <option value="__new__">+ Add New Line</option>
                      </select>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={formData.line}
                        onChange={(e) => setFormData({ ...formData, line: e.target.value })}
                        placeholder="Enter new line"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setLineMode('select')}
                        className="px-3 text-sm text-gray-600 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">Internal SKU *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={formData.sku}
                    onChange={(e) => handleSkuChange(e.target.value)}
                    placeholder="Auto-generated from category & line"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent bg-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleRegenerateSku}
                    disabled={!formData.category || !formData.line}
                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-white hover:border-[#4f0c1b] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Regenerate SKU"
                  >
                    <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
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

              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Product Images</label>
                
                {/* Image Grid */}
                {formData.images.length > 0 && (
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    {formData.images.map((image, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={image}
                          alt={`Product ${index + 1}`}
                          className="w-full h-24 object-cover rounded-lg border-2 border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(index)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        {index === 0 && (
                          <div className="absolute bottom-1 left-1 bg-[#4f0c1b] text-white text-xs px-2 py-0.5 rounded">
                            Main
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Upload Button */}
                <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-[#4f0c1b] hover:bg-gray-50 cursor-pointer transition-all">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-sm text-gray-600">Upload Images</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Upload up to 10 images. First image is the main product image. Max 5MB each.
                </p>
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
                        {item.images && item.images.length > 0 ? (
                          <div className="relative">
                            <img 
                              src={item.images[0]} 
                              alt={item.name} 
                              className="w-12 h-12 object-cover rounded-lg border border-gray-200" 
                            />
                            {item.images.length > 1 && (
                              <div className="absolute -bottom-1 -right-1 bg-[#4f0c1b] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-medium">
                                {item.images.length}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="w-12 h-12 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
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

      {/* Catalog Modal */}
      {isCatalogModalOpen && (
        <ProductCatalogModal
          inventory={inventory}
          onClose={() => setIsCatalogModalOpen(false)}
        />
      )}
    </div>
  );
}