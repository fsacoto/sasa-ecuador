'use client';

import React, { useState, useEffect } from 'react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { useCMS } from '../context/CMSContext';
import { ContentType, ContentStatus, InventoryItem, CMSContent } from '../types';

type ViewMode = 'dashboard' | 'upload' | 'manage' | 'products';

export default function CMSModuleNew() {
  const { user, hasPermission } = useAuth();
  const { inventory } = useInventory();
  const { 
    content, 
    addContent, 
    deleteContent, 
    updateContentStatus,
    resubmitRejectedContent,
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
  const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);
  const [selectedContentDetail, setSelectedContentDetail] = useState<CMSContent | null>(null);
  const [resubmitModalOpen, setResubmitModalOpen] = useState(false);
  const [resubmitContentId, setResubmitContentId] = useState<string | null>(null);
  const [resubmitChanges, setResubmitChanges] = useState('');
  
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
      category: formData.category || '',
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
      updateContentStatus(contentId, 'rejected', user?.id || '', notes);
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
            Content
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

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase">Rejected</div>
                <div className="text-2xl font-bold text-gray-900">{stats.rejected}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content View */}
      {viewMode === 'products' && (
        <ContentView 
          key="content-view"
          content={content}
          inventory={inventory}
          handleSelectProduct={(product) => {
            setSelectedProduct(product);
            if (!selectedSKUs.includes(product.sku)) {
              setSelectedSKUs([...selectedSKUs, product.sku]);
            }
            setViewMode('upload');
          }}
          onContentClick={(contentItem) => {
            setSelectedContentDetail(contentItem);
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
                  <option value="rejected">Rejected</option>
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
                      <tr 
                        key={item.id} 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelectedContentDetail(item)}
                      >
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
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              item.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                              item.status === 'submitted' ? 'bg-amber-100 text-amber-800' :
                              item.status === 'approved' ? 'bg-green-100 text-green-800' :
                              item.status === 'published' ? 'bg-purple-100 text-purple-800' :
                              item.status === 'rejected' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {item.status}
                            </span>
                            {item.status === 'submitted' && item.metadata.resubmissionCount && item.metadata.resubmissionCount > 0 && (
                              <span className="relative inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-600 rounded-full">
                                {item.metadata.resubmissionCount + 1}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.authorName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.metadata.createdAt.toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                          <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
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
                            {item.status === 'rejected' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setResubmitContentId(item.id);
                                  setResubmitModalOpen(true);
                                }}
                                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-xs font-medium"
                              >
                                Resubmit
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

          {/* Content Detail Modal */}
          {selectedContentDetail && (
            <ContentDetailModal
              content={selectedContentDetail}
              inventory={inventory}
              onClose={() => setSelectedContentDetail(null)}
            />
          )}

          {/* Resubmit Modal */}
          {resubmitModalOpen && resubmitContentId && (
            <ResubmitModal
              contentId={resubmitContentId}
              onClose={() => {
                setResubmitModalOpen(false);
                setResubmitContentId(null);
                setResubmitChanges('');
              }}
              onResubmit={async (changesNotes) => {
                await resubmitRejectedContent(resubmitContentId, user?.id || '', changesNotes);
                setResubmitModalOpen(false);
                setResubmitContentId(null);
                setResubmitChanges('');
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Resubmit Modal Component
function ResubmitModal({
  contentId,
  onClose,
  onResubmit,
}: {
  contentId: string;
  onClose: () => void;
  onResubmit: (changesNotes: string) => Promise<void>;
}) {
  const [changesNotes, setChangesNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!changesNotes.trim()) {
      alert('Please describe the changes made before resubmitting.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onResubmit(changesNotes);
    } catch (error) {
      console.error('Error resubmitting:', error);
      alert('Error resubmitting content. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Resubmit Content</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Please describe the changes you made to address the rejection. This will help reviewers understand what was updated.
          </p>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Changes Made <span className="text-red-500">*</span>
            </label>
            <textarea
              value={changesNotes}
              onChange={(e) => setChangesNotes(e.target.value)}
              placeholder="Describe the changes you made to address the rejection..."
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b]"
              required
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !changesNotes.trim()}
            className="px-4 py-2 bg-[#4f0c1b] text-white rounded-lg hover:bg-[#3d0a15] disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isSubmitting ? 'Resubmitting...' : 'Resubmit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Content Detail Modal Component
function ContentDetailModal({ 
  content, 
  inventory,
  onClose 
}: { 
  content: CMSContent; 
  inventory: InventoryItem[];
  onClose: () => void;
}) {
  // Get linked product details
  const linkedProducts = content.linkedProductIds
    .map(sku => inventory.find(item => item.sku === sku))
    .filter((item): item is InventoryItem => item !== undefined);

  // Get the last rejection reason
  const lastRejection = content.statusHistory
    .filter(h => h.status === 'rejected')
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">Content Details</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Last Rejection Reason - Display at top if exists */}
          {lastRejection && lastRejection.notes && (
            <div className="bg-red-50 border-l-4 border-red-200 rounded-r-lg p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-red-800 mb-1">Last Rejection Reason</h4>
                  <p className="text-sm text-red-700 leading-relaxed">{lastRejection.notes}</p>
                  <p className="text-xs text-red-600 mt-2 opacity-75">
                    Rejected on {lastRejection.timestamp.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Basic Information */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Basic Information</h4>
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-medium text-gray-500">Title</span>
                  <p className="text-sm font-medium text-gray-900 mt-1">{content.title}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500">Type</span>
                  <p className="text-sm font-medium text-gray-900 mt-1">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      {content.type}
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500">Status</span>
                  <p className="text-sm font-medium text-gray-900 mt-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        content.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                        content.status === 'submitted' ? 'bg-amber-100 text-amber-800' :
                        content.status === 'approved' ? 'bg-green-100 text-green-800' :
                        content.status === 'published' ? 'bg-purple-100 text-purple-800' :
                        content.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {content.status}
                      </span>
                      {content.status === 'submitted' && content.metadata.resubmissionCount && content.metadata.resubmissionCount > 0 && (
                        <span className="relative inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-600 rounded-full">
                          {content.metadata.resubmissionCount + 1}
                        </span>
                      )}
                    </div>
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500">Language</span>
                  <p className="text-sm font-medium text-gray-900 mt-1">{content.language.toUpperCase()}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500">Category</span>
                  <p className="text-sm font-medium text-gray-900 mt-1">{content.category || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500">Author</span>
                  <p className="text-sm font-medium text-gray-900 mt-1">{content.authorName}</p>
                </div>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">Description</span>
                <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{content.description || 'No description'}</p>
              </div>
            </div>
          </div>

          {/* Images */}
          {content.images.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Images ({content.images.length})</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {content.images.map((image, index) => (
                  <div key={index} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                    <img
                      src={image}
                      alt={`${content.title} - Image ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linked Products */}
          {content.linkedProductIds.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">
                Linked Products ({content.linkedProductIds.length})
              </h4>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap gap-2 mb-3">
                  {content.linkedProductIds.map((sku, idx) => (
                    <span key={idx} className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                      {sku}
                    </span>
                  ))}
                </div>
                {linkedProducts.length > 0 && (
                  <div className="space-y-2">
                    {linkedProducts.map((product) => (
                      <div key={product.id} className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="flex items-start gap-3">
                          {product.images && product.images.length > 0 && (
                            <img
                              src={product.images[0]}
                              alt={product.name}
                              className="w-16 h-16 object-cover rounded-lg"
                            />
                          )}
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{product.name}</p>
                            <p className="text-xs text-gray-500">SKU: {product.sku}</p>
                            <p className="text-xs text-gray-500">Model: {product.supplierSKU || 'N/A'}</p>
                            <div className="mt-1 flex gap-2 text-xs">
                              <span className="text-gray-600">Ecuador: {product.ecuadorStock}</span>
                              <span className="text-gray-600">USA: {product.usaStock}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tags and Hashtags */}
          {(content.tags.length > 0 || content.hashtags.length > 0) && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Tags & Hashtags</h4>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                {content.hashtags.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-gray-500">Hashtags</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {content.hashtags.map((tag, idx) => (
                        <span key={idx} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {content.tags.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-gray-500">Tags</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {content.tags.map((tag, idx) => (
                        <span key={idx} className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status History */}
          {content.statusHistory.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Status History</h4>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="space-y-3">
                  {content.statusHistory.map((history, index) => (
                    <div key={index} className="flex items-start gap-3 pb-3 border-b border-gray-200 last:border-0 last:pb-0">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            history.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                            history.status === 'submitted' ? 'bg-amber-100 text-amber-800' :
                            history.status === 'approved' ? 'bg-green-100 text-green-800' :
                            history.status === 'published' ? 'bg-purple-100 text-purple-800' :
                            history.status === 'rejected' ? 'bg-red-100 text-red-800' :
                            history.status === 'resubmitted' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {history.status}
                          </span>
                          <span className="text-xs text-gray-500">
                            {history.timestamp.toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600">User ID: {history.userId}</p>
                        {history.notes && (
                          <p className="text-xs text-gray-700 mt-1 italic">Note: {history.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Metadata</h4>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-medium text-gray-500">Created At</span>
                  <p className="text-sm text-gray-900 mt-1">{content.metadata.createdAt.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500">Updated At</span>
                  <p className="text-sm text-gray-900 mt-1">{content.metadata.updatedAt.toLocaleString()}</p>
                </div>
                {content.metadata.publishedAt && (
                  <div>
                    <span className="text-xs font-medium text-gray-500">Published At</span>
                    <p className="text-sm text-gray-900 mt-1">{content.metadata.publishedAt.toLocaleString()}</p>
                  </div>
                )}
                {content.metadata.archivedAt && (
                  <div>
                    <span className="text-xs font-medium text-gray-500">Archived At</span>
                    <p className="text-sm text-gray-900 mt-1">{content.metadata.archivedAt.toLocaleString()}</p>
                  </div>
                )}
                {content.metadata.reviewerId && (
                  <div>
                    <span className="text-xs font-medium text-gray-500">Reviewer ID</span>
                    <p className="text-sm text-gray-900 mt-1">{content.metadata.reviewerId}</p>
                  </div>
                )}
                {content.metadata.reviewerNotes && (
                  <div className="col-span-2">
                    <span className="text-xs font-medium text-gray-500">Reviewer Notes</span>
                    <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{content.metadata.reviewerNotes}</p>
                  </div>
                )}
                {content.metadata.resubmissionCount !== undefined && content.metadata.resubmissionCount > 0 && (
                  <div>
                    <span className="text-xs font-medium text-gray-500">Resubmission Count</span>
                    <p className="text-sm font-medium text-gray-900 mt-1">{content.metadata.resubmissionCount} time(s)</p>
                  </div>
                )}
                {content.metadata.lastResubmittedAt && (
                  <div>
                    <span className="text-xs font-medium text-gray-500">Last Resubmitted</span>
                    <p className="text-sm text-gray-900 mt-1">{content.metadata.lastResubmittedAt.toLocaleString()}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Content View Component - Shows all content types (products, collections, general) and inventory products
function ContentView({ 
  content,
  inventory, 
  handleSelectProduct,
  onContentClick
}: { 
  content: CMSContent[];
  inventory: InventoryItem[]; 
  handleSelectProduct?: (product: InventoryItem) => void;
  onContentClick?: (content: CMSContent) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterLine, setFilterLine] = useState('all');
  const [filterAvailability, setFilterAvailability] = useState('all');
  const [filterCollectionName, setFilterCollectionName] = useState('all');
  const [contentTypeFilter, setContentTypeFilter] = useState<'all' | 'product' | 'collection' | 'general' | 'inventory'>('all');
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedProductDetail, setSelectedProductDetail] = useState<InventoryItem | null>(null);
  const [expandedSections, setExpandedSections] = useState<{
    product: boolean;
    collection: boolean;
    general: boolean;
    inventory: boolean;
  }>({
    product: false,
    collection: false,
    general: false,
    inventory: false,
  });
  const [sectionOrder, setSectionOrder] = useState<('product' | 'collection' | 'general' | 'inventory')[]>(['product', 'collection', 'general', 'inventory']);
  const [draggedSection, setDraggedSection] = useState<string | null>(null);
  const [dragOverSection, setDragOverSection] = useState<string | null>(null);

  // Reset expanded sections when component mounts (when switching to this tab)
  useEffect(() => {
    setExpandedSections({
      product: false,
      collection: false,
      general: false,
      inventory: false,
    });
  }, []);

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, sectionType: 'product' | 'collection' | 'general' | 'inventory') => {
    setDraggedSection(sectionType);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', sectionType);
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent, sectionType: 'product' | 'collection' | 'general' | 'inventory') => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSection(sectionType);
  };

  // Handle drag leave
  const handleDragLeave = () => {
    setDragOverSection(null);
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent, targetSection: 'product' | 'collection' | 'general' | 'inventory') => {
    e.preventDefault();
    setDragOverSection(null);
    
    if (!draggedSection || draggedSection === targetSection) {
      setDraggedSection(null);
      return;
    }

    const newOrder = [...sectionOrder];
    const draggedIndex = newOrder.indexOf(draggedSection);
    const targetIndex = newOrder.indexOf(targetSection);

    // Remove dragged section from its current position
    newOrder.splice(draggedIndex, 1);
    // Insert at target position
    newOrder.splice(targetIndex, 0, draggedSection);

    setSectionOrder(newOrder);
    setDraggedSection(null);
  };

  // Get unique categories and lines
  const categories = [...new Set(inventory.map(item => item.category))].filter(Boolean).sort();
  const lines = [...new Set(inventory.map(item => item.line))].filter(Boolean).sort();
  
  // Get unique collection names (titles) from collection type content
  const collectionNames = [...new Set(content.filter(item => item.type === 'collection').map(item => item.title))].filter(Boolean).sort();

  // Get total counts before filtering (for "X of Y" display)
  const totalProductContent = content.filter(item => item.type === 'product').length;
  const totalCollectionContent = content.filter(item => item.type === 'collection').length;
  const totalGeneralContent = content.filter(item => item.type === 'general').length;
  const totalInventory = inventory.length;

  // Filter CMS content by type
  const filteredGeneralContent = content.filter(item => {
    if (item.type !== 'general') return false;
    if (contentTypeFilter !== 'all' && contentTypeFilter !== 'inventory' && contentTypeFilter !== 'general') return false;
    if (contentTypeFilter === 'inventory') return false;
    if (searchTerm && !item.title.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !item.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const filteredCollectionContent = content.filter(item => {
    if (item.type !== 'collection') return false;
    if (contentTypeFilter !== 'all' && contentTypeFilter !== 'inventory' && contentTypeFilter !== 'collection') return false;
    if (contentTypeFilter === 'inventory') return false;
    if (searchTerm && !item.title.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !item.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterCollectionName !== 'all' && item.title !== filterCollectionName) return false;
    return true;
  });

  const filteredProductContent = content.filter(item => {
    if (item.type !== 'product') return false;
    if (contentTypeFilter !== 'all' && contentTypeFilter !== 'inventory' && contentTypeFilter !== 'product') return false;
    if (contentTypeFilter === 'inventory') return false;
    if (searchTerm && !item.title.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !item.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // Filter inventory
  const filteredInventory = inventory.filter(item => {
    if (contentTypeFilter !== 'all' && contentTypeFilter !== 'inventory') return false; // Don't show inventory when filtering for CMS content types
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

  // Section configuration
  const sectionConfig = {
    product: {
      title: 'Product Content',
      filter: contentTypeFilter === 'all' || contentTypeFilter === 'product',
      content: filteredProductContent,
      hasContent: filteredProductContent.length > 0,
      expanded: expandedSections.product,
      toggleExpanded: () => setExpandedSections(prev => ({ ...prev, product: !prev.product })),
      renderContent: () => (
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProductContent.map((item) => (
              <div
                key={item.id}
                className="border rounded-lg p-4 transition-all duration-200 border-gray-200 hover:border-gray-300 cursor-pointer"
                onClick={() => onContentClick?.(item)}
              >
                <div className="aspect-square bg-gray-100 rounded-lg mb-3 overflow-hidden">
                  {item.images.length > 0 ? (
                    <img
                      src={item.images[0]}
                      alt={item.title}
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
                <div className="mb-2">
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                    Product
                  </span>
                </div>
                <h4 className="font-medium text-gray-900 text-sm line-clamp-2 mb-2">{item.title}</h4>
                <div className="flex items-center justify-between text-xs">
                  <span className={`px-2 py-1 rounded-full font-medium ${
                    item.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                    item.status === 'submitted' ? 'bg-amber-100 text-amber-800' :
                    item.status === 'approved' ? 'bg-green-100 text-green-800' :
                    item.status === 'published' ? 'bg-purple-100 text-purple-800' :
                    item.status === 'rejected' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {item.status}
                  </span>
                  {item.status === 'submitted' && item.metadata.resubmissionCount && item.metadata.resubmissionCount > 0 && (
                    <span className="relative inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-600 rounded-full">
                      {item.metadata.resubmissionCount + 1}
                    </span>
                  )}
                </div>
                {item.linkedProductIds.length > 0 && (
                  <div className="mt-2 text-xs text-gray-500">
                    {item.linkedProductIds.length} product{item.linkedProductIds.length > 1 ? 's' : ''} linked
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ),
    },
    collection: {
      title: 'Collections',
      filter: contentTypeFilter === 'all' || contentTypeFilter === 'collection',
      content: filteredCollectionContent,
      totalCount: totalCollectionContent,
      hasContent: filteredCollectionContent.length > 0,
      expanded: expandedSections.collection,
      toggleExpanded: () => setExpandedSections(prev => ({ ...prev, collection: !prev.collection })),
      renderContent: () => (
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredCollectionContent.map((item) => (
              <div
                key={item.id}
                className="border rounded-lg p-4 transition-all duration-200 border-gray-200 hover:border-gray-300 cursor-pointer"
                onClick={() => onContentClick?.(item)}
              >
                <div className="aspect-square bg-gray-100 rounded-lg mb-3 overflow-hidden">
                  {item.images.length > 0 ? (
                    <img
                      src={item.images[0]}
                      alt={item.title}
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
                <div className="mb-2">
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                    Collection
                  </span>
                </div>
                <h4 className="font-medium text-gray-900 text-sm line-clamp-2 mb-2">{item.title}</h4>
                <div className="flex items-center justify-between text-xs">
                  <span className={`px-2 py-1 rounded-full font-medium ${
                    item.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                    item.status === 'submitted' ? 'bg-amber-100 text-amber-800' :
                    item.status === 'approved' ? 'bg-green-100 text-green-800' :
                    item.status === 'published' ? 'bg-purple-100 text-purple-800' :
                    item.status === 'rejected' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {item.status}
                  </span>
                  {item.status === 'submitted' && item.metadata.resubmissionCount && item.metadata.resubmissionCount > 0 && (
                    <span className="relative inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-600 rounded-full">
                      {item.metadata.resubmissionCount + 1}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    general: {
      title: 'General Content',
      filter: contentTypeFilter === 'all' || contentTypeFilter === 'general',
      content: filteredGeneralContent,
      totalCount: totalGeneralContent,
      hasContent: filteredGeneralContent.length > 0,
      expanded: expandedSections.general,
      toggleExpanded: () => setExpandedSections(prev => ({ ...prev, general: !prev.general })),
      renderContent: () => (
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredGeneralContent.map((item) => (
              <div
                key={item.id}
                className="border rounded-lg p-4 transition-all duration-200 border-gray-200 hover:border-gray-300 cursor-pointer"
                onClick={() => onContentClick?.(item)}
              >
                <div className="aspect-square bg-gray-100 rounded-lg mb-3 overflow-hidden">
                  {item.images.length > 0 ? (
                    <img
                      src={item.images[0]}
                      alt={item.title}
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
                <div className="mb-2">
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                    General
                  </span>
                </div>
                <h4 className="font-medium text-gray-900 text-sm line-clamp-2 mb-2">{item.title}</h4>
                <div className="flex items-center justify-between text-xs">
                  <span className={`px-2 py-1 rounded-full font-medium ${
                    item.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                    item.status === 'submitted' ? 'bg-amber-100 text-amber-800' :
                    item.status === 'approved' ? 'bg-green-100 text-green-800' :
                    item.status === 'published' ? 'bg-purple-100 text-purple-800' :
                    item.status === 'rejected' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {item.status}
                  </span>
                  {item.status === 'submitted' && item.metadata.resubmissionCount && item.metadata.resubmissionCount > 0 && (
                    <span className="relative inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-600 rounded-full">
                      {item.metadata.resubmissionCount + 1}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    inventory: {
      title: 'Products',
      filter: contentTypeFilter === 'all' || contentTypeFilter === 'inventory',
      content: filteredInventory,
      totalCount: totalInventory,
      hasContent: filteredInventory.length > 0,
      expanded: expandedSections.inventory,
      toggleExpanded: () => setExpandedSections(prev => ({ ...prev, inventory: !prev.inventory })),
      renderContent: () => (
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
      ),
    },
  };

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Content Type</label>
            <select
              value={contentTypeFilter}
              onChange={(e) => setContentTypeFilter(e.target.value as 'all' | 'product' | 'collection' | 'general' | 'inventory')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
            >
              <option value="all">All Content</option>
              <option value="product">Product Content</option>
              <option value="collection">Collections</option>
              <option value="general">General Content</option>
              <option value="inventory">Inventory Products</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <input
              type="text"
              placeholder={contentTypeFilter === 'inventory' ? "Search products..." : "Search content..."}
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
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Collection Name</label>
            <select
              value={filterCollectionName}
              onChange={(e) => setFilterCollectionName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
            >
              <option value="all">All Collections</option>
              {collectionNames.map(collectionName => (
                <option key={collectionName} value={collectionName}>{collectionName}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterCategory('all');
                setFilterLine('all');
                setFilterAvailability('all');
                setContentTypeFilter('all');
              }}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Download Controls - Only show for inventory */}
      {(contentTypeFilter === 'all' || contentTypeFilter === 'inventory') && (
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
      )}

      {/* Draggable Content Sections */}
      {sectionOrder.map((sectionType) => {
        const config = sectionConfig[sectionType];
        if (!config.filter || !config.hasContent) return null;

        return (
          <div
            key={sectionType}
            draggable
            onDragStart={(e) => handleDragStart(e, sectionType)}
            onDragOver={(e) => handleDragOver(e, sectionType)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, sectionType)}
            onDragEnd={() => {
              setDraggedSection(null);
              setDragOverSection(null);
            }}
            className={`bg-white rounded-xl shadow-sm border border-gray-200 transition-all ${
              draggedSection === sectionType ? 'opacity-50' : ''
            } ${
              dragOverSection === sectionType && draggedSection !== sectionType ? 'border-blue-400 border-2' : ''
            }`}
          >
            <div 
              className="p-6 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={config.toggleExpanded}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div 
                    className="cursor-move text-gray-400 hover:text-gray-600"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {config.title}
                  </h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400 font-normal">
                    {config.content.length} of {config.totalCount} {config.content.length === 1 ? 'item' : 'items'}
                  </span>
                  <svg 
                    className={`w-5 h-5 text-gray-400 transition-transform ${config.expanded ? 'rotate-180' : ''}`}
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
            {config.expanded && config.renderContent()}
          </div>
        );
      })}


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
