'use client';

import { useState } from 'react';
import { InventoryItem } from '../types';
import CatalogDownloadButton from './CatalogDownloadButton';
import { useTranslation } from '../context/TranslationContext';

type CatalogLocale = 'en' | 'es';

interface ProductCatalogModalProps {
  inventory: InventoryItem[];
  onClose: () => void;
}

export default function ProductCatalogModal({ inventory, onClose }: ProductCatalogModalProps) {
  const { t } = useTranslation();
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [catalogTitle, setCatalogTitle] = useState(t('catalog.title'));
  const [includeStock, setIncludeStock] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(4);
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [catalogLocale, setCatalogLocale] = useState<CatalogLocale>('en');
  
  // Filter states
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterLine, setFilterLine] = useState<string>('all');
  const [filterEcuadorStock, setFilterEcuadorStock] = useState(false);
  const [filterUsaStock, setFilterUsaStock] = useState(false);

  const toggleItem = (itemId: string) => {
    setSelectedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const toggleAll = () => {
    if (selectedItems.length === filteredInventory.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredInventory.map(item => item.id));
    }
  };

  // Filter inventory based on category, line, and stock location filters
  const filteredInventory = inventory.filter(item => {
    if (filterCategory !== 'all' && item.category !== filterCategory) {
      return false;
    }
    if (filterLine !== 'all' && item.line !== filterLine) {
      return false;
    }
    
    // Stock location filters
    if (filterEcuadorStock && item.ecuadorStock <= 0) {
      return false;
    }
    if (filterUsaStock && item.usaStock <= 0) {
      return false;
    }
    
    // If both stock filters are enabled, item must have stock in both locations
    if (filterEcuadorStock && filterUsaStock) {
      return item.ecuadorStock > 0 && item.usaStock > 0;
    }
    
    return true;
  });

  const selectedInventory = filteredInventory.filter(item => selectedItems.includes(item.id));

  // Get unique categories and lines for filter dropdowns
  const categories = [...new Set(inventory.map(item => item.category))].sort();
  const lines = [...new Set(inventory.map(item => item.line).filter(line => line && line.trim() !== ''))].sort();

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-6xl h-[95vh] sm:h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-500">
        {/* Compact Header */}
        <div className="bg-gradient-to-r from-[#4f0c1b] to-[#6b1426] text-white px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Create Product Catalog</h3>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white hover:bg-white/10 rounded-full p-1.5 transition-all duration-200"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Compact Configuration */}
        <div className="px-4 sm:px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Catalog Title */}
            <div className="md:col-span-2">
              <label className="block text-xs font-medium mb-1 text-gray-700">Catalog Title</label>
              <input
                type="text"
                value={catalogTitle}
                onChange={(e) => setCatalogTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#4f0c1b] focus:border-[#4f0c1b] bg-white text-sm"
                placeholder="Enter catalog name..."
              />
            </div>

            {/* Layout, Orientation, Language & Include Stock */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1 text-gray-700">Layout</label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#4f0c1b] focus:border-[#4f0c1b] bg-white text-sm"
                >
                  <option value={2}>2 per page</option>
                  <option value={4}>4 per page</option>
                  <option value={6}>6 per page</option>
                  <option value={8}>8 per page</option>
                  <option value={9}>9 per page</option>
                </select>
              </div>
              
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1 text-gray-700">Orientation</label>
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#4f0c1b] focus:border-[#4f0c1b] bg-white text-sm"
                >
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                </select>
              </div>

              <div className="flex-1">
                <label className="block text-xs font-medium mb-1 text-gray-700">{t('catalog.selectLanguage')}</label>
                <select
                  value={catalogLocale}
                  onChange={(e) => setCatalogLocale(e.target.value as CatalogLocale)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#4f0c1b] focus:border-[#4f0c1b] bg-white text-sm"
                >
                  <option value="en">{t('catalog.english')}</option>
                  <option value="es">{t('catalog.spanish')}</option>
                </select>
              </div>
              
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-gray-300 hover:border-[#4f0c1b] transition-colors">
                  <input
                    type="checkbox"
                    checked={includeStock}
                    onChange={(e) => setIncludeStock(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-[#4f0c1b] focus:ring-[#4f0c1b]"
                  />
                  <span className="text-xs font-medium text-gray-700">Stock</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Compact Filter Section */}
        <div className="px-4 sm:px-6 py-3 bg-white border-b border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <h4 className="text-sm font-semibold text-gray-800">Filters</h4>
            </div>
            {(filterCategory !== 'all' || filterLine !== 'all' || filterEcuadorStock || filterUsaStock) && (
              <button
                onClick={() => {
                  setFilterCategory('all');
                  setFilterLine('all');
                  setFilterEcuadorStock(false);
                  setFilterUsaStock(false);
                }}
                className="text-xs text-[#4f0c1b] hover:text-[#3d0a15] font-medium"
              >
                Clear All
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Category Filter */}
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">Category</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#4f0c1b] focus:border-[#4f0c1b] bg-white text-xs"
              >
                <option value="all">All Categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            {/* Line Filter */}
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">Line</label>
              <select
                value={filterLine}
                onChange={(e) => setFilterLine(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#4f0c1b] focus:border-[#4f0c1b] bg-white text-xs"
              >
                <option value="all">All Lines</option>
                {lines.map(line => (
                  <option key={line} value={line}>{line}</option>
                ))}
              </select>
            </div>

            {/* Ecuador Stock */}
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer bg-gray-50 hover:bg-gray-100 px-2 py-1.5 rounded-md transition-colors w-full">
                <input
                  type="checkbox"
                  checked={filterEcuadorStock}
                  onChange={(e) => setFilterEcuadorStock(e.target.checked)}
                  className="w-3 h-3 rounded border-gray-300 text-[#4f0c1b] focus:ring-[#4f0c1b]"
                />
                <span className="text-xs font-medium text-gray-700">Ecuador</span>
              </label>
            </div>

            {/* USA Stock */}
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer bg-gray-50 hover:bg-gray-100 px-2 py-1.5 rounded-md transition-colors w-full">
                <input
                  type="checkbox"
                  checked={filterUsaStock}
                  onChange={(e) => setFilterUsaStock(e.target.checked)}
                  className="w-3 h-3 rounded border-gray-300 text-[#4f0c1b] focus:ring-[#4f0c1b]"
                />
                <span className="text-xs font-medium text-gray-700">USA</span>
              </label>
            </div>
          </div>
        </div>

        {/* Compact Selection Summary */}
        <div className="px-4 sm:px-6 py-2 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4f0c1b] hover:bg-[#3d0a15] text-white rounded-md transition-all duration-200 font-medium text-xs"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {selectedItems.length === filteredInventory.length ? 'Deselect All' : 'Select All'}
              </button>

              <div className="flex items-center gap-1 text-xs">
                <span className="font-semibold text-[#4f0c1b]">{selectedItems.length}</span>
                <span className="text-gray-600">of</span>
                <span className="font-semibold text-gray-800">{filteredInventory.length}</span>
                <span className="text-gray-600">products</span>
                {(filterCategory !== 'all' || filterLine !== 'all' || filterEcuadorStock || filterUsaStock) && (
                  <span className="text-xs text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded-full ml-1">
                    filtered
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Compact Product Grid */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6">
            {filteredInventory.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">No products found</h3>
                <p className="text-gray-600">Try adjusting your filters to see more products</p>
              </div>
            ) : (
              <div className="space-y-8">
                {categories.map(category => {
                  const categoryItems = filteredInventory.filter(item => item.category === category);
                  if (categoryItems.length === 0) return null;
                  
                  return (
                    <div key={category} className="space-y-4">
                      <div className="flex items-center gap-3">
                        <h4 className="text-xl font-bold text-gray-800">{category}</h4>
                        <span className="bg-[#4f0c1b] text-white text-sm px-3 py-1 rounded-full font-medium">
                          {categoryItems.length} items
                        </span>
                      </div>
                      
                           <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                             {categoryItems.map(item => (
                               <button
                                 key={item.id}
                                 onClick={() => toggleItem(item.id)}
                                 className={`
                                   group relative p-3 rounded-xl border-2 transition-all duration-300 text-left overflow-hidden
                                   ${selectedItems.includes(item.id)
                                     ? 'border-[#4f0c1b] bg-gradient-to-br from-[#4f0c1b]/5 to-[#6b1426]/5 shadow-lg scale-[1.02]'
                                     : 'border-gray-200 hover:border-gray-300 hover:shadow-md hover:scale-[1.01] bg-white'
                                   }
                                 `}
                               >
                            {/* Selection Indicator */}
                            <div className="absolute top-2 right-2 z-10">
                              <div className={`
                                w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-200
                                ${selectedItems.includes(item.id)
                                  ? 'bg-[#4f0c1b] border-[#4f0c1b] shadow-lg'
                                  : 'bg-white border-gray-300 group-hover:border-gray-400'
                                }
                              `}>
                                {selectedItems.includes(item.id) && (
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </div>

                            {/* Product Image */}
                            <div className="aspect-square mb-2 rounded-lg overflow-hidden bg-gray-50">
                              {item.images && item.images.length > 0 ? (
                                <img
                                  src={item.images[0]}
                                  alt={item.name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                </div>
                              )}
                            </div>

                            {/* Product Info */}
                            <div className="space-y-1">
                              <h5 className="font-semibold text-gray-900 text-xs line-clamp-2 leading-tight">{item.name}</h5>
                              <p className="text-xs text-gray-500 font-mono">{item.sku}</p>
                              <div className="flex items-center gap-1 text-xs">
                                <span className="text-gray-600">EC {item.ecuadorStock}</span>
                                <span className="text-gray-600">USA {item.usaStock}</span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Compact Footer */}
        <div className="px-4 sm:px-6 py-2 bg-gray-50 border-t border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-600">
              {selectedItems.length > 0 ? (
                <span className="font-medium text-[#4f0c1b]">{selectedItems.length} products selected</span>
              ) : (
                <span>Select products to create your catalog</span>
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 transition-all font-medium text-gray-700 text-xs"
              >
                Cancel
              </button>
              {selectedItems.length > 0 ? (
                <CatalogDownloadButton
                  products={selectedInventory}
                  catalogTitle={catalogTitle}
                  includeStock={includeStock}
                  itemsPerPage={itemsPerPage}
                  orientation={orientation}
                  locale={catalogLocale}
                  fileName={`${catalogTitle.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`}
                />
              ) : (
                <button
                  disabled
                  className="px-3 py-1.5 bg-gray-200 text-gray-400 rounded-md font-medium cursor-not-allowed text-xs"
                >
                  Select Products
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
