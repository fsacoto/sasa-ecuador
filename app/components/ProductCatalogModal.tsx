'use client';

import { useState } from 'react';
import { InventoryItem } from '../types';
import CatalogDownloadButton from './CatalogDownloadButton';

interface ProductCatalogModalProps {
  inventory: InventoryItem[];
  onClose: () => void;
}

export default function ProductCatalogModal({ inventory, onClose }: ProductCatalogModalProps) {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [catalogTitle, setCatalogTitle] = useState('Product Catalog');
  const [includeStock, setIncludeStock] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(6);

  const toggleItem = (itemId: string) => {
    setSelectedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const toggleAll = () => {
    if (selectedItems.length === inventory.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(inventory.map(item => item.id));
    }
  };

  const selectedInventory = inventory.filter(item => selectedItems.includes(item.id));

  // Group by category for better organization
  const categories = [...new Set(inventory.map(item => item.category))].sort();

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-[#4f0c1b] to-[#6b1426] text-white px-6 py-5 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold">Create Product Catalog</h3>
            <p className="text-sm text-white/80 mt-1">
              Select products to include in your beautiful PDF catalog
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Configuration Section */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">Catalog Title</label>
              <input
                type="text"
                value={catalogTitle}
                onChange={(e) => setCatalogTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                placeholder="Product Catalog"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">Items Per Page</label>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
              >
                <option value={4}>4 items per page</option>
                <option value={6}>6 items per page</option>
                <option value={8}>8 items per page</option>
                <option value={9}>9 items per page</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeStock}
                  onChange={(e) => setIncludeStock(e.target.checked)}
                  className="rounded border-gray-300 text-[#4f0c1b] focus:ring-[#4f0c1b]"
                />
                <span className="text-sm font-medium text-gray-700">Include Stock Info</span>
              </label>
            </div>
          </div>
        </div>

        {/* Selection Controls */}
        <div className="px-6 py-4 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between">
            <button
              onClick={toggleAll}
              className="text-sm font-medium text-[#4f0c1b] hover:text-[#3d0a15] transition-colors"
            >
              {selectedItems.length === inventory.length ? 'Deselect All' : 'Select All'}
            </button>
            <div className="text-sm text-gray-600">
              <span className="font-semibold text-[#4f0c1b]">{selectedItems.length}</span> of {inventory.length} products selected
            </div>
          </div>
        </div>

        {/* Product Selection Grid */}
        <div className="overflow-y-auto max-h-[calc(90vh-20rem)] p-6">
          {categories.map(category => {
            const categoryItems = inventory.filter(item => item.category === category);
            return (
              <div key={category} className="mb-6">
                <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                  {category}
                  <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full font-normal">
                    {categoryItems.length}
                  </span>
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {categoryItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => toggleItem(item.id)}
                      className={`
                        relative p-3 rounded-xl border-2 transition-all text-left group
                        ${selectedItems.includes(item.id)
                          ? 'border-[#4f0c1b] bg-[#4f0c1b]/5 shadow-md'
                          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                        }
                      `}
                    >
                      {/* Checkbox */}
                      <div className="absolute top-2 right-2 z-10">
                        <div className={`
                          w-5 h-5 rounded border-2 flex items-center justify-center transition-all
                          ${selectedItems.includes(item.id)
                            ? 'bg-[#4f0c1b] border-[#4f0c1b]'
                            : 'bg-white border-gray-300 group-hover:border-gray-400'
                          }
                        `}>
                          {selectedItems.includes(item.id) && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>

                      {/* Image */}
                      {item.images && item.images.length > 0 ? (
                        <div className="aspect-square mb-2 rounded-lg overflow-hidden bg-gray-100">
                          <img
                            src={item.images[0]}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="aspect-square mb-2 rounded-lg bg-gray-100 flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}

                      {/* Info */}
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-gray-900 line-clamp-2">{item.name}</p>
                        <p className="text-xs text-gray-500 font-mono">{item.sku}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all font-medium text-gray-700"
          >
            Cancel
          </button>
          {selectedItems.length > 0 ? (
            <CatalogDownloadButton
              products={selectedInventory}
              catalogTitle={catalogTitle}
              includeStock={includeStock}
              itemsPerPage={itemsPerPage}
              fileName={`${catalogTitle.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`}
            />
          ) : (
            <button
              disabled
              className="flex-1 bg-gray-300 text-gray-500 px-6 py-3 rounded-xl font-medium cursor-not-allowed"
            >
              Select products to generate catalog
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
