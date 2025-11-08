'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { useCMS } from '../context/CMSContext';
import { useTranslation } from '../context/TranslationContext';
import { ContentType, ContentStatus, InventoryItem, CMSContent } from '../types';
import JSZip from 'jszip';
// Removed Firebase Storage imports - using direct URL fetch instead

type ViewMode = 'dashboard' | 'upload' | 'manage' | 'products';

export default function CMSModuleNew() {
  const { user, hasPermission } = useAuth();
  const { inventory } = useInventory();
  const { t } = useTranslation();
  const { 
    content, 
    addContent, 
    deleteContent, 
    updateContent,
    updateContentStatus,
    resubmitRejectedContent,
    getContentStats 
  } = useCMS();
  
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [uploadType, setUploadType] = useState<ContentType>('product');
  const [filterStatus, setFilterStatus] = useState<ContentStatus | 'all'>('all');
  const [filterSKU, setFilterSKU] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Separate state for each content type tab
  type UploadedFile = {
    file: File | string;
    linkedSKU?: string; // For collection type, track which SKU this image is linked to
  };

  type TabState = {
    selectedSKUs: string[];
    searchSKU: string;
    showSKUDropdown: boolean;
    selectedProduct: InventoryItem | null;
    formData: {
      title: string;
      description: string;
      hashtags: string;
      category: string;
      line: string;
      tags: string;
      language: 'en' | 'es';
    };
    uploadedFiles: UploadedFile[];
  };

  const [tabStates, setTabStates] = useState<Record<ContentType, TabState>>({
    product: {
      selectedSKUs: [],
      searchSKU: '',
      showSKUDropdown: false,
      selectedProduct: null,
      formData: {
        title: '',
        description: '',
        hashtags: '',
        category: '',
        line: '',
        tags: '',
        language: 'en',
      },
      uploadedFiles: [],
    },
    collection: {
      selectedSKUs: [],
      searchSKU: '',
      showSKUDropdown: false,
      selectedProduct: null,
      formData: {
        title: '',
        description: '',
        hashtags: '',
        category: '',
        line: '',
        tags: '',
        language: 'en',
      },
      uploadedFiles: [],
    },
    general: {
      selectedSKUs: [],
      searchSKU: '',
      showSKUDropdown: false,
      selectedProduct: null,
      formData: {
        title: '',
        description: '',
        hashtags: '',
        category: '',
        line: '',
        tags: '',
        language: 'en',
      },
      uploadedFiles: [],
    },
  });

  // Get current tab state
  const currentTabState = tabStates[uploadType];
  
  // Helper functions to update current tab state
  const updateCurrentTabState = (updates: Partial<TabState>) => {
    setTabStates(prev => ({
      ...prev,
      [uploadType]: { ...prev[uploadType], ...updates }
    }));
  };

  // Get unique categories and lines from inventory for dropdowns
  const availableCategories = [...new Set(inventory.map(item => item.category))].filter(Boolean).sort();
  const availableLines = [...new Set(inventory.map(item => item.line))].filter(Boolean).sort();
  const [selectedContentDetail, setSelectedContentDetail] = useState<CMSContent | null>(null);
  const [resubmitModalOpen, setResubmitModalOpen] = useState(false);
  const [resubmitContentId, setResubmitContentId] = useState<string | null>(null);
  const [resubmitChanges, setResubmitChanges] = useState('');
  const [editingContent, setEditingContent] = useState<CMSContent | null>(null);
  const [editFormData, setEditFormData] = useState({
    title: '',
    description: '',
    hashtags: '',
    category: '',
    line: '',
    tags: '',
    language: 'en' as 'en' | 'es',
  });
  const [editUploadedFiles, setEditUploadedFiles] = useState<(File | string)[]>([]);
  const [editSelectedSKUs, setEditSelectedSKUs] = useState<string[]>([]);
  
  const stats = getContentStats();
  
  // Total content count (for "X of Y" display)
  const totalContentCount = content.length;
  
  // Handle column sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // SortIcon component
  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortDirection === 'asc' ? (
      <svg className="w-4 h-4 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // Sort function
  const sortContent = (a: CMSContent, b: CMSContent): number => {
    let aValue: any;
    let bValue: any;

    switch (sortField) {
      case 'title':
        aValue = a.title.toLowerCase();
        bValue = b.title.toLowerCase();
        break;
      case 'type':
        aValue = a.type.toLowerCase();
        bValue = b.type.toLowerCase();
        break;
      case 'status':
        aValue = a.status.toLowerCase();
        bValue = b.status.toLowerCase();
        break;
      case 'author':
        aValue = a.authorName.toLowerCase();
        bValue = b.authorName.toLowerCase();
        break;
      case 'createdAt':
        aValue = a.metadata.createdAt.getTime();
        bValue = b.metadata.createdAt.getTime();
        break;
      case 'updatedAt':
        aValue = a.metadata.updatedAt.getTime();
        bValue = b.metadata.updatedAt.getTime();
        break;
      case 'linkedSKUs':
        aValue = a.linkedProductIds.length;
        bValue = b.linkedProductIds.length;
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  };

  // Filter and sort content
  const filteredContent = content
    .filter(item => {
    if (filterStatus !== 'all' && item.status !== filterStatus) return false;
    if (filterSKU && !item.linkedProductIds.some(sku => sku.toLowerCase().includes(filterSKU.toLowerCase()))) return false;
    return true;
    })
    .sort(sortContent);

  // Filter inventory items based on search input for current tab
  const filteredInventory = inventory.filter(item => {
    if (!currentTabState.searchSKU.trim()) return false;
    const searchLower = currentTabState.searchSKU.toLowerCase();
    return (
      item.sku.toLowerCase().includes(searchLower) || 
      item.name.toLowerCase().includes(searchLower) ||
      (item.supplierSKU && item.supplierSKU.toLowerCase().includes(searchLower))
    );
  }).slice(0, 10); // Limit to 10 results

  const handleSKUSelect = (product: InventoryItem) => {
    const currentState = currentTabState;
    
    // For single product type, only allow one SKU (replace if one already exists)
    if (uploadType === 'product') {
      updateCurrentTabState({
        selectedProduct: product,
        selectedSKUs: [product.sku], // Only one SKU for single product
        searchSKU: '',
        showSKUDropdown: false,
        formData: {
          ...currentState.formData,
          category: product.category || currentState.formData.category,
          line: product.line || currentState.formData.line,
        },
      });
    } else {
      // For collection type, allow multiple SKUs
      if (!currentState.selectedSKUs.includes(product.sku)) {
        updateCurrentTabState({
          selectedProduct: product,
          selectedSKUs: [...currentState.selectedSKUs, product.sku],
          searchSKU: '',
          showSKUDropdown: false,
          formData: {
            ...currentState.formData,
            category: product.category || currentState.formData.category,
            line: product.line || currentState.formData.line,
          },
        });
      } else {
        updateCurrentTabState({
          selectedProduct: product,
          searchSKU: '',
          showSKUDropdown: false,
        });
      }
    }
  };

  const handleSKUInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    updateCurrentTabState({
      searchSKU: value,
      showSKUDropdown: value.trim().length > 0,
    });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.sku-search-container')) {
        updateCurrentTabState({ showSKUDropdown: false });
      }
    };

    if (currentTabState.showSKUDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [currentTabState.showSKUDropdown, uploadType]);

  // Handle file upload - accepts images, videos, and other media formats
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Accept images, videos, and other media formats
    const mediaFiles = files.filter(file => 
      file.type.startsWith('image/') || 
      file.type.startsWith('video/') ||
      file.type.startsWith('audio/') ||
      ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)
    );
    
    // For collection type with multiple SKUs, we'll show a modal to select SKU for each batch
    if (uploadType === 'collection' && currentTabState.selectedSKUs.length > 0) {
      // Store files temporarily and show selection UI
      const newFiles: UploadedFile[] = mediaFiles.map(file => ({ file, linkedSKU: undefined }));
      updateCurrentTabState({
        uploadedFiles: [...currentTabState.uploadedFiles, ...newFiles]
      });
    } else {
      // For product or general, or collection with no SKUs, just add files without linking
      const newFiles: UploadedFile[] = mediaFiles.map(file => ({ file }));
      updateCurrentTabState({
        uploadedFiles: [...currentTabState.uploadedFiles, ...newFiles]
      });
    }
    
    // Reset input
    e.target.value = '';
  };

  // Handle linking SKU to uploaded file
  const handleLinkFileToSKU = (fileIndex: number, sku: string | undefined) => {
    const newFiles = [...currentTabState.uploadedFiles];
    newFiles[fileIndex] = { ...newFiles[fileIndex], linkedSKU: sku };
    updateCurrentTabState({ uploadedFiles: newFiles });
  };

  // Upload files to Firebase Storage (supports images, videos, and other media)
  const convertFilesToBase64 = async (files: File[]): Promise<string[]> => {
    try {
      const { uploadFile } = await import('../services/storageService');
      const downloadURLs: string[] = [];
      
      // Upload each file to the appropriate path based on file type
      for (const file of files) {
        const timestamp = Date.now();
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        
        let basePath: string;
        if (file.type.startsWith('image/')) {
          basePath = 'images/cms/';
        } else if (file.type.startsWith('video/')) {
          basePath = 'videos/cms/';
        } else if (file.type.startsWith('audio/')) {
          basePath = 'documents/cms/'; // Store audio in documents folder
        } else {
          basePath = 'documents/cms/'; // PDFs, Word docs, etc.
        }
        
        const filePath = `${basePath}${timestamp}_${sanitizedName}`;
        const url = await uploadFile(file, filePath);
        downloadURLs.push(url);
      }
      
      return downloadURLs;
    } catch (error) {
      console.error('Error uploading files:', error);
      throw error;
    }
  };

  // Submit content
  const handleSubmit = async () => {
    if (editingContent) {
      // Handle edit mode
      await handleEditSubmit();
      return;
    }

    const state = currentTabState;

    if (!state.selectedSKUs.length && uploadType === 'product') {
      alert('Please select at least one product for this content type.');
      return;
    }

    // For collection/general types, require title and description
    if (uploadType !== 'product') {
      if (!state.formData.title || !state.formData.description) {
        alert('Please fill in title and description.');
        return;
      }
    }

    // Validate: For collection with multiple SKUs, each SKU must have at least one linked image
    if (uploadType === 'collection' && state.selectedSKUs.length > 1) {
      const skusWithImages = new Set(
        state.uploadedFiles
          .filter(uf => uf.linkedSKU)
          .map(uf => uf.linkedSKU)
      );
      const missingSKUs = state.selectedSKUs.filter(sku => !skusWithImages.has(sku));
      
      if (missingSKUs.length > 0) {
        alert(`Please link at least one image to each selected SKU. Missing links for: ${missingSKUs.join(', ')}`);
        return;
      }
    }

    const fileUrls = state.uploadedFiles.length > 0 
      ? await convertFilesToBase64(state.uploadedFiles.filter((uf): uf is UploadedFile & { file: File } => uf.file instanceof File).map(uf => uf.file))
      : [];

    // For product type, use product name as title, otherwise use form title
    const contentTitle = uploadType === 'product' 
      ? (state.selectedProduct?.name || `Product Content - ${state.selectedSKUs[0]}`)
      : state.formData.title;

    const hashtagsArray = uploadType === 'product' 
      ? [] 
      : state.formData.hashtags.split(',').map(tag => tag.trim()).filter(Boolean);
    const tagsArray = uploadType === 'product' 
      ? [] 
      : state.formData.tags.split(',').map(tag => tag.trim()).filter(Boolean);

    addContent({
      type: uploadType,
      title: contentTitle,
      description: state.formData.description || '',
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
      category: state.formData.category || '',
      tags: tagsArray,
      language: state.formData.language,
      linkedProductIds: state.selectedSKUs,
    });

    // Reset form for current tab
    updateCurrentTabState({
      formData: {
        title: '',
        description: '',
        hashtags: '',
        category: '',
        line: '',
        tags: '',
        language: 'en',
      },
      uploadedFiles: [],
      selectedSKUs: [],
      selectedProduct: null,
      searchSKU: '',
      showSKUDropdown: false,
    });
    alert('Content created successfully! It is now in draft status.');
  };

  // Handle edit submit
  const handleEditSubmit = async () => {
    if (!editingContent) return;

    // For collection/general types, require title and description
    if (uploadType !== 'product') {
      if (!editFormData.title || !editFormData.description) {
        alert('Please fill in title and description.');
        return;
      }
    }

    // Get new file URLs (only for newly uploaded files)
    const newFiles = editUploadedFiles.filter((f): f is File => f instanceof File);
    const existingFiles = editUploadedFiles.filter((f): f is string => typeof f === 'string');
    const newFileUrls = newFiles.length > 0 
      ? await convertFilesToBase64(newFiles)
      : [];

    // Combine existing and new images
    const allImages = [...existingFiles, ...newFileUrls];

    // For product type, use product name as title, otherwise use form title
    // Get product from inventory if available
    const productForSKU = editSelectedSKUs.length > 0 
      ? inventory.find(item => item.sku === editSelectedSKUs[0])
      : null;
    const contentTitle = uploadType === 'product' 
      ? (productForSKU?.name || `Product Content - ${editSelectedSKUs[0] || 'Unknown'}`)
      : editFormData.title;

    const hashtagsArray = uploadType === 'product' 
      ? [] 
      : editFormData.hashtags.split(',').map(tag => tag.trim()).filter(Boolean);
    const tagsArray = uploadType === 'product' 
      ? [] 
      : editFormData.tags.split(',').map(tag => tag.trim()).filter(Boolean);

    // Update the content
    await updateContent(editingContent.id, {
      title: contentTitle,
      description: editFormData.description || '',
      hashtags: hashtagsArray,
      images: allImages,
      category: editFormData.category || '',
      tags: tagsArray,
      language: editFormData.language,
      linkedProductIds: editSelectedSKUs,
    });

    // Reset edit state
    setEditingContent(null);
    setEditFormData({
      title: '',
      description: '',
      hashtags: '',
      category: '',
      line: '',
      tags: '',
      language: 'en',
    });
    setEditUploadedFiles([]);
    setEditSelectedSKUs([]);
    // Reset tab state selectedProduct
    updateCurrentTabState({ selectedProduct: null });
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
    alert('Content updated successfully!');
  };

  // Handle edit file upload - accepts images, videos, and other media formats
  const handleEditFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Accept images, videos, and other media formats
    const mediaFiles = files.filter(file => 
      file.type.startsWith('image/') || 
      file.type.startsWith('video/') ||
      file.type.startsWith('audio/') ||
      ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)
    );
    setEditUploadedFiles(prev => [...prev, ...mediaFiles]);
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
            <h2 className="text-2xl font-bold text-gray-900">{t('cms.title')}</h2>
            <p className="text-gray-600 mt-1">{t('cms.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
              {hasPermission('cms.edit') ? t('cms.fullAccess') : 'View Only'}
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
            {t('cms.dashboard')}
          </button>
          <button
            onClick={() => setViewMode('products')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'products'
                ? 'bg-[#4f0c1b] text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {t('cms.content')}
          </button>
          <button
            onClick={() => setViewMode('upload')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'upload'
                ? 'bg-[#4f0c1b] text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {t('cms.uploadContent')}
          </button>
          <button
            onClick={() => setViewMode('manage')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'manage'
                ? 'bg-[#4f0c1b] text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {t('cms.manageContent')}
          </button>
        </div>
      </div>

      {/* Dashboard View */}
      {viewMode === 'dashboard' && (
        <div className="space-y-6">
          {/* Overview Section */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-[#4f0c1b] to-[#3d0a15] rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{t('cms.contentOverview')}</h3>
                <p className="text-sm text-gray-500">{t('cms.totalContentItems')}</p>
              </div>
              <div className="ml-auto">
                <div className="text-3xl font-bold text-[#4f0c1b]">{stats.total}</div>
                <div className="text-xs text-gray-500 mt-1">{t('cms.totalItems')}</div>
              </div>
            </div>
          </div>

          {/* Status Cards */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-4">{t('cms.contentStatusDistribution')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Draft */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{t('cms.drafts')}</div>
                      <div className="text-xs text-gray-500">{t('cms.inProgress')}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">{stats.draft}</div>
                    <div className="text-xs text-gray-400">{stats.total > 0 ? Math.round((stats.draft / stats.total) * 100) : 0}%</div>
                  </div>
                </div>
              </div>

              {/* Submitted */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{t('cms.submitted')}</div>
                      <div className="text-xs text-gray-500">{t('cms.awaitingReview')}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">{stats.submitted}</div>
                    <div className="text-xs text-gray-400">{stats.total > 0 ? Math.round((stats.submitted / stats.total) * 100) : 0}%</div>
                  </div>
                </div>
              </div>

              {/* Approved */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{t('cms.approved')}</div>
                      <div className="text-xs text-gray-500">{t('cms.readyToPublish')}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">{stats.approved}</div>
                    <div className="text-xs text-gray-400">{stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0}%</div>
                  </div>
                </div>
              </div>

              {/* Published */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{t('cms.published')}</div>
                      <div className="text-xs text-gray-500">{t('cms.liveContent')}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">{stats.published}</div>
                    <div className="text-xs text-gray-400">{stats.total > 0 ? Math.round((stats.published / stats.total) * 100) : 0}%</div>
                  </div>
                </div>
              </div>

              {/* Rejected */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{t('cms.rejected')}</div>
                      <div className="text-xs text-gray-500">{t('cms.needsRevision')}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">{stats.rejected}</div>
                    <div className="text-xs text-gray-400">{stats.total > 0 ? Math.round((stats.rejected / stats.total) * 100) : 0}%</div>
                  </div>
                </div>
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
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-[#4f0c1b] to-[#3d0a15] rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  {editingContent ? t('cms.editContent') : t('cms.uploadContent')}
                </h3>
                <p className="text-sm text-gray-500">
                  {editingContent ? t('cms.updateYourContentDetails') : t('cms.createNewContent')}
                </p>
              </div>
            </div>
          </div>

          {/* Content Type Selection */}
          {!editingContent && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <label className="block text-sm font-semibold text-gray-900 mb-4">{t('cms.contentType')}</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setUploadType('product')}
                  className={`px-4 py-3 rounded-xl border-2 transition-all duration-200 font-medium ${
                    uploadType === 'product'
                      ? 'bg-[#4f0c1b] text-white border-[#4f0c1b] shadow-md'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-[#4f0c1b] hover:bg-gray-50'
                  }`}
                >
                  {t('cms.singleProduct')}
                </button>
                <button
                  onClick={() => setUploadType('collection')}
                  className={`px-4 py-3 rounded-xl border-2 transition-all duration-200 font-medium ${
                    uploadType === 'collection'
                      ? 'bg-[#4f0c1b] text-white border-[#4f0c1b] shadow-md'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-[#4f0c1b] hover:bg-gray-50'
                  }`}
                >
                  {t('cms.collection')}
                </button>
                <button
                  onClick={() => setUploadType('general')}
                  className={`px-4 py-3 rounded-xl border-2 transition-all duration-200 font-medium ${
                    uploadType === 'general'
                      ? 'bg-[#4f0c1b] text-white border-[#4f0c1b] shadow-md'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-[#4f0c1b] hover:bg-gray-50'
                  }`}
                >
                  {t('cms.general')}
                </button>
              </div>
            </div>
          )}

          {/* Product Selection Section */}
          {uploadType !== 'general' && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <label className="text-sm font-semibold text-gray-900">{t('cms.linkToProduct')}</label>
              </div>
              
              <div className="sku-search-container relative mb-4">
                <div className="relative">
                  <input
                    type="text"
                    value={currentTabState.searchSKU}
                    onChange={handleSKUInputChange}
                    onFocus={() => currentTabState.searchSKU.trim().length > 0 && updateCurrentTabState({ showSKUDropdown: true })}
                    placeholder={t('cms.searchBySku')}
                    className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                  {currentTabState.searchSKU && (
                    <button
                      onClick={() => {
                        updateCurrentTabState({ searchSKU: '', showSKUDropdown: false });
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Dropdown Results */}
                {currentTabState.showSKUDropdown && filteredInventory.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
                    {filteredInventory.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => handleSKUSelect(product)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{product.name}</p>
                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                              <span><span className="font-medium">SKU:</span> {product.sku}</span>
                              {product.supplierSKU && (
                                <span><span className="font-medium">Model:</span> {product.supplierSKU}</span>
                              )}
                            </div>
                            {product.category && (
                              <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                                {product.category}
                              </span>
                            )}
                          </div>
                          {currentTabState.selectedSKUs.includes(product.sku) && (
                            <div className="flex-shrink-0">
                              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {currentTabState.showSKUDropdown && currentTabState.searchSKU.trim().length > 0 && filteredInventory.length === 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-center text-gray-500">
                    {t('cms.noProductsFound')} "{currentTabState.searchSKU}"
                  </div>
                )}
              </div>

              {/* Selected Product Display */}
              {currentTabState.selectedProduct && (
                <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 mb-1">{currentTabState.selectedProduct.name}</p>
                      <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                        <span><span className="font-medium">{t('inventory.sku')}:</span> {currentTabState.selectedProduct.sku}</span>
                        <span><span className="font-medium">{t('cms.model')}:</span> {currentTabState.selectedProduct.supplierSKU || 'N/A'}</span>
                        <span><span className="font-medium">{t('cms.line')}:</span> {currentTabState.selectedProduct.line}</span>
                        <span><span className="font-medium">{t('cms.category')}:</span> {currentTabState.selectedProduct.category}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Selected SKUs List */}
              {currentTabState.selectedSKUs.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">{t('cms.selectedSkus')} ({currentTabState.selectedSKUs.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {currentTabState.selectedSKUs.map(sku => (
                      <span
                        key={sku}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#4f0c1b] text-white text-sm rounded-lg font-medium"
                      >
                        {sku}
                        <button
                          onClick={() => {
                            const newSKUs = currentTabState.selectedSKUs.filter(s => s !== sku);
                            updateCurrentTabState({ 
                              selectedSKUs: newSKUs,
                              selectedProduct: newSKUs.length === 0 ? null : (uploadType === 'product' ? null : currentTabState.selectedProduct)
                            });
                          }}
                          className="hover:text-gray-300 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Content Details Section */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-6">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <h4 className="text-base font-semibold text-gray-900">{t('cms.contentDetails')}</h4>
            </div>

            {uploadType === 'product' ? (
              <div className="space-y-5">
                {/* Single Product: Only show Language and Comments */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
                  <select
                    value={editingContent ? editFormData.language : currentTabState.formData.language}
                    onChange={(e) => editingContent 
                      ? setEditFormData({ ...editFormData, language: e.target.value as 'en' | 'es' })
                      : updateCurrentTabState({ formData: { ...currentTabState.formData, language: e.target.value as 'en' | 'es' } })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Comments</label>
                  <textarea
                    value={editingContent ? editFormData.description : currentTabState.formData.description}
                    onChange={(e) => editingContent
                      ? setEditFormData({ ...editFormData, description: e.target.value })
                      : updateCurrentTabState({ formData: { ...currentTabState.formData, description: e.target.value } })
                    }
                    placeholder="Add any comments or notes about this product content..."
                    rows={4}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent resize-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Collection/General: Show full form */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('cms.titleColumn')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editingContent ? editFormData.title : currentTabState.formData.title}
                      onChange={(e) => editingContent
                        ? setEditFormData({ ...editFormData, title: e.target.value })
                        : updateCurrentTabState({ formData: { ...currentTabState.formData, title: e.target.value } })
                      }
                      required
                      placeholder="Enter content title..."
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
                    <select
                      value={editingContent ? editFormData.language : currentTabState.formData.language}
                      onChange={(e) => editingContent
                        ? setEditFormData({ ...editFormData, language: e.target.value as 'en' | 'es' })
                        : updateCurrentTabState({ formData: { ...currentTabState.formData, language: e.target.value as 'en' | 'es' } })
                      }
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                    >
                      <option value="en">English</option>
                      <option value="es">Español</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={editingContent ? editFormData.description : currentTabState.formData.description}
                    onChange={(e) => editingContent
                      ? setEditFormData({ ...editFormData, description: e.target.value })
                      : updateCurrentTabState({ formData: { ...currentTabState.formData, description: e.target.value } })
                    }
                    required
                    placeholder="Enter content description..."
                    rows={4}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Hashtags</label>
                    <input
                      type="text"
                      value={editingContent ? editFormData.hashtags : currentTabState.formData.hashtags}
                      onChange={(e) => editingContent
                        ? setEditFormData({ ...editFormData, hashtags: e.target.value })
                        : updateCurrentTabState({ formData: { ...currentTabState.formData, hashtags: e.target.value } })
                      }
                      placeholder="#jewelry #necklace"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">Separate multiple hashtags with spaces</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
                    <input
                      type="text"
                      value={editingContent ? editFormData.tags : currentTabState.formData.tags}
                      onChange={(e) => editingContent
                        ? setEditFormData({ ...editFormData, tags: e.target.value })
                        : updateCurrentTabState({ formData: { ...currentTabState.formData, tags: e.target.value } })
                      }
                      placeholder="promotion, sale"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">Separate multiple tags with commas</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Category & Line Section */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-6">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <h4 className="text-base font-semibold text-gray-900">Classification</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                  {currentTabState.selectedProduct && <span className="text-xs text-gray-500 ml-1">(Auto-filled)</span>}
                </label>
                <select
                  value={editingContent ? editFormData.category : currentTabState.formData.category}
                  onChange={(e) => editingContent
                    ? setEditFormData({ ...editFormData, category: e.target.value })
                    : updateCurrentTabState({ formData: { ...currentTabState.formData, category: e.target.value } })
                  }
                  disabled={!!currentTabState.selectedProduct}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
                >
                  <option value="">Select a category</option>
                  {availableCategories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                {currentTabState.selectedProduct && (
                  <div className="mt-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                    <span className="font-medium">Auto-filled:</span> {currentTabState.selectedProduct.category}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Line
                  {currentTabState.selectedProduct && <span className="text-xs text-gray-500 ml-1">(Auto-filled)</span>}
                </label>
                <select
                  value={editingContent ? editFormData.line : currentTabState.formData.line}
                  onChange={(e) => editingContent
                    ? setEditFormData({ ...editFormData, line: e.target.value })
                    : updateCurrentTabState({ formData: { ...currentTabState.formData, line: e.target.value } })
                  }
                  disabled={!!currentTabState.selectedProduct}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
                >
                  <option value="">Select a line</option>
                  {availableLines.map(line => (
                    <option key={line} value={line}>{line}</option>
                  ))}
                </select>
                {currentTabState.selectedProduct && (
                  <div className="mt-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                    <span className="font-medium">Auto-filled:</span> {currentTabState.selectedProduct.line}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* File Upload Section */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <label className="text-sm font-semibold text-gray-900">Upload Media</label>
            </div>
            
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#4f0c1b] transition-colors">
              <input
                type="file"
                multiple
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center"
              >
                <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span className="text-sm font-medium text-gray-700 mb-1">Click to upload or drag and drop</span>
                <span className="text-xs text-gray-500">Images, Videos, Audio, PDF, DOC (up to 50MB)</span>
              </label>
            </div>
            
            {currentTabState.uploadedFiles.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-gray-500 mb-3">
                  Uploaded Media ({currentTabState.uploadedFiles.length})
                  {uploadType === 'collection' && currentTabState.selectedSKUs.length > 0 && (
                    <span className="text-amber-600 ml-2">
                      • Hover over images to link them to SKUs
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {currentTabState.uploadedFiles.map((uploadedFile, index) => {
                    const file = uploadedFile.file instanceof File ? uploadedFile.file : null;
                    const fileUrl = uploadedFile.file instanceof File ? URL.createObjectURL(uploadedFile.file) : uploadedFile.file;
                    const fileType = file ? file.type : (typeof uploadedFile.file === 'string' ? 'image' : 'unknown');
                    const isImage = fileType.startsWith('image/');
                    const isVideo = fileType.startsWith('video/');
                    const isAudio = fileType.startsWith('audio/');
                    const isPDF = fileType === 'application/pdf';
                    const isDocument = fileType.includes('word') || fileType.includes('document');
                    
                    return (
                    <div key={index} className="relative group">
                      <div className="aspect-square w-full border border-gray-300 rounded-lg overflow-hidden bg-gray-100">
                        {isImage ? (
                          <img
                            src={fileUrl}
                            alt={`Upload ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        ) : isVideo ? (
                          <video
                            src={fileUrl}
                            className="w-full h-full object-cover"
                            controls={false}
                          >
                            <source src={fileUrl} type={fileType} />
                          </video>
                        ) : isAudio ? (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-100 to-purple-200">
                            <svg className="w-12 h-12 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                            </svg>
                          </div>
                        ) : isPDF ? (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-100 to-red-200">
                            <svg className="w-12 h-12 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                          </div>
                        ) : isDocument ? (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-100 to-blue-200">
                            <svg className="w-12 h-12 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gray-200">
                            <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        {/* File type badge */}
                        {!isImage && (
                          <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-xs rounded font-medium">
                            {isVideo ? 'VIDEO' : isAudio ? 'AUDIO' : isPDF ? 'PDF' : isDocument ? 'DOC' : 'FILE'}
                          </div>
                        )}
                      </div>
                      
                      {/* SKU Link Selector for Collection */}
                      {uploadType === 'collection' && currentTabState.selectedSKUs.length > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <select
                            value={uploadedFile.linkedSKU || ''}
                            onChange={(e) => handleLinkFileToSKU(index, e.target.value || undefined)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full text-xs px-2 py-1 bg-white text-gray-900 rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-[#4f0c1b]"
                          >
                            <option value="">Not linked</option>
                            {currentTabState.selectedSKUs.map(sku => (
                              <option key={sku} value={sku}>{sku}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      
                      {/* Linked SKU Badge */}
                      {uploadedFile.linkedSKU && (
                        <div className="absolute top-2 left-2 px-2 py-1 bg-[#4f0c1b] text-white text-xs rounded font-medium">
                          {uploadedFile.linkedSKU}
                        </div>
                      )}
                      
                      <button
                        onClick={() => {
                          const newFiles = currentTabState.uploadedFiles.filter((_, i) => i !== index);
                          updateCurrentTabState({ uploadedFiles: newFiles });
                        }}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600 z-10"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    );
                  })}
                </div>
                
                {/* Validation Message for Collection */}
                {uploadType === 'collection' && currentTabState.selectedSKUs.length > 1 && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-800 font-medium mb-2">
                      ⚠️ Each selected SKU must have at least one linked image
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {currentTabState.selectedSKUs.map(sku => {
                        const hasLinkedImage = currentTabState.uploadedFiles.some(uf => uf.linkedSKU === sku);
                        return (
                          <span
                            key={sku}
                            className={`px-2 py-1 text-xs rounded ${
                              hasLinkedImage
                                ? 'bg-green-100 text-green-800 border border-green-300'
                                : 'bg-red-100 text-red-800 border border-red-300'
                            }`}
                          >
                            {sku} {hasLinkedImage ? '✓' : '✗'}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  if (editingContent) {
                    setEditingContent(null);
                    setEditFormData({
                      title: '',
                      description: '',
                      hashtags: '',
                      category: '',
                      line: '',
                      tags: '',
                      language: 'en',
                    });
                    setEditUploadedFiles([]);
                    setEditSelectedSKUs([]);
                  } else {
                    updateCurrentTabState({
                      formData: {
                        title: '',
                        description: '',
                        hashtags: '',
                        category: '',
                        line: '',
                        tags: '',
                        language: 'en',
                      },
                      uploadedFiles: [],
                      selectedSKUs: [],
                      selectedProduct: null,
                      searchSKU: '',
                      showSKUDropdown: false,
                    });
                  }
                }}
                className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-gray-700 transition-all"
              >
                {editingContent ? 'Cancel' : 'Clear'}
              </button>
              <button
                onClick={handleSubmit}
                className="px-6 py-2.5 bg-[#4f0c1b] text-white rounded-lg hover:bg-[#3d0a15] font-medium transition-all shadow-sm hover:shadow-md"
              >
                {editingContent ? t('cms.updateContent') : t('cms.createAsDraft')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Content View */}
      {viewMode === 'manage' && (
        <div className="space-y-6">
          {/* Content Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  {t('cms.contentItems')}
                </h3>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400 font-normal">
                    {filteredContent.length} {t('common.of')} {totalContentCount} {filteredContent.length === 1 ? t('cms.item') : t('cms.items')}
                  </span>
                  {/* Filter Button */}
                  <div className="relative">
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={`flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm ${
                        showFilters ? 'bg-[#4f0c1b] text-white border-[#4f0c1b]' : ''
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                      <span className="text-sm font-medium">{t('cms.filters')}</span>
                      {(filterStatus !== 'all' || filterSKU) && (
                        <span className="bg-red-100 text-red-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                          {[filterStatus !== 'all', filterSKU].filter(Boolean).length}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Filters Panel */}
            {showFilters && (
              <div className="p-6 bg-gray-50 border-b border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('cms.filterByStatus')}</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as ContentStatus | 'all')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b]"
                >
                  <option value="all">{t('cms.allStatus')}</option>
                  <option value="draft">{t('cms.draft')}</option>
                  <option value="submitted">{t('cms.submitted')}</option>
                  <option value="approved">{t('cms.approved')}</option>
                  <option value="published">{t('cms.published')}</option>
                  <option value="archived">{t('cms.archived')}</option>
                  <option value="rejected">{t('cms.rejected')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('cms.filterBySku')}</label>
                <input
                  type="text"
                  value={filterSKU}
                  onChange={(e) => setFilterSKU(e.target.value)}
                  placeholder={t('cms.searchBySkuPlaceholder')}
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
                  {t('cms.clearFilters')}
                </button>
              </div>
            </div>
          </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('cms.preview')}
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('title')}
                    >
                      <div className="flex items-center gap-1">
                        <span>{t('cms.titleColumn')}</span>
                        <SortIcon field="title" />
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('type')}
                    >
                      <div className="flex items-center gap-1">
                        <span>{t('cms.type')}</span>
                        <SortIcon field="type" />
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('linkedSKUs')}
                    >
                      <div className="flex items-center gap-1">
                        <span>{t('cms.linkedSkus')}</span>
                        <SortIcon field="linkedSKUs" />
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center gap-1">
                        <span>{t('cms.status')}</span>
                        <SortIcon field="status" />
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('author')}
                    >
                      <div className="flex items-center gap-1">
                        <span>{t('cms.author')}</span>
                        <SortIcon field="author" />
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('createdAt')}
                    >
                      <div className="flex items-center gap-1">
                        <span>{t('cms.date')}</span>
                        <SortIcon field="createdAt" />
                      </div>
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('cms.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredContent.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                        {t('cms.noContentFound')}
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
                          {(() => {
                            // Prioritize videos, then images
                            const hasVideos = item.videos && item.videos.length > 0;
                            const hasImages = item.images && item.images.length > 0;
                            
                            if (!hasVideos && !hasImages) {
                              return (
                                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                </div>
                              );
                            }
                            
                            // Get the first media item (prioritize video)
                            const mediaUrl = hasVideos ? item.videos[0] : item.images[0];
                            const urlLower = mediaUrl.toLowerCase();
                            
                            // Robust video detection
                            const isVideo = !!(
                              urlLower.includes('/videos/') || 
                              urlLower.match(/\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv|3gp|mpg|mpeg)$/i) ||
                              urlLower.includes('video/') ||
                              urlLower.includes('contenttype=video') ||
                              urlLower.match(/video\/mp4|video\/quicktime|video\/webm|video\/x-msvideo/i) ||
                              // Check for Firebase Storage video patterns
                              (urlLower.includes('firebasestorage') && (
                                urlLower.includes('.mov') || 
                                urlLower.includes('.mp4') || 
                                urlLower.includes('.webm')
                              ))
                            );
                            
                            return (
                              <div className="w-16 h-16 relative rounded-lg overflow-hidden bg-gray-100">
                                {isVideo ? (
                                  <>
                                    <video
                                      src={mediaUrl}
                                      className="w-full h-full object-cover pointer-events-none"
                                      preload="metadata"
                                      muted
                                      playsInline
                                      onLoadedMetadata={(e) => {
                                        const video = e.currentTarget;
                                        if (video.duration > 1) {
                                          video.currentTime = 1;
                                        } else if (video.duration > 0) {
                                          video.currentTime = video.duration / 2;
                                        }
                                      }}
                                      onError={(e) => {
                                        console.log('Video preview failed to load, trying as image:', mediaUrl);
                                      }}
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                                      <div className="w-6 h-6 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center">
                                        <svg className="w-3 h-3 text-gray-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                          <path d="M8 5v14l11-7z" />
                                        </svg>
                                      </div>
                                    </div>
                                    <div className="absolute top-1 left-1 px-1 py-0.5 bg-black/60 backdrop-blur-sm text-white text-[10px] rounded font-medium">
                                      VIDEO
                                    </div>
                                  </>
                                ) : (
                                  <img
                                    src={mediaUrl}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      // If image fails, it might be a video
                                      const img = e.currentTarget;
                                      const imgUrl = img.src;
                                      const urlLower = imgUrl.toLowerCase();
                                      const isVideoUrl = !!(
                                        urlLower.includes('/videos/') || 
                                        urlLower.match(/\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv|3gp|mpg|mpeg)$/i) ||
                                        urlLower.includes('video/') ||
                                        (urlLower.includes('firebasestorage') && (
                                          urlLower.includes('.mov') || 
                                          urlLower.includes('.mp4') || 
                                          urlLower.includes('.webm')
                                        ))
                                      );
                                      if (isVideoUrl) {
                                        // Replace img with video element
                                        const video = document.createElement('video');
                                        video.src = imgUrl;
                                        video.className = 'w-full h-full object-cover pointer-events-none';
                                        video.preload = 'metadata';
                                        video.muted = true;
                                        video.playsInline = true;
                                        video.onloadedmetadata = () => {
                                          if (video.duration > 1) {
                                            video.currentTime = 1;
                                          } else if (video.duration > 0) {
                                            video.currentTime = video.duration / 2;
                                          }
                                        };
                                        img.parentElement?.replaceChild(video, img);
                                      }
                                    }}
                                  />
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{item.title}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                            {item.type === 'product' ? t('cms.product') : 
                             item.type === 'collection' ? t('cms.collection') : 
                             item.type === 'general' ? t('cms.general') : item.type}
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
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {item.status === 'draft' && (
                              <>
                              <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingContent(item);
                                    setUploadType(item.type);
                                    setEditFormData({
                                      title: item.title,
                                      description: item.description,
                                      hashtags: item.hashtags.join(', '),
                                      category: item.category,
                                      line: item.line || '',
                                      tags: item.tags.join(', '),
                                      language: item.language,
                                    });
                                    setEditUploadedFiles(item.images.map(img => img));
                                    setEditSelectedSKUs(item.linkedProductIds || []);
                                    setViewMode('upload');
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-xs font-medium"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  {t('cms.edit')}
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      await updateContentStatus(item.id, 'submitted', user?.id || '');
                                    } catch (error) {
                                      console.error('Error submitting content:', error);
                                      alert(t('cms.submitContentFailed'));
                                    }
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4f0c1b] text-white hover:bg-[#3d0a15] shadow-sm hover:shadow-md transition-all duration-200 text-xs font-medium"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                {t('cms.submit')}
                              </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm(t('cms.deleteDraftConfirm'))) {
                                      try {
                                        deleteContent(item.id);
                                        alert(t('cms.draftDeleted'));
                                      } catch (error) {
                                        console.error('Error deleting draft:', error);
                                        alert(t('cms.deleteDraftFailed'));
                                      }
                                    }
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 bg-white text-red-700 hover:bg-red-50 hover:shadow-md transition-all duration-200 text-xs font-medium"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  {t('cms.delete')}
                                </button>
                              </>
                            )}
                            {item.status === 'submitted' && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingContent(item);
                                    setUploadType(item.type);
                                    setEditFormData({
                                      title: item.title,
                                      description: item.description,
                                      hashtags: item.hashtags.join(', '),
                                      category: item.category,
                                      line: item.line || '',
                                      tags: item.tags.join(', '),
                                      language: item.language,
                                    });
                                    setEditUploadedFiles(item.images.map(img => img));
                                    setEditSelectedSKUs(item.linkedProductIds || []);
                                    setViewMode('upload');
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-xs font-medium"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  {t('cms.edit')}
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (confirm(t('cms.cancelSubmissionConfirm'))) {
                                      try {
                                        await updateContentStatus(item.id, 'draft', user?.id || '');
                                        alert(t('cms.submissionCancelled'));
                                      } catch (error) {
                                        console.error('Error cancelling submission:', error);
                                        alert(t('cms.cancelSubmissionFailed'));
                                      }
                                    }
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-xs font-medium"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                  {t('common.cancel')}
                                </button>
                                {hasPermission('cms.approve') && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleApprove(item.id);
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 shadow-sm hover:shadow-md transition-all duration-200 text-xs font-medium"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    {t('cms.approve')}
                                  </button>
                                )}
                                {hasPermission('cms.deny') && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleReject(item.id);
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 bg-white text-red-700 hover:bg-red-50 hover:shadow-md transition-all duration-200 text-xs font-medium"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    {t('cms.reject')}
                                  </button>
                                )}
                              </>
                            )}
                            {item.status === 'approved' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePublish(item.id);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4f0c1b] text-white hover:bg-[#3d0a15] shadow-sm hover:shadow-md transition-all duration-200 text-xs font-medium"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                {t('cms.publish')}
                              </button>
                            )}
                            {item.status === 'published' && hasPermission('cms.delete') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(t('cms.deletePublishedConfirm'))) {
                                    deleteContent(item.id);
                                  }
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 bg-white text-red-700 hover:bg-red-50 hover:shadow-md transition-all duration-200 text-xs font-medium"
                                title="Only admins can delete published content"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                {t('cms.delete')}
                              </button>
                            )}
                            {item.status === 'rejected' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setResubmitContentId(item.id);
                                  setResubmitModalOpen(true);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4f0c1b] text-white hover:bg-[#3d0a15] shadow-sm hover:shadow-md transition-all duration-200 text-xs font-medium"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                {t('cms.resubmit')}
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
  const { t } = useTranslation();
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  
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
                  <span className="text-xs font-medium text-gray-500">{t('cms.titleColumn')}</span>
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
                  <div className="text-sm font-medium text-gray-900 mt-1">
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
                  </div>
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

          {/* Media (Images and Videos) */}
          {((content.images && content.images.length > 0) || (content.videos && content.videos.length > 0)) && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">
                Media ({((content.images?.length || 0) + (content.videos?.length || 0))})
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {/* Render videos first */}
                {(content.videos || []).map((videoUrl, index) => {
                  const handleVideoClick = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    e.preventDefault();
                    console.log('Video clicked:', videoUrl);
                    setSelectedVideoUrl(videoUrl);
                  };

                  return (
                    <div 
                      key={`video-${index}`} 
                      className="aspect-square bg-gray-100 rounded-lg overflow-hidden relative group cursor-pointer"
                      onClick={handleVideoClick}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleVideoClick(e as any);
                      }}
                    >
                      <video
                        src={videoUrl}
                        className="w-full h-full object-cover pointer-events-none"
                        preload="metadata"
                        muted
                        playsInline
                        onLoadedMetadata={(e) => {
                          const video = e.currentTarget;
                          if (video.duration > 1) {
                            video.currentTime = 1;
                          } else if (video.duration > 0) {
                            video.currentTime = video.duration / 2;
                          }
                        }}
                        onError={(e) => {
                          console.error('Video load error:', e);
                        }}
                      />
                      <div 
                        className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors cursor-pointer z-10"
                        onClick={handleVideoClick}
                      >
                        <div className="w-12 h-12 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center group-hover:scale-110 transition-transform pointer-events-auto">
                          <svg className="w-6 h-6 text-gray-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                      <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-xs rounded font-medium z-10 pointer-events-none">
                        VIDEO
                      </div>
                    </div>
                  );
                })}
                
                {/* Render images, but check if any are actually videos */}
                {(content.images || []).map((mediaUrl, index) => {
                  // Check if it's a video by URL pattern or file extension
                  // Also check for common video MIME types in the URL
                  // More aggressive detection - check URL more thoroughly
                  const urlLower = mediaUrl.toLowerCase();
                  const isVideo = !!(
                    urlLower.includes('/videos/') || 
                    urlLower.match(/\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv|3gp|mpg|mpeg)$/i) ||
                    urlLower.includes('video/') ||
                    urlLower.includes('contenttype=video') ||
                    urlLower.match(/video\/mp4|video\/quicktime|video\/webm|video\/x-msvideo/i) ||
                    // Check for Firebase Storage video patterns
                    (urlLower.includes('firebasestorage') && (
                      urlLower.includes('.mov') || 
                      urlLower.includes('.mp4') || 
                      urlLower.includes('.webm') ||
                      urlLower.includes('videos/')
                    ))
                  );
                  
                  const handleMediaClick = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    e.preventDefault();
                    console.log('Media clicked:', { mediaUrl, isVideo, index });
                    // Always open video player modal - let the player handle if it's actually a video
                    console.log('Opening media player for:', mediaUrl);
                    setSelectedVideoUrl(mediaUrl);
                  };

                  return (
                    <div 
                      key={`image-${index}`} 
                      className="aspect-square bg-gray-100 rounded-lg overflow-hidden relative group cursor-pointer"
                      onClick={handleMediaClick}
                      onContextMenu={(e) => {
                        // Always prevent browser context menu and open our player
                        e.preventDefault();
                        e.stopPropagation();
                        handleMediaClick(e as any);
                      }}
                    >
                      {isVideo ? (
                        <>
                          <video
                            src={mediaUrl}
                            className="w-full h-full object-cover pointer-events-none"
                            preload="metadata"
                            muted
                            playsInline
                            onLoadedMetadata={(e) => {
                              // Seek to 1 second to show a frame
                              const video = e.currentTarget;
                              if (video.duration > 1) {
                                video.currentTime = 1;
                              } else if (video.duration > 0) {
                                video.currentTime = video.duration / 2;
                              }
                            }}
                            onError={(e) => {
                              console.error('Video load error:', e);
                            }}
                          />
                          <div 
                            className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors cursor-pointer z-10"
                            onClick={handleMediaClick}
                          >
                            <div className="w-12 h-12 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center group-hover:scale-110 transition-transform pointer-events-auto">
                              <svg className="w-6 h-6 text-gray-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                          <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-xs rounded font-medium z-10 pointer-events-none">
                            VIDEO
                          </div>
                        </>
                      ) : (
                        <img
                          src={mediaUrl}
                          alt={`${content.title} - Media ${index + 1}`}
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={handleMediaClick}
                          onError={(e) => {
                            // If image fails to load, it might be a video
                            console.log('Image failed to load, checking if it is a video:', mediaUrl);
                            const videoUrl = mediaUrl;
                            const urlLower = videoUrl.toLowerCase();
                            const isVideoUrl = !!(
                              urlLower.includes('/videos/') || 
                              urlLower.match(/\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv|3gp|mpg|mpeg)$/i) ||
                              urlLower.includes('video/') ||
                              (urlLower.includes('firebasestorage') && (
                                urlLower.includes('.mov') || 
                                urlLower.includes('.mp4') || 
                                urlLower.includes('.webm')
                              ))
                            );
                            if (isVideoUrl) {
                              console.log('Detected as video after image load failure, opening player');
                              setSelectedVideoUrl(videoUrl);
                            } else {
                              // Even if not detected, try opening as video - might work
                              console.log('Image failed, trying to open as video anyway');
                              setSelectedVideoUrl(videoUrl);
                            }
                          }}
                        />
                      )}
                    </div>
                  );
                })}
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
      
      {/* Video Player Modal */}
      {selectedVideoUrl && (
        <VideoPlayerModal 
          videoUrl={selectedVideoUrl}
          onClose={() => setSelectedVideoUrl(null)}
        />
      )}
    </div>
  );
}

// Video Player Modal Component
function VideoPlayerModal({ 
  videoUrl, 
  onClose 
}: { 
  videoUrl: string; 
  onClose: () => void;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('VideoPlayerModal mounted with URL:', videoUrl);
    setIsLoading(true);
    
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [videoUrl]);

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-95 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
      style={{ zIndex: 9999 }}
    >
      <div 
        className="relative w-full max-w-5xl bg-black rounded-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute -top-12 left-0 text-white hover:text-gray-300 transition-colors z-10 bg-black/50 rounded-full p-2"
          aria-label="Go back"
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors z-10 bg-black/50 rounded-full p-2"
          aria-label="Close video"
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        {error ? (
          <div className="p-8 text-center">
            <div className="text-red-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-white text-lg mb-2">Error loading video</p>
            <p className="text-gray-400 text-sm">{error}</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="relative w-full bg-black" style={{ maxHeight: '85vh', minHeight: '400px' }}>
            {/* Back button inside video player */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="absolute top-4 left-4 z-20 text-white hover:text-gray-300 transition-colors bg-black/70 hover:bg-black/90 rounded-full p-2 backdrop-blur-sm"
              aria-label="Go back"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
                <div className="text-white text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                  <p>Loading video...</p>
                  <p className="text-xs text-gray-400 mt-2">{videoUrl.substring(0, 50)}...</p>
                </div>
              </div>
            )}
            <video
              key={videoUrl}
              src={videoUrl}
              controls
              autoPlay
              playsInline
              className="w-full h-auto"
              style={{ maxHeight: '85vh', maxWidth: '100%', display: isLoading ? 'none' : 'block' }}
              onError={(e) => {
                console.error('Video error:', e);
                const videoElement = e.currentTarget;
                const error = videoElement.error;
                if (error) {
                  console.error('Video error code:', error.code, 'message:', error.message);
                  setError(`Failed to load video (Error ${error.code}). Please check the URL or try again.`);
                } else {
                  setError('Failed to load video. Please check the URL or try again.');
                }
                setIsLoading(false);
              }}
              onLoadStart={() => {
                console.log('Video loadstart');
                setIsLoading(true);
                setError(null);
              }}
              onCanPlay={() => {
                console.log('Video can play');
                setIsLoading(false);
              }}
              onLoadedData={() => {
                console.log('Video loaded');
                setIsLoading(false);
              }}
              onLoadedMetadata={() => {
                console.log('Video metadata loaded');
                setIsLoading(false);
              }}
            >
              <source src={videoUrl} type="video/mp4" />
              <source src={videoUrl} type="video/quicktime" />
              <source src={videoUrl} type="video/webm" />
              Your browser does not support the video tag.
            </video>
          </div>
        )}
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
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterLine, setFilterLine] = useState('all');
  const [filterAvailability, setFilterAvailability] = useState('all');
  const [filterCollectionName, setFilterCollectionName] = useState('all');
  const [contentTypeFilter, setContentTypeFilter] = useState<'all' | 'product' | 'collection' | 'general' | 'inventory'>('all');
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(new Set());
  const [selectedGeneral, setSelectedGeneral] = useState<Set<string>>(new Set());
  const [selectedProductContent, setSelectedProductContent] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedProductDetail, setSelectedProductDetail] = useState<InventoryItem | null>(null);
  const [selectedCollectionDetail, setSelectedCollectionDetail] = useState<CMSContent | null>(null);
  const [selectedGeneralDetail, setSelectedGeneralDetail] = useState<CMSContent | null>(null);
  const [showPhotoGallery, setShowPhotoGallery] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [showBulkDownload, setShowBulkDownload] = useState(false);
  const [showContentViewer, setShowContentViewer] = useState(false);
  const [contentViewerTab, setContentViewerTab] = useState<'images' | 'videos'>('images');
  const [selectedContentItems, setSelectedContentItems] = useState<Set<string>>(new Set());
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
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
  const [sectionOrder, setSectionOrder] = useState<('product' | 'collection' | 'general' | 'inventory')[]>(['collection', 'general', 'inventory']);
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
  
  // Get unique collection names (titles) from published collection type content
  const collectionNames = [...new Set(content.filter(item => item.type === 'collection' && item.status === 'published').map(item => item.title))].filter(Boolean).sort();

  // Get total counts before filtering (for "X of Y" display) - Only count published content
  const totalProductContent = content.filter(item => item.type === 'product' && item.status === 'published').length;
  const totalCollectionContent = content.filter(item => item.type === 'collection' && item.status === 'published').length;
  const totalGeneralContent = content.filter(item => item.type === 'general' && item.status === 'published').length;
  const totalInventory = inventory.length;

  // Helper function to sort content by creation date (stable order)
  const sortByCreationDate = (a: CMSContent, b: CMSContent) => {
    const dateA = a.metadata.createdAt.getTime();
    const dateB = b.metadata.createdAt.getTime();
    return dateB - dateA; // Newest first
  };

  // Filter CMS content by type - ONLY show published content
  const filteredGeneralContent = content
    .filter(item => {
      if (item.status !== 'published') return false; // Only show published content
    if (item.type !== 'general') return false;
    if (contentTypeFilter !== 'all' && contentTypeFilter !== 'inventory' && contentTypeFilter !== 'general') return false;
    if (contentTypeFilter === 'inventory') return false;
    if (searchTerm && !item.title.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !item.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
    })
    .sort(sortByCreationDate);

  const filteredCollectionContent = content
    .filter(item => {
      if (item.status !== 'published') return false; // Only show published content
    if (item.type !== 'collection') return false;
    if (contentTypeFilter !== 'all' && contentTypeFilter !== 'inventory' && contentTypeFilter !== 'collection') return false;
    if (contentTypeFilter === 'inventory') return false;
    if (searchTerm && !item.title.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !item.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterCollectionName !== 'all' && item.title !== filterCollectionName) return false;
    return true;
    })
    .sort(sortByCreationDate);

  const filteredProductContent = content
    .filter(item => {
      if (item.status !== 'published') return false; // Only show published content
    if (item.type !== 'product') return false;
    if (contentTypeFilter !== 'all' && contentTypeFilter !== 'inventory' && contentTypeFilter !== 'product') return false;
    if (contentTypeFilter === 'inventory') return false;
    if (searchTerm && !item.title.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !item.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
    })
    .sort(sortByCreationDate);

  // Group product content by linked SKU
  const groupedProductContent = filteredProductContent.reduce((acc, item) => {
    // Use the first linked SKU as the grouping key
    const sku = item.linkedProductIds.length > 0 ? item.linkedProductIds[0] : 'unlinked';
    if (!acc[sku]) {
      acc[sku] = [];
    }
    acc[sku].push(item);
    return acc;
  }, {} as Record<string, typeof filteredProductContent>);

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
    collection: {
      title: t('cms.collections'),
      filter: contentTypeFilter === 'all' || contentTypeFilter === 'collection',
      content: filteredCollectionContent,
      totalCount: totalCollectionContent,
      hasContent: filteredCollectionContent.length > 0,
      expanded: expandedSections.collection,
      toggleExpanded: () => setExpandedSections(prev => ({ ...prev, collection: !prev.collection })),
      renderContent: () => (
        <div className="p-6">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
            <span className="text-sm text-gray-600">
              {selectedCollections.size} of {filteredCollectionContent.length} selected
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSelectAllCollections();
              }}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#4f0c1b] bg-[#4f0c1b]/10 rounded-lg hover:bg-[#4f0c1b]/20 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {selectedCollections.size === filteredCollectionContent.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredCollectionContent.map((item) => {
              const isSelected = selectedCollections.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`border rounded-lg p-4 transition-all duration-200 relative cursor-pointer ${
                    isSelected
                      ? 'border-[#4f0c1b] bg-[#4f0c1b]/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => handleToggleCollection(item.id)}
                >
                  {/* Checkbox */}
                  <div className="absolute top-4 right-4 z-10">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleCollection(item.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-5 h-5 text-[#4f0c1b] focus:ring-[#4f0c1b] border-gray-300 rounded cursor-pointer"
                    />
                  </div>
                  {/* Media - opens detail modal */}
                  <div 
                    className="aspect-square bg-gray-100 rounded-lg mb-3 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity relative"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCollectionDetail(item);
                    }}
                  >
                    {(() => {
                      // Prioritize videos, then images
                      const hasVideos = item.videos && item.videos.length > 0;
                      const hasImages = item.images && item.images.length > 0;
                      
                      if (!hasVideos && !hasImages) {
                        return (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        );
                      }
                      
                      // Get the first media item (prioritize video)
                      const mediaUrl = hasVideos ? item.videos[0] : item.images[0];
                      const urlLower = mediaUrl.toLowerCase();
                      
                      // Robust video detection
                      const isVideo = !!(
                        urlLower.includes('/videos/') || 
                        urlLower.match(/\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv|3gp|mpg|mpeg)$/i) ||
                        urlLower.includes('video/') ||
                        urlLower.includes('contenttype=video') ||
                        urlLower.match(/video\/mp4|video\/quicktime|video\/webm|video\/x-msvideo/i) ||
                        (urlLower.includes('firebasestorage') && (
                          urlLower.includes('.mov') || 
                          urlLower.includes('.mp4') || 
                          urlLower.includes('.webm')
                        ))
                      );
                      
                      return isVideo ? (
                        <>
                          <video
                            src={mediaUrl}
                            className="w-full h-full object-cover pointer-events-none"
                            preload="metadata"
                            muted
                            playsInline
                            onLoadedMetadata={(e) => {
                              const video = e.currentTarget;
                              if (video.duration > 1) {
                                video.currentTime = 1;
                              } else if (video.duration > 0) {
                                video.currentTime = video.duration / 2;
                              }
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                            <div className="w-12 h-12 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center">
                              <svg className="w-6 h-6 text-gray-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                          <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-xs rounded font-medium">
                            VIDEO
                          </div>
                        </>
                      ) : (
                        <img
                          src={mediaUrl}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // If image fails, it might be a video
                            const img = e.currentTarget;
                            const imgUrl = img.src;
                            const urlLower = imgUrl.toLowerCase();
                            const isVideoUrl = !!(
                              urlLower.includes('/videos/') || 
                              urlLower.match(/\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv|3gp|mpg|mpeg)$/i) ||
                              urlLower.includes('video/') ||
                              (urlLower.includes('firebasestorage') && (
                                urlLower.includes('.mov') || 
                                urlLower.includes('.mp4') || 
                                urlLower.includes('.webm')
                              ))
                            );
                            if (isVideoUrl) {
                              // Replace img with video element
                              const video = document.createElement('video');
                              video.src = imgUrl;
                              video.className = 'w-full h-full object-cover pointer-events-none';
                              video.preload = 'metadata';
                              video.muted = true;
                              video.playsInline = true;
                              video.onloadedmetadata = () => {
                                if (video.duration > 1) {
                                  video.currentTime = 1;
                                } else if (video.duration > 0) {
                                  video.currentTime = video.duration / 2;
                                }
                              };
                              img.parentElement?.replaceChild(video, img);
                            }
                          }}
                        />
                      );
                    })()}
                  </div>
                  {/* Content area - clicking here selects the item */}
                  <div className="mb-2">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                      {t('cms.collection')}
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
                      {item.status === 'draft' ? t('cms.draft') :
                       item.status === 'submitted' ? t('cms.submitted') :
                       item.status === 'approved' ? t('cms.approved') :
                       item.status === 'published' ? t('cms.published') :
                       item.status === 'rejected' ? t('cms.rejected') :
                       item.status === 'archived' ? t('cms.archived') : item.status}
                    </span>
                    {item.status === 'submitted' && item.metadata.resubmissionCount && item.metadata.resubmissionCount > 0 && (
                      <span className="relative inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-600 rounded-full">
                        {item.metadata.resubmissionCount + 1}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ),
    },
    general: {
      title: t('cms.general'),
      filter: contentTypeFilter === 'all' || contentTypeFilter === 'general',
      content: filteredGeneralContent,
      totalCount: totalGeneralContent,
      hasContent: filteredGeneralContent.length > 0,
      expanded: expandedSections.general,
      toggleExpanded: () => setExpandedSections(prev => ({ ...prev, general: !prev.general })),
      renderContent: () => (
        <div className="p-6">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
            <span className="text-sm text-gray-600">
              {selectedGeneral.size} of {filteredGeneralContent.length} selected
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSelectAllGeneral();
              }}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#4f0c1b] bg-[#4f0c1b]/10 rounded-lg hover:bg-[#4f0c1b]/20 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {selectedGeneral.size === filteredGeneralContent.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredGeneralContent.map((item) => {
              const isSelected = selectedGeneral.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`border rounded-lg p-4 transition-all duration-200 relative cursor-pointer ${
                    isSelected
                      ? 'border-[#4f0c1b] bg-[#4f0c1b]/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => handleToggleGeneral(item.id)}
                >
                  {/* Checkbox */}
                  <div className="absolute top-4 right-4 z-10">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleGeneral(item.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-5 h-5 text-[#4f0c1b] focus:ring-[#4f0c1b] border-gray-300 rounded cursor-pointer"
                    />
                  </div>
                  {/* Media - opens detail modal */}
                  <div 
                    className="aspect-square bg-gray-100 rounded-lg mb-3 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity relative"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedGeneralDetail(item);
                    }}
                  >
                    {(() => {
                      // Prioritize videos, then images
                      const hasVideos = item.videos && item.videos.length > 0;
                      const hasImages = item.images && item.images.length > 0;
                      
                      if (!hasVideos && !hasImages) {
                        return (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        );
                      }
                      
                      // Get the first media item (prioritize video)
                      const mediaUrl = hasVideos ? item.videos[0] : item.images[0];
                      const urlLower = mediaUrl.toLowerCase();
                      
                      // Robust video detection
                      const isVideo = !!(
                        urlLower.includes('/videos/') || 
                        urlLower.match(/\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv|3gp|mpg|mpeg)$/i) ||
                        urlLower.includes('video/') ||
                        urlLower.includes('contenttype=video') ||
                        urlLower.match(/video\/mp4|video\/quicktime|video\/webm|video\/x-msvideo/i) ||
                        (urlLower.includes('firebasestorage') && (
                          urlLower.includes('.mov') || 
                          urlLower.includes('.mp4') || 
                          urlLower.includes('.webm')
                        ))
                      );
                      
                      return isVideo ? (
                        <>
                          <video
                            src={mediaUrl}
                            className="w-full h-full object-cover pointer-events-none"
                            preload="metadata"
                            muted
                            playsInline
                            onLoadedMetadata={(e) => {
                              const video = e.currentTarget;
                              if (video.duration > 1) {
                                video.currentTime = 1;
                              } else if (video.duration > 0) {
                                video.currentTime = video.duration / 2;
                              }
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                            <div className="w-12 h-12 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center">
                              <svg className="w-6 h-6 text-gray-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                          <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-xs rounded font-medium">
                            VIDEO
                          </div>
                        </>
                      ) : (
                        <img
                          src={mediaUrl}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // If image fails, it might be a video
                            const img = e.currentTarget;
                            const imgUrl = img.src;
                            const urlLower = imgUrl.toLowerCase();
                            const isVideoUrl = !!(
                              urlLower.includes('/videos/') || 
                              urlLower.match(/\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv|3gp|mpg|mpeg)$/i) ||
                              urlLower.includes('video/') ||
                              (urlLower.includes('firebasestorage') && (
                                urlLower.includes('.mov') || 
                                urlLower.includes('.mp4') || 
                                urlLower.includes('.webm')
                              ))
                            );
                            if (isVideoUrl) {
                              // Replace img with video element
                              const video = document.createElement('video');
                              video.src = imgUrl;
                              video.className = 'w-full h-full object-cover pointer-events-none';
                              video.preload = 'metadata';
                              video.muted = true;
                              video.playsInline = true;
                              video.onloadedmetadata = () => {
                                if (video.duration > 1) {
                                  video.currentTime = 1;
                                } else if (video.duration > 0) {
                                  video.currentTime = video.duration / 2;
                                }
                              };
                              img.parentElement?.replaceChild(video, img);
                            }
                          }}
                        />
                      );
                    })()}
                  </div>
                  {/* Content area - clicking here selects the item */}
                  <div className="mb-2">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                      {t('cms.general')}
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
                      {item.status === 'draft' ? t('cms.draft') :
                       item.status === 'submitted' ? t('cms.submitted') :
                       item.status === 'approved' ? t('cms.approved') :
                       item.status === 'published' ? t('cms.published') :
                       item.status === 'rejected' ? t('cms.rejected') :
                       item.status === 'archived' ? t('cms.archived') : item.status}
                    </span>
                    {item.status === 'submitted' && item.metadata.resubmissionCount && item.metadata.resubmissionCount > 0 && (
                      <span className="relative inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-600 rounded-full">
                        {item.metadata.resubmissionCount + 1}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ),
    },
    inventory: {
      title: t('cms.products'),
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
              <h3 className="mt-2 text-sm font-medium text-gray-900">{t('cms.noProductsFound')}</h3>
              <p className="mt-1 text-sm text-gray-500">{t('cms.tryAdjustingFilters')}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
                <span className="text-sm text-gray-600">
                  {selectedProducts.size} of {filteredInventory.length} selected
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectAllInventory();
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#4f0c1b] bg-[#4f0c1b]/10 rounded-lg hover:bg-[#4f0c1b]/20 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {selectedProducts.size === filteredInventory.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredInventory.map((item) => {
                const totalStock = item.ecuadorStock + item.usaStock;
                const isInStock = totalStock > 0;
                // Get product content for this SKU
                const productContentForSKU = groupedProductContent[item.sku] || [];
                
                // Helper function to detect if a URL is a video
                const isVideoUrl = (url: string): boolean => {
                  const urlLower = url.toLowerCase();
                  return !!(
                    urlLower.includes('/videos/') || 
                    urlLower.match(/\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv|3gp|mpg|mpeg)$/i) ||
                    urlLower.includes('video/') ||
                    urlLower.includes('contenttype=video') ||
                    urlLower.match(/video\/mp4|video\/quicktime|video\/webm|video\/x-msvideo/i) ||
                    (urlLower.includes('firebasestorage') && (
                      urlLower.includes('.mov') || 
                      urlLower.includes('.mp4') || 
                      urlLower.includes('.webm')
                    ))
                  );
                };

                // Separate images and videos: filter out videos from images arrays
                const inventoryImages = (item.images || []).filter(img => !isVideoUrl(img));
                const inventoryVideos = (item.images || []).filter(img => isVideoUrl(img));
                
                const cmsImages = productContentForSKU.flatMap(content => {
                  const contentImages = content.images || [];
                  return contentImages.filter(img => !isVideoUrl(img));
                });
                const cmsVideos = productContentForSKU.flatMap(content => {
                  const contentImages = content.images || [];
                  const contentVideos = content.videos || [];
                  // Filter videos from images array and combine with videos array
                  const videosFromImages = contentImages.filter(img => isVideoUrl(img));
                  return [...contentVideos, ...videosFromImages];
                });
                
                const allImages: string[] = [
                  ...inventoryImages,
                  ...cmsImages
                ];
                
                const allVideos: string[] = [
                  ...inventoryVideos,
                  ...cmsVideos
                ];
                
                // Get main photo (first available image, or first video if no images)
                const mainPhoto = allImages.length > 0 ? allImages[0] : (allVideos.length > 0 ? allVideos[0] : null);
                const mainPhotoIsVideo = mainPhoto ? isVideoUrl(mainPhoto) : false;
                
                return (
                  <div
                    key={item.id}
                    className={`border rounded-lg p-4 transition-all duration-200 relative cursor-pointer ${
                      selectedProducts.has(item.sku)
                        ? 'border-[#4f0c1b] bg-[#4f0c1b]/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleToggleProduct(item.sku)}
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

                    {/* Media - opens detail modal */}
                    <div 
                      className="aspect-square bg-gray-100 rounded-lg mb-3 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity relative" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProductDetail(item);
                        setSelectedPhotoIndex(0);
                      }}
                    >
                      {mainPhoto ? (() => {
                        return mainPhotoIsVideo ? (
                          <>
                            <video
                              src={mainPhoto}
                              className="w-full h-full object-cover pointer-events-none"
                              preload="metadata"
                              muted
                              playsInline
                              onLoadedMetadata={(e) => {
                                const video = e.currentTarget;
                                if (video.duration > 1) {
                                  video.currentTime = 1;
                                } else if (video.duration > 0) {
                                  video.currentTime = video.duration / 2;
                                }
                              }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                              <div className="w-12 h-12 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center">
                                <svg className="w-6 h-6 text-gray-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                            <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-xs rounded font-medium">
                              VIDEO
                            </div>
                          </>
                        ) : (
                          <img
                            src={mainPhoto}
                            alt={item.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // If image fails, it might be a video
                              const img = e.currentTarget;
                              const imgUrl = img.src;
                              const urlLower = imgUrl.toLowerCase();
                              const isVideoUrl = !!(
                                urlLower.includes('/videos/') || 
                                urlLower.match(/\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv|3gp|mpg|mpeg)$/i) ||
                                urlLower.includes('video/') ||
                                (urlLower.includes('firebasestorage') && (
                                  urlLower.includes('.mov') || 
                                  urlLower.includes('.mp4') || 
                                  urlLower.includes('.webm')
                                ))
                              );
                              if (isVideoUrl) {
                                // Replace img with video element
                                const video = document.createElement('video');
                                video.src = imgUrl;
                                video.className = 'w-full h-full object-cover pointer-events-none';
                                video.preload = 'metadata';
                                video.muted = true;
                                video.playsInline = true;
                                video.onloadedmetadata = () => {
                                  if (video.duration > 1) {
                                    video.currentTime = 1;
                                  } else if (video.duration > 0) {
                                    video.currentTime = video.duration / 2;
                                  }
                                };
                                img.parentElement?.replaceChild(video, img);
                              }
                            }}
                          />
                        );
                      })() : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    
                    {/* Content area - clicking here selects the item */}
                    <div className="space-y-2">
                      <h4 className="font-medium text-gray-900 text-sm line-clamp-2">{item.name}</h4>
                      
                      <div className="text-xs text-gray-500 space-y-1">
                        <div><strong>{t('inventory.sku')}:</strong> {item.sku}</div>
                        <div><strong>{t('cms.model')}:</strong> {item.supplierSKU || 'N/A'}</div>
                        <div><strong>{t('cms.category')}:</strong> {item.category}</div>
                        <div><strong>{t('cms.line')}:</strong> {item.line}</div>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs">
                        <span className={`px-2 py-1 rounded-full font-medium ${
                          isInStock ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {isInStock ? t('cms.inStock') : t('cms.outOfStock')}
                        </span>
                        <span className="text-gray-500">
                          {allImages.length} {allImages.length !== 1 ? t('cms.images') : t('cms.image')}
                        </span>
                      </div>
                      
                      <div className="text-xs text-gray-500">
                        <div>{t('cms.ecuador')}: {item.ecuadorStock} {t('cms.units')}</div>
                        <div>{t('cms.usa')}: {item.usaStock} {t('cms.units')}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </>
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

  // Handle select all for inventory
  const handleSelectAllInventory = () => {
    if (selectedProducts.size === filteredInventory.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredInventory.map(item => item.sku)));
    }
  };

  // Handle select/deselect all items across all content types
  const handleSelectAllItems = () => {
    const totalItems = filteredInventory.length + filteredCollectionContent.length + filteredGeneralContent.length + filteredProductContent.length;
    const totalSelected = selectedProducts.size + selectedCollections.size + selectedGeneral.size + selectedProductContent.size;
    
    if (totalSelected === totalItems) {
      // Deselect all
      setSelectedProducts(new Set());
      setSelectedCollections(new Set());
      setSelectedGeneral(new Set());
      setSelectedProductContent(new Set());
    } else {
      // Select all
      setSelectedProducts(new Set(filteredInventory.map(item => item.sku)));
      setSelectedCollections(new Set(filteredCollectionContent.map(item => item.id)));
      setSelectedGeneral(new Set(filteredGeneralContent.map(item => item.id)));
      setSelectedProductContent(new Set(filteredProductContent.map(item => item.id)));
    }
  };

  // Handle select all for collections
  const handleSelectAllCollections = () => {
    if (selectedCollections.size === filteredCollectionContent.length) {
      setSelectedCollections(new Set());
    } else {
      setSelectedCollections(new Set(filteredCollectionContent.map(item => item.id)));
    }
  };

  // Handle select all for general content
  const handleSelectAllGeneral = () => {
    if (selectedGeneral.size === filteredGeneralContent.length) {
      setSelectedGeneral(new Set());
    } else {
      setSelectedGeneral(new Set(filteredGeneralContent.map(item => item.id)));
    }
  };

  // Handle select all for product content
  const handleSelectAllProductContent = () => {
    if (selectedProductContent.size === filteredProductContent.length) {
      setSelectedProductContent(new Set());
    } else {
      setSelectedProductContent(new Set(filteredProductContent.map(item => item.id)));
    }
  };

  // Handle collection selection
  const handleToggleCollection = (contentId: string) => {
    const newSelected = new Set(selectedCollections);
    if (newSelected.has(contentId)) {
      newSelected.delete(contentId);
    } else {
      newSelected.add(contentId);
    }
    setSelectedCollections(newSelected);
  };

  // Handle general content selection
  const handleToggleGeneral = (contentId: string) => {
    const newSelected = new Set(selectedGeneral);
    if (newSelected.has(contentId)) {
      newSelected.delete(contentId);
    } else {
      newSelected.add(contentId);
    }
    setSelectedGeneral(newSelected);
  };

  // Handle product content selection
  const handleToggleProductContent = (contentId: string) => {
    const newSelected = new Set(selectedProductContent);
    if (newSelected.has(contentId)) {
      newSelected.delete(contentId);
    } else {
      newSelected.add(contentId);
    }
    setSelectedProductContent(newSelected);
  };

  // Download images from all selected content as ZIP - Simple approach using URLs directly
  const handleDownloadImages = async () => {
    const totalSelected = selectedProducts.size + selectedCollections.size + selectedGeneral.size + selectedProductContent.size;
    
    if (totalSelected === 0) {
      alert('Please select items to download images');
      return;
    }

    setIsDownloading(true);

    try {
      const zip = new JSZip();
      let fileCount = 0;
      let failedCount = 0;
      const usedFileNames = new Set<string>();

      // Helper function to sanitize filenames
      const sanitizeFileName = (name: string) => {
        return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      };

      // Helper function to get unique filename
      const getUniqueFileName = (baseName: string, extension: string = 'jpg'): string => {
        let fileName = `${baseName}.${extension}`;
        let counter = 1;
        while (usedFileNames.has(fileName)) {
          fileName = `${baseName}_${counter}.${extension}`;
          counter++;
        }
        usedFileNames.add(fileName);
        return fileName;
      };

      // Download image using API route (bypasses CORS by using server-side proxy)
      const downloadImage = async (imageUrl: string): Promise<Blob | null> => {
        try {
          // Handle data URLs (base64)
          if (imageUrl.startsWith('data:')) {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            return blob.size > 0 ? blob : null;
          }
          
          // Use API route to proxy the download (server-side, no CORS issues)
          const apiUrl = `/api/download-image?url=${encodeURIComponent(imageUrl)}`;
          const response = await fetch(apiUrl, {
            method: 'GET',
            cache: 'no-cache'
          });
          
          if (response.ok) {
            const blob = await response.blob();
            if (blob && blob.size > 0) {
              return blob;
            }
          } else {
            console.warn('API route failed with status:', response.status);
          }
          
          return null;
        } catch (error) {
          console.error('Error downloading image via API:', imageUrl.substring(0, 50) + '...', error);
          return null;
        }
      };

      // Track SKUs that are already processed
      const processedSKUs = new Set<string>();

      // Process inventory items
      const selectedInventoryItems = inventory.filter(item => selectedProducts.has(item.sku));
      for (const item of selectedInventoryItems) {
        processedSKUs.add(item.sku);
        const productContentForSKU = groupedProductContent[item.sku] || [];
        const allImages = [
          ...(item.images || []),
          ...productContentForSKU.flatMap(content => content.images || [])
        ];

        for (let i = 0; i < allImages.length; i++) {
          const imageUrl = allImages[i];
          console.log(`Downloading image ${i + 1}/${allImages.length} for SKU ${item.sku}:`, imageUrl.substring(0, 80) + '...');
          const blob = await downloadImage(imageUrl);
          if (blob) {
            console.log(`✓ Successfully downloaded image ${i + 1} for SKU ${item.sku}, size: ${blob.size} bytes`);
            zip.file(getUniqueFileName(`${item.sku}_${i + 1}`), blob);
            fileCount++;
          } else {
            console.warn(`✗ Failed to download image ${i + 1} for SKU ${item.sku}`);
            failedCount++;
          }
        }
      }

      // Process collection items
      const selectedCollectionItems = filteredCollectionContent.filter(item => selectedCollections.has(item.id));
      for (const item of selectedCollectionItems) {
        if (item.images && item.images.length > 0) {
          const safeTitle = sanitizeFileName(item.title);
          for (let i = 0; i < item.images.length; i++) {
            const imageUrl = item.images[i];
            console.log(`Downloading collection image ${i + 1}/${item.images.length} for "${item.title}"`);
            const blob = await downloadImage(imageUrl);
            if (blob) {
              zip.file(getUniqueFileName(`${safeTitle}_${i + 1}`), blob);
              fileCount++;
            } else {
              failedCount++;
            }
          }
        }
      }

      // Process general content items
      const selectedGeneralItems = filteredGeneralContent.filter(item => selectedGeneral.has(item.id));
      for (const item of selectedGeneralItems) {
        if (item.images && item.images.length > 0) {
          const safeTitle = sanitizeFileName(item.title);
          for (let i = 0; i < item.images.length; i++) {
            const imageUrl = item.images[i];
            console.log(`Downloading collection image ${i + 1}/${item.images.length} for "${item.title}"`);
            const blob = await downloadImage(imageUrl);
            if (blob) {
              zip.file(getUniqueFileName(`${safeTitle}_${i + 1}`), blob);
              fileCount++;
            } else {
              failedCount++;
            }
          }
        }
      }

      // Process product content items (skip if SKU already processed)
      const selectedProductContentItems = filteredProductContent.filter(item => {
        if (!selectedProductContent.has(item.id)) return false;
        const sku = item.linkedProductIds.length > 0 ? item.linkedProductIds[0] : null;
        return sku ? !processedSKUs.has(sku) : true;
      });
      
      for (const item of selectedProductContentItems) {
        if (item.images && item.images.length > 0) {
          const sku = item.linkedProductIds.length > 0 ? item.linkedProductIds[0] : 'unlinked';
          for (let i = 0; i < item.images.length; i++) {
            const blob = await downloadImage(item.images[i]);
            if (blob) {
              zip.file(getUniqueFileName(`${sku}_${i + 1}`), blob);
              fileCount++;
            } else {
              failedCount++;
            }
          }
        }
      }

      if (fileCount === 0) {
        alert(failedCount > 0 
          ? `Failed to download all ${failedCount} image(s). Please check your internet connection.`
          : 'No images found in selected items'
        );
        setIsDownloading(false);
        return;
      }

      // Generate ZIP
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      
      // Download ZIP
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `media_download_${new Date().toISOString().split('T')[0]}.zip`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);

      const totalItems = selectedInventoryItems.length + selectedCollectionItems.length + selectedGeneralItems.length + selectedProductContentItems.length;
      alert(failedCount > 0
        ? `Downloaded ${fileCount} image(s) successfully. ${failedCount} image(s) failed.`
        : `Successfully downloaded ${fileCount} image(s) from ${totalItems} item(s) as ZIP file`
      );
    } catch (error) {
      console.error('Error downloading images:', error);
      alert(`Error downloading images: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDownloading(false);
    }
  };

  // Count active filters
  const activeFiltersCount = [
    contentTypeFilter !== 'all',
    searchTerm,
    filterCategory !== 'all',
    filterLine !== 'all',
    filterAvailability !== 'all',
    filterCollectionName !== 'all'
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Filters and Bulk Download Toggle Buttons */}
      <div className="flex items-center justify-end gap-3">
        <div className="relative">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm ${
              showFilters ? 'bg-[#4f0c1b] text-white border-[#4f0c1b]' : ''
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="text-sm font-medium">{t('cms.filtersButton')}</span>
            {activeFiltersCount > 0 && (
              <span className="bg-red-100 text-red-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>
        {/* Bulk Download Toggle Button - Show for all content types */}
        <div className="relative">
          <button
            onClick={() => setShowBulkDownload(!showBulkDownload)}
            className={`flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm ${
              showBulkDownload ? 'bg-[#4f0c1b] text-white border-[#4f0c1b]' : ''
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm font-medium">{t('cms.bulkDownloadButton')}</span>
            {(selectedProducts.size + selectedCollections.size + selectedGeneral.size + selectedProductContent.size) > 0 && (
              <span className="bg-blue-100 text-blue-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                {selectedProducts.size + selectedCollections.size + selectedGeneral.size + selectedProductContent.size}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
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
      )}

      {/* Bulk Download Panel - Show for all content types */}
      {showBulkDownload && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Bulk Download</h3>
              <p className="text-sm text-gray-600 mt-1">Select items from any section and download all images</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                {selectedProducts.size + selectedCollections.size + selectedGeneral.size + selectedProductContent.size} item(s) selected
              </span>
              <button
                onClick={handleDownloadImages}
                disabled={(selectedProducts.size + selectedCollections.size + selectedGeneral.size + selectedProductContent.size) === 0 || isDownloading}
                className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {isDownloading ? 'Creating ZIP...' : 'Download as ZIP'}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
            <button
              onClick={handleSelectAllItems}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#4f0c1b] bg-[#4f0c1b]/10 rounded-lg hover:bg-[#4f0c1b]/20 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {(selectedProducts.size + selectedCollections.size + selectedGeneral.size + selectedProductContent.size) === 
               (filteredInventory.length + filteredCollectionContent.length + filteredGeneralContent.length + filteredProductContent.length)
                ? 'Deselect All' 
                : 'Select All'}
            </button>
            <span className="text-xs text-gray-400">|</span>
            <span className="text-xs text-gray-500">
              {filteredInventory.length + filteredCollectionContent.length + filteredGeneralContent.length + filteredProductContent.length} total items available
            </span>
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


      {/* Photo Gallery Modal */}
      {showPhotoGallery && selectedProductDetail && (() => {
        // Get all images: inventory images first, then CMS content images
        const productContentForSKU = groupedProductContent[selectedProductDetail.sku] || [];
        const allImages: string[] = [
          ...(selectedProductDetail.images || []),
          ...productContentForSKU.flatMap(content => content.images || [])
        ];
        
        if (allImages.length === 0) return null;
        
        return (
          <div 
            className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4" 
            onClick={() => {
              setShowPhotoGallery(false);
              setSelectedProductDetail(null);
            }}
          >
            <div className="relative w-full h-full max-w-7xl max-h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/50 to-transparent px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white">{selectedProductDetail.name}</h3>
                  <p className="text-sm text-white/80">Image {selectedPhotoIndex + 1} of {allImages.length}</p>
                </div>
                <button
                  onClick={() => {
                    setShowPhotoGallery(false);
                    setSelectedProductDetail(null);
                  }}
                  className="text-white hover:text-gray-300 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Main Image */}
              <div className="flex-1 flex items-center justify-center relative">
                {/* Previous Button */}
                {allImages.length > 1 && (
                  <button
                    onClick={() => setSelectedPhotoIndex((prev) => (prev - 1 + allImages.length) % allImages.length)}
                    className="absolute left-4 z-10 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full p-3 text-white transition-all"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}

                {/* Current Image */}
                <img
                  src={allImages[selectedPhotoIndex]}
                  alt={`${selectedProductDetail.name} - Image ${selectedPhotoIndex + 1}`}
                  className="max-w-full max-h-full object-contain"
                />

                {/* Next Button */}
                {allImages.length > 1 && (
                  <button
                    onClick={() => setSelectedPhotoIndex((prev) => (prev + 1) % allImages.length)}
                    className="absolute right-4 z-10 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full p-3 text-white transition-all"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Thumbnail Strip */}
              {allImages.length > 1 && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-6 py-4">
                  <div className="flex gap-2 justify-center overflow-x-auto pb-2">
                    {allImages.map((img: string, index: number) => (
                      <button
                        key={index}
                        onClick={() => setSelectedPhotoIndex(index)}
                        className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                          index === selectedPhotoIndex 
                            ? 'border-white scale-110' 
                            : 'border-white/30 hover:border-white/60'
                        }`}
                      >
                        <img
                          src={img}
                          alt={`Thumbnail ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Product Detail Modal */}
      {selectedProductDetail && !showPhotoGallery && (() => {
        // Helper function to detect if a URL is a video
        const isVideoUrl = (url: string): boolean => {
          const urlLower = url.toLowerCase();
          return !!(
            urlLower.includes('/videos/') || 
            urlLower.match(/\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv|3gp|mpg|mpeg)$/i) ||
            urlLower.includes('video/') ||
            urlLower.includes('contenttype=video') ||
            urlLower.match(/video\/mp4|video\/quicktime|video\/webm|video\/x-msvideo/i) ||
            (urlLower.includes('firebasestorage') && (
              urlLower.includes('.mov') || 
              urlLower.includes('.mp4') || 
              urlLower.includes('.webm')
            ))
          );
        };

        // Get all media: inventory first, then CMS content
        const productContentForSKU = groupedProductContent[selectedProductDetail.sku] || [];
        
        // Separate images and videos
        const inventoryImages = (selectedProductDetail.images || []).filter(img => !isVideoUrl(img));
        const inventoryVideos = (selectedProductDetail.images || []).filter(img => isVideoUrl(img));
        
        const cmsImages = productContentForSKU.flatMap(content => {
          const contentImages = content.images || [];
          return contentImages.filter(img => !isVideoUrl(img));
        });
        const cmsVideos = productContentForSKU.flatMap(content => {
          const contentImages = content.images || [];
          const contentVideos = content.videos || [];
          const videosFromImages = contentImages.filter(img => isVideoUrl(img));
          return [...contentVideos, ...videosFromImages];
        });
        
        const allImages: string[] = [
          ...inventoryImages,
          ...cmsImages
        ];
        const allVideos: string[] = [
          ...inventoryVideos,
          ...cmsVideos
        ];
        
        // Get main photo (first image, not video)
        const mainPhoto = allImages.length > 0 ? allImages[0] : null;
        
        return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedProductDetail(null)}>
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
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
                {/* Images Gallery at Top - Max 4 visible + overflow indicator */}
                {allImages.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <h4 className="text-base font-semibold text-gray-900">Images</h4>
                      </div>
                      <span className="px-2.5 py-0.5 bg-[#4f0c1b]/10 text-[#4f0c1b] text-xs font-semibold rounded-full">
                        {allImages.length}
                      </span>
                    </div>
                    <div className="flex gap-3">
                      {allImages.slice(0, 4).map((img: string, index: number) => (
                        <div 
                          key={index} 
                          className="flex-shrink-0 w-24 h-24 bg-gray-100 rounded-xl overflow-hidden cursor-pointer hover:opacity-90 hover:scale-105 transition-all duration-200 border-2 border-gray-200 shadow-sm hover:shadow-md"
                          onClick={() => {
                            setSelectedContentItems(new Set());
                            setContentViewerTab('images');
                            setShowContentViewer(true);
                          }}
                        >
                          <img
                            src={img}
                            alt={`${selectedProductDetail.name} - Image ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                      {allImages.length > 4 && (
                        <div 
                          className="flex-shrink-0 w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center cursor-pointer hover:from-gray-200 hover:to-gray-300 transition-all duration-200 border-2 border-gray-300 shadow-sm hover:shadow-md hover:scale-105"
                          onClick={() => {
                            setSelectedContentItems(new Set());
                            setContentViewerTab('images');
                            setShowContentViewer(true);
                          }}
                        >
                          <div className="text-center">
                            <span className="text-[#4f0c1b] font-bold text-xl block leading-tight">+</span>
                            <span className="text-[#4f0c1b] font-semibold text-sm block leading-tight">{allImages.length - 4}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Videos Gallery */}
                {allVideos.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <h4 className="text-base font-semibold text-gray-900">Videos</h4>
                      </div>
                      <span className="px-2.5 py-0.5 bg-[#4f0c1b]/10 text-[#4f0c1b] text-xs font-semibold rounded-full">
                        {allVideos.length}
                      </span>
                    </div>
                    <div className="flex gap-3">
                      {allVideos.slice(0, 4).map((video: string, index: number) => (
                        <div 
                          key={index} 
                          className="flex-shrink-0 w-24 h-24 bg-gray-100 rounded-xl overflow-hidden cursor-pointer hover:opacity-90 hover:scale-105 transition-all duration-200 border-2 border-gray-200 shadow-sm hover:shadow-md relative"
                          onClick={() => {
                            setSelectedContentItems(new Set());
                            setContentViewerTab('videos');
                            setShowContentViewer(true);
                          }}
                        >
                          <video
                            src={video}
                            className="w-full h-full object-cover"
                            preload="metadata"
                            muted
                            playsInline
                            onLoadedMetadata={(e) => {
                              const videoEl = e.currentTarget;
                              if (videoEl.duration > 1) {
                                videoEl.currentTime = 1;
                              } else if (videoEl.duration > 0) {
                                videoEl.currentTime = videoEl.duration / 2;
                              }
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <div className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center">
                              <svg className="w-4 h-4 text-gray-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                          <div className="absolute top-1 left-1 px-1 py-0.5 bg-black/60 backdrop-blur-sm text-white text-[10px] rounded font-medium">
                            VIDEO
                          </div>
                        </div>
                      ))}
                      {allVideos.length > 4 && (
                        <div 
                          className="flex-shrink-0 w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center cursor-pointer hover:from-gray-200 hover:to-gray-300 transition-all duration-200 border-2 border-gray-300 shadow-sm hover:shadow-md hover:scale-105"
                          onClick={() => {
                            setSelectedContentItems(new Set());
                            setContentViewerTab('videos');
                            setShowContentViewer(true);
                          }}
                        >
                          <div className="text-center">
                            <span className="text-[#4f0c1b] font-bold text-xl block leading-tight">+</span>
                            <span className="text-[#4f0c1b] font-semibold text-sm block leading-tight">{allVideos.length - 4}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Product Details */}
                  <div className="space-y-6">
                  <div>
                      <div className="flex items-center gap-2 mb-4">
                        <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h4 className="text-base font-semibold text-gray-900">Product Information</h4>
                      </div>
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 space-y-4 border border-gray-200 shadow-sm">
                        <div className="flex items-start justify-between pb-3 border-b border-gray-200">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">SKU</span>
                          <p className="text-sm font-semibold text-gray-900 text-right">{selectedProductDetail.sku}</p>
                      </div>
                        <div className="flex items-start justify-between pb-3 border-b border-gray-200">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Model</span>
                          <p className="text-sm font-semibold text-gray-900 text-right">{selectedProductDetail.supplierSKU || 'N/A'}</p>
                      </div>
                        <div className="flex items-start justify-between pb-3 border-b border-gray-200">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</span>
                          <p className="text-sm font-semibold text-gray-900 text-right">{selectedProductDetail.category}</p>
                      </div>
                        <div className="flex items-start justify-between pb-3 border-b border-gray-200">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Line</span>
                          <p className="text-sm font-semibold text-gray-900 text-right">{selectedProductDetail.line}</p>
                        </div>
                        <div className="pt-1">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Description</span>
                          <p className="text-sm text-gray-700 leading-relaxed">{selectedProductDetail.description || 'No description available'}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                      <div className="flex items-center gap-2 mb-4">
                        <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        <h4 className="text-base font-semibold text-gray-900">Stock Information</h4>
                      </div>
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 space-y-4 border border-gray-200 shadow-sm">
                        <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-sm font-medium text-gray-700">Ecuador Stock</span>
                      </div>
                          <span className="text-lg font-bold text-gray-900">{selectedProductDetail.ecuadorStock} units</span>
                        </div>
                        <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-sm font-medium text-gray-700">USA Stock</span>
                          </div>
                          <span className="text-lg font-bold text-gray-900">{selectedProductDetail.usaStock} units</span>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                          <span className="text-sm font-semibold text-gray-900">Total Stock</span>
                          <span className="text-xl font-bold text-[#4f0c1b]">
                          {selectedProductDetail.ecuadorStock + selectedProductDetail.usaStock} units
                        </span>
                      </div>
                        <div className="pt-3 border-t border-gray-200">
                          <span className={`inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-full ${
                          (selectedProductDetail.ecuadorStock + selectedProductDetail.usaStock) > 0
                              ? 'bg-green-100 text-green-800 border border-green-200'
                              : 'bg-red-100 text-red-800 border border-red-200'
                          }`}>
                            {(selectedProductDetail.ecuadorStock + selectedProductDetail.usaStock) > 0 ? (
                              <>
                                <svg className="w-3.5 h-3.5 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                In Stock
                              </>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                Out of Stock
                              </>
                            )}
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
        );
      })()}

      {/* Content Viewer Modal */}
      {showContentViewer && selectedProductDetail && (() => {
        // Get all images and videos: inventory first, then CMS content
        const productContentForSKU = groupedProductContent[selectedProductDetail.sku] || [];
        // Helper function to detect if a URL is a video
        const isVideoUrl = (url: string): boolean => {
          const urlLower = url.toLowerCase();
          return !!(
            urlLower.includes('/videos/') || 
            urlLower.match(/\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv|3gp|mpg|mpeg)$/i) ||
            urlLower.includes('video/') ||
            urlLower.includes('contenttype=video') ||
            urlLower.match(/video\/mp4|video\/quicktime|video\/webm|video\/x-msvideo/i) ||
            (urlLower.includes('firebasestorage') && (
              urlLower.includes('.mov') || 
              urlLower.includes('.mp4') || 
              urlLower.includes('.webm')
            ))
          );
        };

        // Collect all media from inventory and CMS content
        const inventoryImages = (selectedProductDetail.images || []).filter(img => !isVideoUrl(img));
        const inventoryVideos = (selectedProductDetail.images || []).filter(img => isVideoUrl(img));
        
        const cmsImages = productContentForSKU.flatMap(content => {
          const contentImages = content.images || [];
          return contentImages.filter(img => !isVideoUrl(img));
        });
        const cmsVideos = productContentForSKU.flatMap(content => {
          const contentImages = content.images || [];
          const contentVideos = content.videos || [];
          // Filter videos from images array and combine with videos array
          const videosFromImages = contentImages.filter(img => isVideoUrl(img));
          return [...contentVideos, ...videosFromImages];
        });
        
        const allImages: string[] = [
          ...inventoryImages,
          ...cmsImages
        ];
        const allVideos: string[] = [
          ...inventoryVideos,
          ...cmsVideos
        ];
        
        const currentContent = contentViewerTab === 'images' ? allImages : allVideos;
        
        const handleToggleSelection = (index: number) => {
          const itemKey = `${contentViewerTab}-${index}`;
          const newSelected = new Set(selectedContentItems);
          if (newSelected.has(itemKey)) {
            newSelected.delete(itemKey);
          } else {
            newSelected.add(itemKey);
          }
          setSelectedContentItems(newSelected);
        };

        const handleSelectAll = () => {
          const allKeys = currentContent.map((_, index) => `${contentViewerTab}-${index}`);
          if (selectedContentItems.size === currentContent.length) {
            setSelectedContentItems(new Set());
          } else {
            setSelectedContentItems(new Set(allKeys));
          }
        };

        const handleDownloadZip = async () => {
          if (selectedContentItems.size === 0) {
            alert('Please select items to download');
            return;
          }

          setIsDownloadingZip(true);
          try {
            const zip = new JSZip();
            const selectedIndices = Array.from(selectedContentItems)
              .map(key => {
                const [type, index] = key.split('-');
                return { type, index: parseInt(index) };
              })
              .filter(item => item.type === contentViewerTab);

            for (const { index } of selectedIndices) {
              const url = currentContent[index];
              if (url) {
                try {
                  const response = await fetch(url);
                  const blob = await response.blob();
                  const fileName = contentViewerTab === 'images' 
                    ? `image_${index + 1}.jpg` 
                    : `video_${index + 1}.mp4`;
                  zip.file(fileName, blob);
                } catch (error) {
                  console.error(`Error downloading ${url}:`, error);
                }
              }
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = `${selectedProductDetail.name}_${contentViewerTab}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            
            alert(`Successfully downloaded ${selectedIndices.length} ${contentViewerTab}`);
            setSelectedContentItems(new Set());
          } catch (error) {
            console.error('Error creating ZIP:', error);
            alert('Error creating ZIP file. Please try again.');
          } finally {
            setIsDownloadingZip(false);
          }
        };

        return (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" 
            onClick={() => {
              setShowContentViewer(false);
              setSelectedContentItems(new Set());
            }}
          >
            <div 
              className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] flex flex-col" 
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="sticky top-0 bg-gradient-to-r from-white to-gray-50 border-b border-gray-200 px-6 py-5 flex items-center justify-between z-10 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#4f0c1b]/10 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{selectedProductDetail.name}</h3>
                    <p className="text-xs text-gray-500 font-medium">Content Library</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowContentViewer(false);
                    setSelectedContentItems(new Set());
                  }}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200 bg-white px-6">
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setContentViewerTab('images');
                      setSelectedContentItems(new Set());
                    }}
                    className={`relative px-5 py-3 font-semibold text-sm transition-all duration-200 ${
                      contentViewerTab === 'images'
                        ? 'text-[#4f0c1b]'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>Images</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        contentViewerTab === 'images'
                          ? 'bg-[#4f0c1b]/10 text-[#4f0c1b]'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {allImages.length}
                      </span>
                    </div>
                    {contentViewerTab === 'images' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4f0c1b] rounded-t-full" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setContentViewerTab('videos');
                      setSelectedContentItems(new Set());
                    }}
                    className={`relative px-5 py-3 font-semibold text-sm transition-all duration-200 ${
                      contentViewerTab === 'videos'
                        ? 'text-[#4f0c1b]'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>Videos</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        contentViewerTab === 'videos'
                          ? 'bg-[#4f0c1b]/10 text-[#4f0c1b]'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {allVideos.length}
                      </span>
                    </div>
                    {contentViewerTab === 'videos' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4f0c1b] rounded-t-full" />
                    )}
                  </button>
                </div>
              </div>

              {/* Content Grid */}
              <div className="flex-1 overflow-y-auto p-6">
                {currentContent.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500">No {contentViewerTab} available</p>
                  </div>
                ) : (
                  <>
                    {/* Select All Button */}
                    <div className="mb-5 flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
                      <button
                        onClick={handleSelectAll}
                        className="flex items-center gap-2 text-sm font-semibold text-[#4f0c1b] hover:text-[#3d0a15] transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {selectedContentItems.size === currentContent.length ? 'Deselect All' : 'Select All'}
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Selected:</span>
                        <span className="px-2.5 py-1 bg-[#4f0c1b]/10 text-[#4f0c1b] text-sm font-bold rounded-full">
                          {selectedContentItems.size}
                        </span>
                        <span className="text-xs text-gray-400">/</span>
                        <span className="text-sm font-semibold text-gray-700">{currentContent.length}</span>
                      </div>
                    </div>

                    {/* Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {currentContent.map((url: string, index: number) => {
                        const itemKey = `${contentViewerTab}-${index}`;
                        const isSelected = selectedContentItems.has(itemKey);
                        
                        return (
                          <div
                            key={index}
                            className={`relative border-2 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 group ${
                              isSelected 
                                ? 'border-[#4f0c1b] ring-4 ring-[#4f0c1b]/20 shadow-lg scale-105' 
                                : 'border-gray-200 hover:border-[#4f0c1b]/50 hover:shadow-md'
                            }`}
                            onClick={() => handleToggleSelection(index)}
                          >
                            {/* Selection Checkbox */}
                            <div className="absolute top-3 right-3 z-10">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center shadow-lg transition-all ${
                                isSelected 
                                  ? 'bg-[#4f0c1b] scale-110' 
                                  : 'bg-white/90 group-hover:bg-white'
                              }`}>
                                {isSelected ? (
                                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <div className="w-3 h-3 border-2 border-gray-400 rounded-sm group-hover:border-[#4f0c1b] transition-colors" />
                                )}
                              </div>
                            </div>

                            {/* Content */}
                            {contentViewerTab === 'images' ? (
                              <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200">
                                <img
                                  src={url}
                                  alt={`Image ${index + 1}`}
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                />
                              </div>
                            ) : (
                              <div className="aspect-square bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center relative overflow-hidden">
                                <video
                                  src={url}
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300 pointer-events-none"
                                  controls={false}
                                  preload="metadata"
                                  muted
                                  playsInline
                                  onLoadedMetadata={(e) => {
                                    const videoEl = e.currentTarget;
                                    if (videoEl.duration > 1) {
                                      videoEl.currentTime = 1;
                                    } else if (videoEl.duration > 0) {
                                      videoEl.currentTime = videoEl.duration / 2;
                                    }
                                  }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors pointer-events-none">
                                  <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M8 5v14l11-7z" />
                                    </svg>
                                  </div>
                                </div>
                                
                                {/* Play Button in Bottom Right Corner */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedVideoUrl(url);
                                  }}
                                  className="absolute bottom-2 right-2 z-20 w-10 h-10 bg-[#4f0c1b] hover:bg-[#3d0a15] rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all duration-200 group/play"
                                  aria-label="Play video"
                                >
                                  <svg className="w-5 h-5 text-white ml-0.5 group-hover/play:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                </button>
                              </div>
                            )}
                            
                            {/* Index Badge */}
                            <div className="absolute bottom-2 left-2 z-10">
                              <span className="px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-xs font-semibold rounded-md">
                                #{index + 1}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Footer with Download Button */}
              {currentContent.length > 0 && (
                <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    {selectedContentItems.size} item{selectedContentItems.size !== 1 ? 's' : ''} selected
                  </span>
                  <button
                    onClick={handleDownloadZip}
                    disabled={selectedContentItems.size === 0 || isDownloadingZip}
                    className="flex items-center gap-2 px-4 py-2 bg-[#4f0c1b] text-white rounded-lg hover:bg-[#3d0a15] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {isDownloadingZip ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Creating ZIP...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Download as ZIP
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Collection Detail Modal */}
      {selectedCollectionDetail && (() => {
        // Helper function to detect if a URL is a video
        const isVideoUrl = (url: string): boolean => {
          const urlLower = url.toLowerCase();
          return !!(
            urlLower.includes('/videos/') || 
            urlLower.match(/\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv|3gp|mpg|mpeg)$/i) ||
            urlLower.includes('video/') ||
            urlLower.includes('contenttype=video') ||
            urlLower.match(/video\/mp4|video\/quicktime|video\/webm|video\/x-msvideo/i) ||
            (urlLower.includes('firebasestorage') && (
              urlLower.includes('.mov') || 
              urlLower.includes('.mp4') || 
              urlLower.includes('.webm')
            ))
          );
        };

        // Filter videos from images array
        const contentImages = selectedCollectionDetail.images || [];
        const contentVideos = selectedCollectionDetail.videos || [];
        const allImages = contentImages.filter(img => !isVideoUrl(img));
        const videosFromImages = contentImages.filter(img => isVideoUrl(img));
        const allVideos = [...contentVideos, ...videosFromImages];
        
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedCollectionDetail(null)}>
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
                <h3 className="text-xl font-semibold text-gray-900">{selectedCollectionDetail.title}</h3>
                <button
                  onClick={() => setSelectedCollectionDetail(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                {/* Images Gallery at Top - Max 4 visible + overflow indicator */}
                {allImages.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <h4 className="text-base font-semibold text-gray-900">Images</h4>
                      </div>
                      <span className="px-2.5 py-0.5 bg-[#4f0c1b]/10 text-[#4f0c1b] text-xs font-semibold rounded-full">
                        {allImages.length}
                      </span>
                    </div>
                    <div className="flex gap-3">
                      {allImages.slice(0, 4).map((img: string, index: number) => (
                        <div 
                          key={index} 
                          className="flex-shrink-0 w-24 h-24 bg-gray-100 rounded-xl overflow-hidden cursor-pointer hover:opacity-90 hover:scale-105 transition-all duration-200 border-2 border-gray-200 shadow-sm hover:shadow-md"
                        >
                          <img
                            src={img}
                            alt={`${selectedCollectionDetail.title} - Image ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                      {allImages.length > 4 && (
                        <div className="flex-shrink-0 w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center border-2 border-gray-300 shadow-sm">
                          <div className="text-center">
                            <span className="text-[#4f0c1b] font-bold text-xl block leading-tight">+</span>
                            <span className="text-[#4f0c1b] font-semibold text-sm block leading-tight">{allImages.length - 4}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Videos Gallery */}
                {allVideos.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <h4 className="text-base font-semibold text-gray-900">Videos</h4>
                      </div>
                      <span className="px-2.5 py-0.5 bg-[#4f0c1b]/10 text-[#4f0c1b] text-xs font-semibold rounded-full">
                        {allVideos.length}
                      </span>
                    </div>
                    <div className="flex gap-3">
                      {allVideos.slice(0, 4).map((video: string, index: number) => (
                        <div 
                          key={index} 
                          className="flex-shrink-0 w-24 h-24 bg-gray-100 rounded-xl overflow-hidden cursor-pointer hover:opacity-90 hover:scale-105 transition-all duration-200 border-2 border-gray-200 shadow-sm hover:shadow-md relative"
                          onClick={() => setSelectedVideoUrl(video)}
                        >
                          <video
                            src={video}
                            className="w-full h-full object-cover"
                            preload="metadata"
                            muted
                            playsInline
                            onLoadedMetadata={(e) => {
                              const videoEl = e.currentTarget;
                              if (videoEl.duration > 1) {
                                videoEl.currentTime = 1;
                              } else if (videoEl.duration > 0) {
                                videoEl.currentTime = videoEl.duration / 2;
                              }
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <div className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center">
                              <svg className="w-4 h-4 text-gray-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                          <div className="absolute top-1 left-1 px-1 py-0.5 bg-black/60 backdrop-blur-sm text-white text-[10px] rounded font-medium">
                            VIDEO
                          </div>
                        </div>
                      ))}
                      {allVideos.length > 4 && (
                        <div className="flex-shrink-0 w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center border-2 border-gray-300 shadow-sm">
                          <div className="text-center">
                            <span className="text-[#4f0c1b] font-bold text-xl block leading-tight">+</span>
                            <span className="text-[#4f0c1b] font-semibold text-sm block leading-tight">{allVideos.length - 4}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Content Information */}
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h4 className="text-base font-semibold text-gray-900">Content Information</h4>
                      </div>
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 space-y-4 border border-gray-200 shadow-sm">
                        <div className="flex items-start justify-between pb-3 border-b border-gray-200">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</span>
                          <p className="text-sm font-semibold text-gray-900 text-right">{selectedCollectionDetail.title}</p>
                        </div>
                        <div className="flex items-start justify-between pb-3 border-b border-gray-200">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</span>
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                            {t('cms.collection')}
                          </span>
                        </div>
                        <div className="flex items-start justify-between pb-3 border-b border-gray-200">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            selectedCollectionDetail.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                            selectedCollectionDetail.status === 'submitted' ? 'bg-amber-100 text-amber-800' :
                            selectedCollectionDetail.status === 'approved' ? 'bg-green-100 text-green-800' :
                            selectedCollectionDetail.status === 'published' ? 'bg-purple-100 text-purple-800' :
                            selectedCollectionDetail.status === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {selectedCollectionDetail.status}
                          </span>
                        </div>
                        <div className="flex items-start justify-between pb-3 border-b border-gray-200">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Language</span>
                          <p className="text-sm font-semibold text-gray-900 text-right">{selectedCollectionDetail.language.toUpperCase()}</p>
                        </div>
                        <div className="flex items-start justify-between pb-3 border-b border-gray-200">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</span>
                          <p className="text-sm font-semibold text-gray-900 text-right">{selectedCollectionDetail.category || 'N/A'}</p>
                        </div>
                        <div className="flex items-start justify-between pb-3 border-b border-gray-200">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Author</span>
                          <p className="text-sm font-semibold text-gray-900 text-right">{selectedCollectionDetail.authorName}</p>
                        </div>
                        <div className="pt-1">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Description</span>
                          <p className="text-sm text-gray-700 leading-relaxed">{selectedCollectionDetail.description || 'No description available'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      <h4 className="text-base font-semibold text-gray-900">Tags & Hashtags</h4>
                    </div>
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 space-y-4 border border-gray-200 shadow-sm">
                      {selectedCollectionDetail.hashtags.length > 0 && (
                        <div>
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Hashtags</span>
                          <div className="flex flex-wrap gap-2">
                            {selectedCollectionDetail.hashtags.map((tag, idx) => (
                              <span key={idx} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedCollectionDetail.tags.length > 0 && (
                        <div>
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Tags</span>
                          <div className="flex flex-wrap gap-2">
                            {selectedCollectionDetail.tags.map((tag, idx) => (
                              <span key={idx} className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedCollectionDetail.hashtags.length === 0 && selectedCollectionDetail.tags.length === 0 && (
                        <p className="text-sm text-gray-500">No tags or hashtags</p>
                      )}
                    </div>

                    {/* Linked Products */}
                    {selectedCollectionDetail.linkedProductIds.length > 0 && (
                      <div className="mt-6">
                        <div className="flex items-center gap-2 mb-4">
                          <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                          <h4 className="text-base font-semibold text-gray-900">Linked Products ({selectedCollectionDetail.linkedProductIds.length})</h4>
                        </div>
                        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 space-y-2 border border-gray-200 shadow-sm">
                          <div className="flex flex-wrap gap-2">
                            {selectedCollectionDetail.linkedProductIds.map((sku, idx) => (
                              <span key={idx} className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded">
                                {sku}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-4 col-span-2">
                    <button
                      onClick={() => {
                        handleToggleCollection(selectedCollectionDetail.id);
                        setSelectedCollectionDetail(null);
                      }}
                      className="w-full px-4 py-2 border border-[#4f0c1b] text-[#4f0c1b] rounded-lg hover:bg-[#4f0c1b]/10 transition-colors font-medium"
                    >
                      {selectedCollections.has(selectedCollectionDetail.id) ? 'Deselect for Download' : 'Select for Download'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* General Content Detail Modal */}
      {selectedGeneralDetail && (() => {
        // Helper function to detect if a URL is a video
        const isVideoUrl = (url: string): boolean => {
          const urlLower = url.toLowerCase();
          return !!(
            urlLower.includes('/videos/') || 
            urlLower.match(/\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv|3gp|mpg|mpeg)$/i) ||
            urlLower.includes('video/') ||
            urlLower.includes('contenttype=video') ||
            urlLower.match(/video\/mp4|video\/quicktime|video\/webm|video\/x-msvideo/i) ||
            (urlLower.includes('firebasestorage') && (
              urlLower.includes('.mov') || 
              urlLower.includes('.mp4') || 
              urlLower.includes('.webm')
            ))
          );
        };

        // Filter videos from images array
        const contentImages = selectedGeneralDetail.images || [];
        const contentVideos = selectedGeneralDetail.videos || [];
        const allImages = contentImages.filter(img => !isVideoUrl(img));
        const videosFromImages = contentImages.filter(img => isVideoUrl(img));
        const allVideos = [...contentVideos, ...videosFromImages];
        
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedGeneralDetail(null)}>
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
                <h3 className="text-xl font-semibold text-gray-900">{selectedGeneralDetail.title}</h3>
                <button
                  onClick={() => setSelectedGeneralDetail(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                {/* Images Gallery at Top - Max 4 visible + overflow indicator */}
                {allImages.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <h4 className="text-base font-semibold text-gray-900">Images</h4>
                      </div>
                      <span className="px-2.5 py-0.5 bg-[#4f0c1b]/10 text-[#4f0c1b] text-xs font-semibold rounded-full">
                        {allImages.length}
                      </span>
                    </div>
                    <div className="flex gap-3">
                      {allImages.slice(0, 4).map((img: string, index: number) => (
                        <div 
                          key={index} 
                          className="flex-shrink-0 w-24 h-24 bg-gray-100 rounded-xl overflow-hidden cursor-pointer hover:opacity-90 hover:scale-105 transition-all duration-200 border-2 border-gray-200 shadow-sm hover:shadow-md"
                        >
                          <img
                            src={img}
                            alt={`${selectedGeneralDetail.title} - Image ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                      {allImages.length > 4 && (
                        <div className="flex-shrink-0 w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center border-2 border-gray-300 shadow-sm">
                          <div className="text-center">
                            <span className="text-[#4f0c1b] font-bold text-xl block leading-tight">+</span>
                            <span className="text-[#4f0c1b] font-semibold text-sm block leading-tight">{allImages.length - 4}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Videos Gallery */}
                {allVideos.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <h4 className="text-base font-semibold text-gray-900">Videos</h4>
                      </div>
                      <span className="px-2.5 py-0.5 bg-[#4f0c1b]/10 text-[#4f0c1b] text-xs font-semibold rounded-full">
                        {allVideos.length}
                      </span>
                    </div>
                    <div className="flex gap-3">
                      {allVideos.slice(0, 4).map((video: string, index: number) => (
                        <div 
                          key={index} 
                          className="flex-shrink-0 w-24 h-24 bg-gray-100 rounded-xl overflow-hidden cursor-pointer hover:opacity-90 hover:scale-105 transition-all duration-200 border-2 border-gray-200 shadow-sm hover:shadow-md relative"
                          onClick={() => setSelectedVideoUrl(video)}
                        >
                          <video
                            src={video}
                            className="w-full h-full object-cover"
                            preload="metadata"
                            muted
                            playsInline
                            onLoadedMetadata={(e) => {
                              const videoEl = e.currentTarget;
                              if (videoEl.duration > 1) {
                                videoEl.currentTime = 1;
                              } else if (videoEl.duration > 0) {
                                videoEl.currentTime = videoEl.duration / 2;
                              }
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <div className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center">
                              <svg className="w-4 h-4 text-gray-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                          <div className="absolute top-1 left-1 px-1 py-0.5 bg-black/60 backdrop-blur-sm text-white text-[10px] rounded font-medium">
                            VIDEO
                          </div>
                        </div>
                      ))}
                      {allVideos.length > 4 && (
                        <div className="flex-shrink-0 w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center border-2 border-gray-300 shadow-sm">
                          <div className="text-center">
                            <span className="text-[#4f0c1b] font-bold text-xl block leading-tight">+</span>
                            <span className="text-[#4f0c1b] font-semibold text-sm block leading-tight">{allVideos.length - 4}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Content Information */}
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h4 className="text-base font-semibold text-gray-900">Content Information</h4>
                      </div>
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 space-y-4 border border-gray-200 shadow-sm">
                        <div className="flex items-start justify-between pb-3 border-b border-gray-200">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</span>
                          <p className="text-sm font-semibold text-gray-900 text-right">{selectedGeneralDetail.title}</p>
                        </div>
                        <div className="flex items-start justify-between pb-3 border-b border-gray-200">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</span>
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                            {t('cms.general')}
                          </span>
                        </div>
                        <div className="flex items-start justify-between pb-3 border-b border-gray-200">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            selectedGeneralDetail.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                            selectedGeneralDetail.status === 'submitted' ? 'bg-amber-100 text-amber-800' :
                            selectedGeneralDetail.status === 'approved' ? 'bg-green-100 text-green-800' :
                            selectedGeneralDetail.status === 'published' ? 'bg-purple-100 text-purple-800' :
                            selectedGeneralDetail.status === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {selectedGeneralDetail.status}
                          </span>
                        </div>
                        <div className="flex items-start justify-between pb-3 border-b border-gray-200">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Language</span>
                          <p className="text-sm font-semibold text-gray-900 text-right">{selectedGeneralDetail.language.toUpperCase()}</p>
                        </div>
                        <div className="flex items-start justify-between pb-3 border-b border-gray-200">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</span>
                          <p className="text-sm font-semibold text-gray-900 text-right">{selectedGeneralDetail.category || 'N/A'}</p>
                        </div>
                        <div className="flex items-start justify-between pb-3 border-b border-gray-200">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Author</span>
                          <p className="text-sm font-semibold text-gray-900 text-right">{selectedGeneralDetail.authorName}</p>
                        </div>
                        <div className="pt-1">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Description</span>
                          <p className="text-sm text-gray-700 leading-relaxed">{selectedGeneralDetail.description || 'No description available'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      <h4 className="text-base font-semibold text-gray-900">Tags & Hashtags</h4>
                    </div>
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 space-y-4 border border-gray-200 shadow-sm">
                      {selectedGeneralDetail.hashtags.length > 0 && (
                        <div>
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Hashtags</span>
                          <div className="flex flex-wrap gap-2">
                            {selectedGeneralDetail.hashtags.map((tag, idx) => (
                              <span key={idx} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedGeneralDetail.tags.length > 0 && (
                        <div>
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Tags</span>
                          <div className="flex flex-wrap gap-2">
                            {selectedGeneralDetail.tags.map((tag, idx) => (
                              <span key={idx} className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedGeneralDetail.hashtags.length === 0 && selectedGeneralDetail.tags.length === 0 && (
                        <p className="text-sm text-gray-500">No tags or hashtags</p>
                      )}
                    </div>

                    {/* Linked Products */}
                    {selectedGeneralDetail.linkedProductIds.length > 0 && (
                      <div className="mt-6">
                        <div className="flex items-center gap-2 mb-4">
                          <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                          <h4 className="text-base font-semibold text-gray-900">Linked Products ({selectedGeneralDetail.linkedProductIds.length})</h4>
                        </div>
                        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 space-y-2 border border-gray-200 shadow-sm">
                          <div className="flex flex-wrap gap-2">
                            {selectedGeneralDetail.linkedProductIds.map((sku, idx) => (
                              <span key={idx} className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded">
                                {sku}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-4 col-span-2">
                    <button
                      onClick={() => {
                        handleToggleGeneral(selectedGeneralDetail.id);
                        setSelectedGeneralDetail(null);
                      }}
                      className="w-full px-4 py-2 border border-[#4f0c1b] text-[#4f0c1b] rounded-lg hover:bg-[#4f0c1b]/10 transition-colors font-medium"
                    >
                      {selectedGeneral.has(selectedGeneralDetail.id) ? 'Deselect for Download' : 'Select for Download'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Video Player Modal */}
      {selectedVideoUrl && (
        <VideoPlayerModal 
          videoUrl={selectedVideoUrl}
          onClose={() => setSelectedVideoUrl(null)}
        />
      )}
    </div>
  );
}
