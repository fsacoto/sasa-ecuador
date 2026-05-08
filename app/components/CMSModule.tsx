'use client';

import React, { useState, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';

interface CMSFilters {
  category: string;
  line: string;
  availability: string;
  search: string;
}

export default function CMSModule() {
  const { inventory, suppliers } = useInventory();
  const { hasPermission } = useAuth();
  const [filters, setFilters] = useState<CMSFilters>({
    category: 'all',
    line: 'all',
    availability: 'all',
    search: ''
  });
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get unique categories and lines
  const categories = [...new Set(inventory.map(item => item.category))].filter(Boolean).sort();
  const lines = [...new Set(inventory.map(item => item.line))].filter(Boolean).sort();

  // Filter inventory based on CMS filters
  const filteredInventory = inventory.filter(item => {
    if (filters.category !== 'all' && item.category !== filters.category) return false;
    if (filters.line !== 'all' && item.line !== filters.line) return false;
    if (filters.search && !item.name.toLowerCase().includes(filters.search.toLowerCase()) && 
        !item.sku.toLowerCase().includes(filters.search.toLowerCase())) return false;
    
    if (filters.availability !== 'all') {
      const totalStock = item.ecuadorStock + item.usaStock;
      switch (filters.availability) {
        case 'in-stock':
          return totalStock > 0;
        case 'out-of-stock':
          return totalStock === 0;
        case 'ecuador-only':
          return item.ecuadorStock > 0 && item.usaStock === 0;
        case 'usa-only':
          return item.usaStock > 0 && item.ecuadorStock === 0;
        case 'both-countries':
          return item.ecuadorStock > 0 && item.usaStock > 0;
      }
    }
    
    return true;
  });

  const handleSelectItem = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === filteredInventory.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredInventory.map(item => item.id)));
    }
  };

  const downloadImages = async () => {
    if (selectedItems.size === 0) {
      alert('Please select items to download images');
      return;
    }

    setIsExporting(true);
    
    try {
      const selectedInventory = inventory.filter(item => selectedItems.has(item.id));
      
      for (const item of selectedInventory) {
        if (item.images && item.images.length > 0) {
          for (let i = 0; i < item.images.length; i++) {
            const imageUrl = item.images[i];
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${item.sku}_${i + 1}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Small delay between downloads
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
    } catch (error) {
      console.error('Error downloading images:', error);
      alert('Error downloading images. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const generateMarketingDocument = () => {
    if (selectedItems.size === 0) {
      alert('Please select items to generate document');
      return;
    }

    const selectedInventory = inventory.filter(item => selectedItems.has(item.id));
    
    let content = `SASA Product Catalog\n`;
    content += `Generated on: ${new Date().toLocaleDateString()}\n\n`;
    
    selectedInventory.forEach((item, index) => {
      const totalStock = item.ecuadorStock + item.usaStock;
      const availability = totalStock > 0 ? 'In Stock' : 'Out of Stock';
      
      content += `${index + 1}. ${item.name}\n`;
      content += `   SKU: ${item.sku}\n`;
      content += `   Model: ${item.supplierSKU || 'N/A'}\n`;
      content += `   Category: ${item.category}\n`;
      content += `   Line: ${item.line}\n`;
      content += `   Availability: ${availability}\n`;
      content += `   Ecuador Stock: ${item.ecuadorStock} units\n`;
      content += `   USA Stock: ${item.usaStock} units\n`;
      content += `   Description: ${item.description || 'No description available'}\n`;
      content += `   Images: ${item.images?.length || 0} available\n\n`;
    });

    // Create and download the document
    const blob = new Blob([content], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `SASA_Product_Catalog_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generateSocialMediaContent = () => {
    if (selectedItems.size === 0) {
      alert('Please select items to generate social media content');
      return;
    }

    const selectedInventory = inventory.filter(item => selectedItems.has(item.id));
    
    let content = `#SASA #ProductCatalog #Inventory\n\n`;
    
    selectedInventory.forEach((item, index) => {
      const totalStock = item.ecuadorStock + item.usaStock;
      const availability = totalStock > 0 ? '✅ In Stock' : '❌ Out of Stock';
      
      content += `🛍️ ${item.name}\n`;
      content += `📦 SKU: ${item.sku}\n`;
      content += `🏷️ Category: ${item.category}\n`;
      content += `📍 Line: ${item.line}\n`;
      content += `📊 ${availability}\n`;
      if (item.description) {
        content += `📝 ${item.description}\n`;
      }
      content += `\n`;
    });

    // Create and download the document
    const blob = new Blob([content], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `SASA_SocialMedia_Content_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Content Management System</h2>
            <p className="text-gray-600 mt-1">Manage product content, images, and marketing materials</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
              {hasPermission('cms.edit') ? 'Full Access' : 'View Only'}
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <input
              type="text"
              placeholder="Search products..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
            >
              <option value="all">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Line</label>
            <select
              value={filters.line}
              onChange={(e) => setFilters({ ...filters, line: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
            >
              <option value="all">All Lines</option>
              {lines.map(line => (
                <option key={line} value={line}>{line}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Availability</label>
            <select
              value={filters.availability}
              onChange={(e) => setFilters({ ...filters, availability: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
            >
              <option value="all">All Items</option>
              <option value="in-stock">In Stock</option>
              <option value="out-of-stock">Out of Stock</option>
              <option value="ecuador-only">Ecuador Only</option>
              <option value="usa-only">USA Only</option>
              <option value="both-countries">Both Countries</option>
            </select>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={() => setFilters({ category: 'all', line: 'all', availability: 'all', search: '' })}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      {hasPermission('images.download') && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Marketing Tools</h3>
              <p className="text-gray-600 text-sm">Export content for marketing campaigns</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                {selectedItems.size} of {filteredInventory.length} selected
              </span>
              <button
                onClick={handleSelectAll}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
              >
                {selectedItems.size === filteredInventory.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>
          
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={downloadImages}
              disabled={selectedItems.size === 0 || isExporting}
              className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {isExporting ? 'Downloading...' : 'Download Images'}
            </button>
            
            <button
              onClick={generateMarketingDocument}
              disabled={selectedItems.size === 0}
              className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Generate Catalog
            </button>
            
            <button
              onClick={generateSocialMediaContent}
              disabled={selectedItems.size === 0}
              className="flex items-center gap-2 px-4 py-2 bg-pink-100 text-pink-700 rounded-lg hover:bg-pink-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 0h10m-9 0a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2" />
              </svg>
              Social Media Content
            </button>
          </div>
        </div>
      )}

      {/* Product Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Products ({filteredInventory.length})
          </h3>
        </div>
        
        <div className="p-6">
          {filteredInventory.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No products found</h3>
              <p className="mt-1 text-sm text-gray-500">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredInventory.map((item) => {
                const totalStock = item.ecuadorStock + item.usaStock;
                const isSelected = selectedItems.has(item.id);
                
                return (
                  <div
                    key={item.id}
                    className={`border rounded-lg p-4 transition-all duration-200 ${
                      isSelected ? 'border-[#515151] bg-[#515151]/5' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* Image */}
                    <div className="aspect-square bg-gray-100 rounded-lg mb-3 overflow-hidden">
                      {item.images && item.images.length > 0 ? (
                        <img
                          src={item.images[0]}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    
                    {/* Content */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium text-gray-900 text-sm line-clamp-2">{item.name}</h4>
                        {hasPermission('images.download') && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectItem(item.id)}
                            className="ml-2 h-4 w-4 text-[#515151] focus:ring-[#515151] border-gray-300 rounded"
                          />
                        )}
                      </div>
                      
                      <div className="text-xs text-gray-500 space-y-1">
                        <div><strong>SKU:</strong> {item.sku}</div>
                        <div><strong>Model:</strong> {item.supplierSKU || 'N/A'}</div>
                        <div><strong>Category:</strong> {item.category}</div>
                        <div><strong>Line:</strong> {item.line}</div>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs">
                        <span className={`px-2 py-1 rounded-full font-medium ${
                          totalStock > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {totalStock > 0 ? 'In Stock' : 'Out of Stock'}
                        </span>
                        <span className="text-gray-500">
                          {item.images?.length || 0} images
                        </span>
                      </div>
                      
                      <div className="text-xs text-gray-500">
                        <div>Ecuador: {item.ecuadorStock} units</div>
                        <div>USA: {item.usaStock} units</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
