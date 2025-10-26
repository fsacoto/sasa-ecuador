'use client';

import React, { useState, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { useCMS } from '../context/CMSContext';
import { CMSContent, ContentType, ContentStatus } from '../types';

type ViewMode = 'dashboard' | 'upload' | 'manage' | 'products';

export default function CMSModuleNew() {
  const { user, hasPermission } = useAuth();
  const { inventory } = useInventory();
  const { 
    content, 
    addContent, 
    updateContent, 
    deleteContent, 
    updateContentStatus,
    getContentStats 
  } = useCMS();
  
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [uploadType, setUploadType] = useState<ContentType>('product');
  const [selectedSKUs, setSelectedSKUs] = useState<string[]>([]);
  const [searchSKU, setSearchSKU] = useState('');
  const [filterStatus, setFilterStatus] = useState<ContentStatus | 'all'>('all');
  const [filterSKU, setFilterSKU] = useState('');
  
  // Upload form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    hashtags: '',
    category: '',
    line: '',
    tags: '',
    language: 'en' as 'en' | 'es',
  });

  // Get unique categories and lines from inventory for dropdowns
  const availableCategories = [...new Set(inventory.map(item => item.category))].filter(Boolean).sort();
  const availableLines = [...new Set(inventory.map(item => item.line))].filter(Boolean).sort();
  const [uploadedFiles, setUploadedFiles] = useState<(File | string)[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  
  const stats = getContentStats();
  
  // Filter content
  const filteredContent = content.filter(item => {
    if (filterStatus !== 'all' && item.status !== filterStatus) return false;
    if (filterSKU && !item.linkedProductIds.some(sku => sku.toLowerCase().includes(filterSKU.toLowerCase()))) return false;
    return true;
  });

  // Search SKU function
  const handleSKUSearch = () => {
    const product = inventory.find(item => 
      item.sku.toLowerCase() === searchSKU.toLowerCase() || 
      item.name.toLowerCase().includes(searchSKU.toLowerCase())
    );
    
    if (product) {
      setSelectedProduct(product);
      if (!selectedSKUs.includes(product.sku)) {
        setSelectedSKUs([...selectedSKUs, product.sku]);
      }
      // Auto-fill category and line from the selected product
      setFormData({
        ...formData,
        category: product.category || '',
        line: product.line || '',
      });
    } else {
      alert('Product not found. Please check the SKU or name.');
    }
    setSearchSKU('');
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    setUploadedFiles(prev => [...prev, ...imageFiles]);
  };

  // Upload files to Firebase Storage
  const convertFilesToBase64 = async (files: File[]): Promise<string[]> => {
    try {
      const { handleMultipleImageUpload } = await import('../utils/imageUpload');
      return await handleMultipleImageUpload(files, 'images/cms/');
    } catch (error) {
      console.error('Error uploading files:', error);
      throw error;
    }
  };

  // Submit content
  const handleSubmit = async () => {
    if (!selectedSKUs.length && uploadType === 'product') {
      alert('Please select at least one product for this content type.');
      return;
    }

    // For collection/general types, require title and description
    if (uploadType !== 'product') {
      if (!formData.title || !formData.description) {
        alert('Please fill in title and description.');
        return;
      }
    }

    const fileUrls = uploadedFiles.length > 0 
      ? await convertFilesToBase64(uploadedFiles.filter((f): f is File => f instanceof File))
      : [];

    // For product type, use product name as title, otherwise use form title
    const contentTitle = uploadType === 'product' 
      ? (selectedProduct?.name || `Product Content - ${selectedSKUs[0]}`)
      : formData.title;

    const hashtagsArray = uploadType === 'product' 
      ? [] 
      : formData.hashtags.split(',').map(tag => tag.trim()).filter(Boolean);
    const tagsArray = uploadType === 'product' 
      ? [] 
      : formData.tags.split(',').map(tag => tag.trim()).filter(Boolean);

    addContent({
      type: uploadType,
      title: contentTitle,
      description: formData.description || '',
      hashtags: hashtagsArray,
      status: 'draft',
      statusHistory: [{
        status: 'draft',
        timestamp: new Date(),
        userId: user?.id || '',
      }],
      images: fileUrls,
      videos: [],
      authorId: user?.id || '',
      authorName: user?.name || 'Unknown',
      category: formData.category,
      tags: tagsArray,
      language: formData.language,
      linkedProductIds: selectedSKUs,
    });

    // Reset form
    setFormData({
      title: '',
      description: '',
      hashtags: '',
      category: '',
      line: '',
      tags: '',
      language: 'en',
    });
    setUploadedFiles([]);
    setSelectedSKUs([]);
    setSelectedProduct(null);
    alert('Content created successfully! It is now in draft status.');
  };

  const handleApprove = (contentId: string) => {
    updateContentStatus(contentId, 'approved', user?.id || '', 'Content approved');
  };

  const handleReject = (contentId: string) => {
    const notes = prompt('Enter rejection reason:');
    if (notes) {
      updateContentStatus(contentId, 'draft', user?.id || '', notes);
    }
  };

  const handlePublish = (contentId: string) => {
    updateContentStatus(contentId, 'published', user?.id || '');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Content Management System</h2>
            <p className="text-gray-600 mt-1">Upload and manage marketing content</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
              {hasPermission('cms.edit') ? 'Full Access' : 'View Only'}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2">
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('dashboard')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'dashboard'
                ? 'bg-[#4f0c1b] text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setViewMode('products')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'products'
                ? 'bg-[#4f0c1b] text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Products
          </button>
          <button
            onClick={() => setViewMode('upload')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'upload'
                ? 'bg-[#4f0c1b] text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Upload Content
          </button>
          <button
            onClick={() => setViewMode('manage')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'manage'
                ? 'bg-[#4f0c1b] text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Manage Content
          </button>
        </div>
      </div>

      {/* Dashboard View */}
      {viewMode === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase">Total Content</div>
                <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase">Drafts</div>
                <div className="text-2xl font-bold text-gray-900">{stats.draft}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase">Submitted</div>
                <div className="text-2xl font-bold text-gray-900">{stats.submitted}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase">Approved</div>
                <div className="text-2xl font-bold text-gray-900">{stats.approved}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase">Published</div>
                <div className="text-2xl font-bold text-gray-900">{stats.published}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase">Archived</div>
                <div className="text-2xl font-bold text-gray-900">{stats.archived}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Products View */}
      {viewMode === 'products' && (
        <ProductsView 
          inventory={inventory}
          handleSelectProduct={(product) => {
            setSelectedProduct(product);
            if (!selectedSKUs.includes(product.sku)) {
              setSelectedSKUs([...selectedSKUs, product.sku]);
            }
            setViewMode('upload');
          }}
        />
      )}

      {/* Upload View */}
      {viewMode === 'upload' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Upload Content</h3>
          
          {/* Content Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Content Type</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setUploadType('product')}
                className={`px-4 py-3 rounded-lg border transition-colors ${
                  uploadType === 'product'
                    ? 'bg-[#4f0c1b] text-white border-[#4f0c1b]'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Single Product
              </button>
              <button
                onClick={() => setUploadType('collection')}
                className={`px-4 py-3 rounded-lg border transition-colors ${
                  uploadType === 'collection'
                    ? 'bg-[#4f0c1b] text-white border-[#4f0c1b]'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Collection
              </button>
              <button
                onClick={() => setUploadType('general')}
                className={`px-4 py-3 rounded-lg border transition-colors ${
                  uploadType === 'general'
                    ? 'bg-[#4f0c1b] text-white border-[#4f0c1b]'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                General
              </button>
            </div>
          </div>

          {/* SKU Search */}
          {uploadType !== 'general' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Link to Product (SKU)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchSKU}
                  onChange={(e) => setSearchSKU(e.target.value)}
                  placeholder="Search by SKU or product name"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b]"
                  onKeyPress={(e) => e.key === 'Enter' && handleSKUSearch()}
                />
                <button
                  onClick={handleSKUSearch}
                  className="px-4 py-2 bg-[#4f0c1b] text-white rounded-lg hover:bg-[#3d0a15]"
                >
                  Search
                </button>
              </div>

              {/* Selected Products */}
              {selectedProduct && (
                <div className="mt-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-900">{selectedProduct.name}</p>
                      <p className="text-sm text-gray-600">SKU: {selectedProduct.sku}</p>
                      <p className="text-sm text-gray-600">Model: {selectedProduct.supplierSKU || 'N/A'}</p>
                      <p className="text-sm text-gray-600">Line: {selectedProduct.line}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Selected SKUs List */}
              {selectedSKUs.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedSKUs.map(sku => (
                    <span
                      key={sku}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-[#4f0c1b] text-white text-sm rounded-full"
                    >
                      {sku}
                      <button
                        onClick={() => setSelectedSKUs(selectedSKUs.filter(s => s !== sku))}
                        className="hover:text-gray-300"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Form Fields */}
          {uploadType === 'product' ? (
            <>
              {/* Single Product: Only show Language and Comments */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
                <select
                  value={formData.language}
                  onChange={(e) => setFormData({ ...formData, language: e.target.value as 'en' | 'es' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b]"
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Comments</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Add any comments or notes about this product content..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b]"
                />
              </div>
            </>
          ) : (
            <>
              {/* Collection/General: Show full form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
                  <select
                    value={formData.language}
                    onChange={(e) => setFormData({ ...formData, language: e.target.value as 'en' | 'es' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b]"
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                  </select>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Hashtags (comma separated)</label>
                  <input
                    type="text"
                    value={formData.hashtags}
                    onChange={(e) => setFormData({ ...formData, hashtags: e.target.value })}
                    placeholder="#jewelry #necklace"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tags (comma separated)</label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="promotion, sale"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b]"
                  />
                </div>
              </div>
            </>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category {selectedProduct && <span className="text-xs text-gray-500">(Auto-filled from SKU)</span>}
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              disabled={!!selectedProduct}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              <option value="">Select a category</option>
              {availableCategories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            {selectedProduct && (
              <div className="mt-1 px-2 py-1 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                Auto-filled: <strong>{selectedProduct.category}</strong>
              </div>
            )}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Line {selectedProduct && <span className="text-xs text-gray-500">(Auto-filled from SKU)</span>}
            </label>
            <select
              value={formData.line}
              onChange={(e) => setFormData({ ...formData, line: e.target.value })}
              disabled={!!selectedProduct}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              <option value="">Select a line</option>
              {availableLines.map(line => (
                <option key={line} value={line}>{line}</option>
              ))}
            </select>
            {selectedProduct && (
              <div className="mt-1 px-2 py-1 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                Auto-filled: <strong>{selectedProduct.line}</strong>
              </div>
            )}
          </div>

          {/* File Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Upload Images</label>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileUpload}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b]"
            />
            
            {uploadedFiles.length > 0 && (
              <div className="mt-3 flex gap-2 flex-wrap">
                {uploadedFiles.map((file, index) => (
                  <div key={index} className="relative w-20 h-20 border border-gray-300 rounded-lg overflow-hidden">
                    <img
                      src={file instanceof File ? URL.createObjectURL(file) : file}
                      alt={`Upload ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => setUploadedFiles(uploadedFiles.filter((_, i) => i !== index))}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setFormData({
                  title: '',
                  description: '',
                  hashtags: '',
                  category: '',
                  line: '',
                  tags: '',
                  language: 'en',
                });
                setUploadedFiles([]);
                setSelectedSKUs([]);
                setSelectedProduct(null);
              }}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Clear
            </button>
            <button
              onClick={handleSubmit}
              className="px-6 py-2 bg-[#4f0c1b] text-white rounded-lg hover:bg-[#3d0a15] font-medium"
            >
              Create as Draft
            </button>
          </div>
        </div>
      )}

      {/* Manage Content View */}
      {viewMode === 'manage' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as ContentStatus | 'all')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b]"
                >
                  <option value="all">All Status</option>
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Search by SKU</label>
                <input
                  type="text"
                  value={filterSKU}
                  onChange={(e) => setFilterSKU(e.target.value)}
                  placeholder="Enter SKU"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b]"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => {
                    setFilterStatus('all');
                    setFilterSKU('');
                  }}
                  className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          {/* Content Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Content Items ({filteredContent.length})
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Preview</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Linked SKUs</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Author</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredContent.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                        No content found
                      </td>
                    </tr>
                  ) : (
                    filteredContent.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          {item.images.length > 0 ? (
                            <img
                              src={item.images[0]}
                              alt={item.title}
                              className="w-16 h-16 object-cover rounded-lg"
                            />
                          ) : (
                            <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{item.title}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                            {item.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {item.linkedProductIds.map((sku, idx) => (
                              <span key={idx} className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                                {sku}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            item.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                            item.status === 'submitted' ? 'bg-amber-100 text-amber-800' :
                            item.status === 'approved' ? 'bg-green-100 text-green-800' :
                            item.status === 'published' ? 'bg-purple-100 text-purple-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.authorName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.metadata.createdAt.toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                          <div className="flex items-center justify-center gap-2">
                            {item.status === 'draft' && (
                              <button
                                onClick={() => updateContentStatus(item.id, 'submitted', user?.id || '')}
                                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-xs font-medium"
                              >
                                Submit
                              </button>
                            )}
                            {item.status === 'submitted' && hasPermission('cms.edit') && (
                              <>
                                <button
                                  onClick={() => handleApprove(item.id)}
                                  className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 text-xs font-medium"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleReject(item.id)}
                                  className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-xs font-medium"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {item.status === 'approved' && (
                              <button
                                onClick={() => handlePublish(item.id)}
                                className="px-3 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 text-xs font-medium"
                              >
                                Publish
                              </button>
                            )}
                            {item.status === 'published' && hasPermission('cms.delete') && (
                              <button
                                onClick={() => {
                                  if (confirm('Are you sure you want to delete this published content?')) {
                                    deleteContent(item.id);
                                  }
                                }}
                                className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-xs font-medium"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Products View Component
function ProductsView({ 
  inventory, 
  handleSelectProduct 
}: { 
  inventory: any[]; 
  handleSelectProduct: (product: any) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterLine, setFilterLine] = useState('all');
  const [filterAvailability, setFilterAvailability] = useState('all');
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedProductDetail, setSelectedProductDetail] = useState<any>(null);

  // Get unique categories and lines
  const categories = [...new Set(inventory.map(item => item.category))].filter(Boolean).sort();
  const lines = [...new Set(inventory.map(item => item.line))].filter(Boolean).sort();

  // Filter inventory
  const filteredInventory = inventory.filter(item => {
    if (searchTerm && !item.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !item.sku.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;
    if (filterLine !== 'all' && item.line !== filterLine) return false;
    
    if (filterAvailability !== 'all') {
      const totalStock = item.ecuadorStock + item.usaStock;
      switch (filterAvailability) {
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
        default:
          return true;
      }
    }
    
    return true;
  });

  // Handle product selection
  const handleToggleProduct = (sku: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(sku)) {
      newSelected.delete(sku);
    } else {
      newSelected.add(sku);
    }
    setSelectedProducts(newSelected);
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedProducts.size === filteredInventory.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredInventory.map(item => item.sku)));
    }
  };

  // Download images
  const handleDownloadImages = async () => {
    if (selectedProducts.size === 0) {
      alert('Please select products to download images');
      return;
    }

    setIsDownloading(true);

    try {
      const selectedItems = filteredInventory.filter(item => selectedProducts.has(item.sku));

      for (const item of selectedItems) {
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

      alert(`Successfully downloaded images from ${selectedItems.length} product(s)`);
    } catch (error) {
      console.error('Error downloading images:', error);
      alert('Error downloading images. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
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
              value={filterLine}
              onChange={(e) => setFilterLine(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
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
              value={filterAvailability}
              onChange={(e) => setFilterAvailability(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
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
              onClick={() => {
                setSearchTerm('');
                setFilterCategory('all');
                setFilterLine('all');
                setFilterAvailability('all');
              }}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Download Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Bulk Download</h3>
            <p className="text-sm text-gray-600 mt-1">Select products and download all images</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {selectedProducts.size} of {filteredInventory.length} selected
            </span>
            <button
              onClick={handleSelectAll}
              className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
            >
              {selectedProducts.size === filteredInventory.length ? 'Deselect All' : 'Select All'}
            </button>
            <button
              onClick={handleDownloadImages}
              disabled={selectedProducts.size === 0 || isDownloading}
              className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {isDownloading ? 'Downloading...' : 'Download Images'}
            </button>
          </div>
        </div>
      </div>

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
                const isInStock = totalStock > 0;
                
                return (
                  <div
                    key={item.id}
                    className={`border rounded-lg p-4 transition-all duration-200 ${
                      selectedProducts.has(item.sku)
                        ? 'border-[#4f0c1b] bg-[#4f0c1b]/5'
                        : 'border-gray-200 hover:border-gray-300'
                    } relative`}
                  >
                    {/* Checkbox */}
                    <div className="absolute top-4 right-4 z-10">
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(item.sku)}
                        onChange={() => handleToggleProduct(item.sku)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-5 h-5 text-[#4f0c1b] focus:ring-[#4f0c1b] border-gray-300 rounded cursor-pointer"
                      />
                    </div>

                    {/* Image */}
                    <div className="aspect-square bg-gray-100 rounded-lg mb-3 overflow-hidden cursor-pointer" onClick={() => setSelectedProductDetail(item)}>
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
                    <div className="space-y-2 cursor-pointer" onClick={(e) => {
                      e.stopPropagation();
                      handleToggleProduct(item.sku);
                    }}>
                      <h4 className="font-medium text-gray-900 text-sm line-clamp-2">{item.name}</h4>
                      
                      <div className="text-xs text-gray-500 space-y-1">
                        <div><strong>SKU:</strong> {item.sku}</div>
                        <div><strong>Model:</strong> {item.supplierSKU || 'N/A'}</div>
                        <div><strong>Category:</strong> {item.category}</div>
                        <div><strong>Line:</strong> {item.line}</div>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs">
                        <span className={`px-2 py-1 rounded-full font-medium ${
                          isInStock ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {isInStock ? 'In Stock' : 'Out of Stock'}
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

      {/* Product Detail Modal */}
      {selectedProductDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedProductDetail(null)}>
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">{selectedProductDetail.name}</h3>
              <button
                onClick={() => setSelectedProductDetail(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Images Gallery */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Images ({selectedProductDetail.images?.length || 0})</h4>
                  {selectedProductDetail.images && selectedProductDetail.images.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {selectedProductDetail.images.map((img: string, index: number) => (
                        <div key={index} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                          <img
                            src={img}
                            alt={`${selectedProductDetail.name} - Image ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
                      <p className="text-gray-400">No images available</p>
                    </div>
                  )}
                </div>

                {/* Product Details */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Product Information</h4>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                      <div>
                        <span className="text-xs font-medium text-gray-500">SKU</span>
                        <p className="text-sm font-medium text-gray-900">{selectedProductDetail.sku}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500">Model</span>
                        <p className="text-sm font-medium text-gray-900">{selectedProductDetail.supplierSKU || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500">Category</span>
                        <p className="text-sm font-medium text-gray-900">{selectedProductDetail.category}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500">Line</span>
                        <p className="text-sm font-medium text-gray-900">{selectedProductDetail.line}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500">Description</span>
                        <p className="text-sm text-gray-700">{selectedProductDetail.description || 'No description available'}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Stock Information</h4>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Ecuador Stock</span>
                        <span className="text-lg font-semibold text-gray-900">{selectedProductDetail.ecuadorStock} units</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">USA Stock</span>
                        <span className="text-lg font-semibold text-gray-900">{selectedProductDetail.usaStock} units</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                        <span className="text-sm font-medium text-gray-700">Total Stock</span>
                        <span className="text-lg font-bold text-[#4f0c1b]">
                          {selectedProductDetail.ecuadorStock + selectedProductDetail.usaStock} units
                        </span>
                      </div>
                      <div className="mt-3">
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                          (selectedProductDetail.ecuadorStock + selectedProductDetail.usaStock) > 0
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {(selectedProductDetail.ecuadorStock + selectedProductDetail.usaStock) > 0 ? 'In Stock' : 'Out of Stock'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-4">
                    <button
                      onClick={() => handleToggleProduct(selectedProductDetail.sku)}
                      className="w-full px-4 py-2 border border-[#4f0c1b] text-[#4f0c1b] rounded-lg hover:bg-[#4f0c1b]/10 transition-colors font-medium"
                    >
                      {selectedProducts.has(selectedProductDetail.sku) ? 'Deselect for Download' : 'Select for Download'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
