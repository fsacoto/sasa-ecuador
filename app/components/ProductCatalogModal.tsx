'use client';

import { useState } from 'react';
import { InventoryItem } from '../types';
import CatalogDownloadButton from './CatalogDownloadButton';
import { useTranslation } from '../context/TranslationContext';
import { displayCategory, displayLine } from '../utils/merchandiseLabels';

interface ProductCatalogModalProps {
  inventory: InventoryItem[];
  onClose: () => void;
  /** Misma preferencia que el panel principal (page.tsx). */
  darkMode?: boolean;
}

export default function ProductCatalogModal({
  inventory,
  onClose,
  darkMode = false,
}: ProductCatalogModalProps) {
  const { t } = useTranslation();
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [catalogTitle, setCatalogTitle] = useState(() => t('inventory.catalog.title'));
  const [includeStock, setIncludeStock] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(4);
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');

  // Filter states
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterLine, setFilterLine] = useState<string>('all');
  const [filterEcuadorStock, setFilterEcuadorStock] = useState(false);

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
    if (filterCategory !== 'all') {
      if (displayCategory(item.category) !== displayCategory(filterCategory)) return false;
    }
    if (filterLine !== 'all') {
      const il = item.line ? displayLine(item.line) : '';
      const fl = displayLine(filterLine);
      if (il !== fl) return false;
    }
    
    // Stock location filters
    if (filterEcuadorStock && item.ecuadorStock <= 0) {
      return false;
    }
    
    return true;
  });

  const selectedInventory = filteredInventory.filter(item => selectedItems.includes(item.id));

  // Get unique categories and lines for filter dropdowns
  const categories = [...new Set(inventory.map(item => displayCategory(item.category)))].sort();
  const lines = [
    ...new Set(
      inventory
        .map(item => item.line)
        .filter((line): line is string => Boolean(line && line.trim() !== ''))
        .map((line) => displayLine(line))
    ),
  ].sort();

  const d = darkMode;
  const shellOverlay = d ? 'bg-black/70' : 'bg-black/40';
  const card = d ? 'border border-gray-700 bg-[#111111] text-gray-100' : 'bg-white text-gray-900';
  const headerBar = d ? 'border-b border-gray-800 bg-[#111111]' : 'bg-white';
  const bodyBg = d ? 'bg-[#111111]' : 'bg-white';
  const fieldLabel = d ? 'text-gray-300' : 'text-gray-700';
  const fieldInput = d
    ? 'border-gray-600 bg-[#1a1a1a] text-gray-100 placeholder:text-gray-500'
    : 'border-gray-300 bg-white text-gray-900';
  const subtle = d ? 'text-gray-400' : 'text-gray-600';
  const footerBar = d ? 'border-t border-gray-800 bg-[#111111]' : 'bg-white';
  const cancelBtn = d
    ? 'border-gray-600 text-gray-200 hover:bg-[#1a1a1a]'
    : 'border-gray-300 text-gray-700 hover:bg-gray-50';
  const filterHead = d ? 'text-gray-200' : 'text-gray-800';
  const filterStockChip = d ? 'bg-[#1a1a1a] hover:bg-[#252525]' : 'bg-gray-50 hover:bg-gray-100';
  const emptyIconBg = d ? 'bg-gray-800' : 'bg-gray-100';
  const catTitle = d ? 'text-gray-100' : 'text-gray-800';
  const cardTitle = d ? 'text-gray-100' : 'text-gray-900';
  const cardSku = d ? 'text-gray-400' : 'text-gray-500';
  const cardStock = d ? 'text-gray-400' : 'text-gray-600';
  const imgPlaceholder = d ? 'bg-[#1a1a1a]' : 'bg-gray-50';
  const selRing = d ? 'border-gray-500 bg-[#1a1a1a]' : 'border-gray-300 bg-white';
  const selRingHover = 'group-hover:border-gray-400';
  const gridIdle = d
    ? 'border-gray-600 hover:border-gray-500 hover:shadow-md hover:scale-[1.01] bg-[#1a1a1a]'
    : 'border-gray-200 hover:border-gray-300 hover:shadow-md hover:scale-[1.01] bg-white';
  const badgeMuted = d ? 'text-gray-400 bg-gray-800' : 'text-gray-500 bg-gray-200';

  return (
    <div
      className={`fixed inset-0 ${shellOverlay} backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-300`}
    >
      <div
        className={`rounded-2xl sm:rounded-3xl w-full max-w-6xl h-[95vh] sm:h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-500 ${card}`}
      >
        {/* Header */}
        <div
          className={`sticky top-0 z-10 flex shrink-0 items-center justify-between px-4 py-4 sm:px-6 ${headerBar}`}
        >
          <h3 className={`text-lg font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>
            {t('inventory.catalog.createModalTitle')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className={d ? 'text-gray-400 transition-colors hover:text-gray-200' : 'text-gray-400 transition-colors hover:text-gray-600'}
            aria-label={t('common.close')}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Configuration */}
        <div className={`px-4 sm:px-6 pb-4 pt-0 ${bodyBg}`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Catalog Title */}
            <div className="md:col-span-2">
              <label className={`block text-xs font-medium mb-1 ${fieldLabel}`}>{t('inventory.catalog.catalogTitleLabel')}</label>
              <input
                type="text"
                value={catalogTitle}
                onChange={(e) => setCatalogTitle(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#515151] focus:border-[#515151] text-sm ${fieldInput}`}
                placeholder={t('inventory.catalog.catalogTitlePlaceholder')}
              />
            </div>

            {/* Diseño, orientación e incluir stock */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={`block text-xs font-medium mb-1 ${fieldLabel}`}>{t('inventory.catalog.layoutLabel')}</label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#515151] focus:border-[#515151] text-sm ${fieldInput}`}
                >
                  <option value={2}>2 por página</option>
                  <option value={4}>4 por página</option>
                  <option value={6}>6 por página</option>
                  <option value={8}>8 por página</option>
                  <option value={9}>9 por página</option>
                </select>
              </div>

              <div className="flex-1">
                <label className={`block text-xs font-medium mb-1 ${fieldLabel}`}>{t('inventory.catalog.orientationLabel')}</label>
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#515151] focus:border-[#515151] text-sm ${fieldInput}`}
                >
                  <option value="landscape">{t('inventory.catalog.landscape')}</option>
                  <option value="portrait">{t('inventory.catalog.portrait')}</option>
                </select>
              </div>

              <div className="flex items-end">
                <label
                  className={`flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border transition-colors ${
                    d ? 'border-gray-600 bg-[#1a1a1a] hover:border-[#515151]' : 'border-gray-300 bg-white hover:border-[#515151]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={includeStock}
                    onChange={(e) => setIncludeStock(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-[#515151] focus:ring-[#515151]"
                  />
                  <span className={`text-xs font-medium ${fieldLabel}`}>{t('inventory.catalog.includeStockShort')}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className={`px-4 sm:px-6 py-4 ${bodyBg}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#515151]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <h4 className={`text-sm font-semibold ${filterHead}`}>{t('inventory.catalog.filtersLabel')}</h4>
            </div>
            {(filterCategory !== 'all' || filterLine !== 'all' || filterEcuadorStock) && (
              <button
                onClick={() => {
                  setFilterCategory('all');
                  setFilterLine('all');
                  setFilterEcuadorStock(false);
                }}
                className={`text-xs font-medium ${d ? 'text-gray-300 hover:text-white' : 'text-[#515151] hover:text-[#000000]'}`}
              >
                {t('inventory.clearAllFilters')}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {/* Category Filter */}
            <div>
              <label className={`block text-xs font-medium mb-1 ${fieldLabel}`}>{t('inventory.catalog.categoryFilterLabel')}</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className={`w-full px-2 py-1.5 border rounded-md focus:outline-none focus:ring-1 focus:ring-[#515151] focus:border-[#515151] text-xs ${fieldInput}`}
              >
                <option value="all">{t('inventory.catalog.allCategoriesOption')}</option>
                {categories.map(category => (
                  <option key={category} value={category}>{displayCategory(category)}</option>
                ))}
              </select>
            </div>

            {/* Line Filter */}
            <div>
              <label className={`block text-xs font-medium mb-1 ${fieldLabel}`}>{t('inventory.catalog.lineFilterLabel')}</label>
              <select
                value={filterLine}
                onChange={(e) => setFilterLine(e.target.value)}
                className={`w-full px-2 py-1.5 border rounded-md focus:outline-none focus:ring-1 focus:ring-[#515151] focus:border-[#515151] text-xs ${fieldInput}`}
              >
                <option value="all">{t('inventory.catalog.allLinesOption')}</option>
                {lines.map(line => (
                  <option key={line} value={line}>{line}</option>
                ))}
              </select>
            </div>

            {/* In stock (Ecuador hub) */}
            <div className="flex items-end">
              <label className={`flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded-md transition-colors w-full ${filterStockChip}`}>
                <input
                  type="checkbox"
                  checked={filterEcuadorStock}
                  onChange={(e) => setFilterEcuadorStock(e.target.checked)}
                  className="w-3 h-3 rounded border-gray-300 text-[#515151] focus:ring-[#515151]"
                />
                <span className={`text-xs font-medium ${fieldLabel}`}>{t('inventory.catalog.inStockFilter') || 'In stock'}</span>
              </label>
            </div>
          </div>
        </div>

        {/* Selection summary */}
        <div className={`px-4 sm:px-6 py-3 ${bodyBg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#515151] hover:bg-[#000000] text-white rounded-md transition-all duration-200 font-medium text-xs"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {selectedItems.length === filteredInventory.length
                  ? t('inventory.catalog.deselectAllProducts')
                  : t('inventory.catalog.selectAllProducts')}
              </button>

              <div className="flex items-center gap-1 text-xs">
                <span className="font-semibold text-[#515151]">{selectedItems.length}</span>
                <span className={subtle}>{t('inventory.catalog.selectedCountOf')}</span>
                <span className={`font-semibold ${d ? 'text-gray-200' : 'text-gray-800'}`}>{filteredInventory.length}</span>
                <span className={subtle}>{t('inventory.catalog.productsSelectedSuffix')}</span>
                {(filterCategory !== 'all' || filterLine !== 'all' || filterEcuadorStock) && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ml-1 ${badgeMuted}`}>
                    {t('inventory.catalog.filteredBadge')}
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
                <div className={`w-16 h-16 ${emptyIconBg} rounded-full flex items-center justify-center mx-auto mb-4`}>
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <h3 className={`text-lg font-semibold mb-2 ${catTitle}`}>{t('inventory.catalog.noProductsFilteredTitle')}</h3>
                <p className={subtle}>{t('inventory.catalog.noProductsFilteredHint')}</p>
              </div>
            ) : (
              <div className="space-y-8">
                {categories.map(category => {
                  const categoryItems = filteredInventory.filter(
                    item => displayCategory(item.category) === displayCategory(category)
                  );
                  if (categoryItems.length === 0) return null;
                  
                  return (
                    <div key={category} className="space-y-4">
                      <div className="flex items-center gap-3">
                        <h4 className={`text-xl font-bold ${catTitle}`}>{displayCategory(category)}</h4>
                        <span className="bg-[#515151] text-white text-sm px-3 py-1 rounded-full font-medium">
                          {categoryItems.length} {t('inventory.catalog.itemsInCategory')}
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
                                     ? 'border-[#515151] bg-gradient-to-br from-[#515151]/5 to-[#000000]/5 shadow-lg scale-[1.02]'
                                     : gridIdle
                                   }
                                 `}
                               >
                            {/* Selection Indicator */}
                            <div className="absolute top-2 right-2 z-10">
                              <div className={`
                                w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-200
                                ${selectedItems.includes(item.id)
                                  ? 'bg-[#515151] border-[#515151] shadow-lg'
                                  : `${selRing} ${selRingHover}`
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
                            <div className={`aspect-square mb-2 rounded-lg overflow-hidden ${imgPlaceholder}`}>
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
                              <h5 className={`font-semibold text-xs line-clamp-2 leading-tight ${cardTitle}`}>{item.name}</h5>
                              <p className={`text-xs font-mono ${cardSku}`}>{item.sku}</p>
                              <div className="flex items-center gap-1 text-xs">
                                <span className={cardStock}>{t('inventory.catalog.stockShort') || 'Stock'} {item.ecuadorStock}</span>
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

        {/* Footer */}
        <div className={`flex shrink-0 items-center justify-between gap-4 px-4 py-4 sm:px-6 ${footerBar}`}>
          <div className={`min-w-0 text-xs ${subtle}`}>
            {selectedItems.length > 0 ? (
              <span className="font-medium text-[#515151]">
                {selectedItems.length} {t('inventory.catalog.productsSelectedSuffix')}
              </span>
            ) : (
              <span>{t('inventory.catalog.selectProductsHint')}</span>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-3 py-1.5 border rounded-md transition-all font-medium text-xs ${cancelBtn}`}
            >
              {t('inventory.catalog.cancelModal')}
            </button>
            {selectedItems.length > 0 ? (
              <CatalogDownloadButton
                products={selectedInventory}
                catalogTitle={catalogTitle}
                includeStock={includeStock}
                itemsPerPage={itemsPerPage}
                orientation={orientation}
                fileName={`${catalogTitle.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`}
              />
            ) : (
              <button
                type="button"
                disabled
                className={`px-3 py-1.5 rounded-md font-medium cursor-not-allowed text-xs ${
                  d ? 'bg-gray-800 text-gray-500' : 'bg-gray-200 text-gray-400'
                }`}
              >
                {t('inventory.catalog.selectProductsDisabled')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
