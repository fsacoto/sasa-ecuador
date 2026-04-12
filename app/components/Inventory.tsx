'use client';

import { useState, useEffect, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { InventoryItem } from '../types';
import InventoryDetailPanel from './InventoryDetailPanel';
import ProductCatalogModal from './ProductCatalogModal';
import InventoryTransferModal from './InventoryTransferModal';
import { generateUniqueSKU, collectUsedSkus } from '../utils/skuGenerator';
import {
  syncInventoryToOrders,
  reconcileVerificationIssuesForItem,
} from '../utils/syncUpdates';
import { handleMultipleImageUpload, validateImageFile } from '../utils/imageUpload';
import { generateBarcodeFromSKU, isValidBarcodeInput } from '../utils/barcodeGenerator';
import { useTranslation } from '../context/TranslationContext';
import ConfirmDialog from './ui/ConfirmDialog';
import { deleteMediaFile } from '../services/inventoryMediaService';

export default function Inventory() {
  const { inventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, purchaseOrders, updatePurchaseOrder } = useInventory();
  const { user, hasPermission } = useAuth();
  const { t } = useTranslation();
  
  // For sales role, only show Ecuador inventory in read-only mode
  const isSalesRole = user?.role === 'sales';
  const isReadOnly = isSalesRole || hasPermission('inventory.view.readonly');
  
  // Filter inventory for sales role to show only Ecuador stock
  const filteredInventory = isSalesRole 
    ? inventory.filter(item => item.ecuadorStock > 0) 
    : inventory;
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [verificationIssuesModalItem, setVerificationIssuesModalItem] = useState<InventoryItem | null>(null);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);
  const [categoryMode, setCategoryMode] = useState<'select' | 'new'>('select');
  const [lineMode, setLineMode] = useState<'select' | 'new'>('select');
  const [mediaDeleteConfirmOpen, setMediaDeleteConfirmOpen] = useState(false);
  const [mediaToDelete, setMediaToDelete] = useState<{ index: number; url: string } | null>(null);
  
  // Sorting and filtering state
  const [sortField, setSortField] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterLine, setFilterLine] = useState<string>('all');
  const [filterCountry, setFilterCountry] = useState<string>('all');
  const [showProblemsOnly, setShowProblemsOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Load filters from sessionStorage when component mounts (from dashboard navigation)
  useEffect(() => {
    const storedFilters = sessionStorage.getItem('dashboardFilters_inventory');
    if (storedFilters) {
      try {
        const filters = JSON.parse(storedFilters);
        if (filters.filterCategory) {
          setFilterCategory(filters.filterCategory);
        }
        if (filters.searchQuery) {
          setSearchQuery(filters.searchQuery);
        }
        if (filters.filterLowStock) {
          // Low stock filter: show items with total stock < 10
          // This will be handled in the filter logic
        }
        // Clear the stored filters after applying
        sessionStorage.removeItem('dashboardFilters_inventory');
      } catch (e) {
        console.error('Error parsing dashboard filters:', e);
      }
    }
  }, []);
  
  // Search dropdown state
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  
  // Column visibility state
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // View mode state
  const [viewMode, setViewMode] = useState<'grid' | 'gallery'>('grid');
  const [showViewDropdown, setShowViewDropdown] = useState(false);
  const viewDropdownRef = useRef<HTMLDivElement>(null);
  
  // Gallery view state
  const [galleryFields, setGalleryFields] = useState<Set<string>>(new Set(['name', 'sku', 'category', 'line']));
  const [showGalleryFieldsDropdown, setShowGalleryFieldsDropdown] = useState(false);
  const galleryFieldsDropdownRef = useRef<HTMLDivElement>(null);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  
  
  // Ref to track if we're currently editing an item (prevents SKU auto-generation)
  const isEditingRef = useRef(false);
  
  // Predefined category options
  const predefinedCategories = ['Necklace', 'Ring', 'Bracelet', 'Set', 'Anklet', 'Earring'];
  
  // Predefined line options
  const predefinedLines = ['Gold Plated', 'Gold Filled', 'Sterling Silver'];
  
  // Get unique categories and lines from existing inventory (excluding predefined ones)
  const existingCategories = [...new Set(inventory
    .map(item => item.category)
    .filter(cat => cat && !cat.includes('NEEDS REVIEW') && !predefinedCategories.includes(cat))
  )].sort();
  
  const existingLines = [...new Set(inventory
    .map(item => item.line)
    .filter(line => line && line.trim() !== '' && !predefinedLines.includes(line))
  )].sort();

  // Get visible columns for inventory table
  const getVisibleColumns = () => {
    const allColumns = [
      { key: 'name', label: t('inventory.name') },
      { key: 'sku', label: t('inventory.sku') },
      { key: 'barcode', label: t('inventory.barcode') },
      { key: 'category', label: t('inventory.category') },
      { key: 'line', label: t('inventory.line') },
      { key: 'ecuadorStock', label: t('inventory.ecuadorStock') },
      { key: 'usaStock', label: t('inventory.usaStock') },
      { key: 'totalStock', label: t('inventory.totalStock') },
      { key: 'actions', label: t('inventory.actions') }
    ];
    return allColumns;
  };

  // Get count of visible columns (for colSpan calculation)
  const getVisibleColumnCount = () => {
    return getVisibleColumns().filter(col => !hiddenColumns.has(col.key)).length;
  };

  // Get available fields for gallery view
  const getGalleryFields = () => {
    const allFields = [
      { key: 'name', label: 'Name' },
      { key: 'sku', label: 'SKU' },
      { key: 'category', label: 'Category' },
      { key: 'line', label: 'Line' },
      { key: 'ecuadorStock', label: 'Ecuador Stock' },
      { key: 'usaStock', label: 'USA Stock' },
      { key: 'totalStock', label: 'Total Stock' },
      { key: 'unitCost', label: 'Unit Cost' },
      { key: 'totalValue', label: 'Total Value' }
    ];
    return allFields;
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showColumnDropdown && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowColumnDropdown(false);
      }
      if (showViewDropdown && viewDropdownRef.current && !viewDropdownRef.current.contains(event.target as Node)) {
        setShowViewDropdown(false);
      }
      if (showGalleryFieldsDropdown && galleryFieldsDropdownRef.current && !galleryFieldsDropdownRef.current.contains(event.target as Node)) {
        setShowGalleryFieldsDropdown(false);
      }
      if (showSearchDropdown && searchDropdownRef.current && !searchDropdownRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColumnDropdown, showViewDropdown, showGalleryFieldsDropdown, showSearchDropdown]);

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

  const [supplierSkuStable, setSupplierSkuStable] = useState('');
  const supplierDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (supplierDebounceRef.current) clearTimeout(supplierDebounceRef.current);
    supplierDebounceRef.current = setTimeout(() => {
      setSupplierSkuStable((formData.supplierSKU || '').trim());
    }, 450);
    return () => {
      if (supplierDebounceRef.current) clearTimeout(supplierDebounceRef.current);
    };
  }, [formData.supplierSKU]);

  const generateSkuIfNeeded = () => {
    const sup = (formData.supplierSKU || '').trim();
    if (
      !editingItem &&
      !skuManuallyEdited &&
      formData.category &&
      formData.line &&
      sup &&
      (!formData.sku || formData.sku.trim() === '')
    ) {
      const pool = collectUsedSkus(inventory, purchaseOrders).filter((s) => s !== formData.sku);
      const newSku = generateUniqueSKU(formData.category, formData.line, sup, pool);
      setFormData((prev) => ({ ...prev, sku: newSku }));
    }
  };

  useEffect(() => {
    if (editingItem || skuManuallyEdited || !formData.category || !formData.line) {
      return;
    }
    if (!supplierSkuStable) {
      setFormData((prev) => (prev.sku ? { ...prev, sku: '' } : prev));
      return;
    }
    const pool = collectUsedSkus(inventory, purchaseOrders);
    const newSku = generateUniqueSKU(
      formData.category,
      formData.line,
      supplierSkuStable,
      pool
    );
    setFormData((prev) => ({ ...prev, sku: newSku }));
  }, [
    supplierSkuStable,
    formData.category,
    formData.line,
    editingItem,
    inventory,
    purchaseOrders,
    skuManuallyEdited,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      const verificationIssues = reconcileVerificationIssuesForItem(
        { linkedPurchaseOrders: formData.linkedPurchaseOrders },
        purchaseOrders
      );
      const payload = { ...formData, verificationIssues };
      const updatedItem = { ...editingItem, ...payload };
      updateInventoryItem(editingItem.id, payload);

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
    // Reset editing ref
    isEditingRef.current = false;
  };

  const handleEdit = (item: InventoryItem) => {
    // Set editing ref IMMEDIATELY to prevent auto-generation
    isEditingRef.current = true;
    
    // Set editing state first to prevent auto-generation
    setEditingItem(item);
    setSkuManuallyEdited(true); // Don't auto-generate when editing
    
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
    
    setIsFormOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const skuTrim = formData.sku?.trim();
    if (!skuTrim) {
      alert(t('inventory.skuRequiredForImageUpload'));
      e.target.value = '';
      return;
    }

    // Validate all files first
    for (let i = 0; i < files.length; i++) {
      const validation = validateImageFile(files[i]);
      if (!validation.valid) {
        alert(`${files[i].name}: ${validation.error}`);
        return;
      }
    }

    try {
      const newImages = await handleMultipleImageUpload(files, 'images/inventory/', undefined, {
        sku: skuTrim,
      });
      setFormData(prev => ({ ...prev, images: [...prev.images, ...newImages] }));
    } catch (error) {
      console.error('Error uploading images:', error);
      alert(t('inventory.failedToUploadImages'));
    }
    
    // Reset input
    e.target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    const imageUrl = formData.images[index];
    
    // Check if user is admin and has permission to delete media
    const isAdmin = user?.role === 'admin' && hasPermission('media.delete');
    
    if (isAdmin) {
      // Admin users: show confirmation dialog before deleting from storage
      setMediaToDelete({ index, url: imageUrl });
      setMediaDeleteConfirmOpen(true);
    } else {
      // Non-admin users: just remove from form (doesn't delete from storage)
      setFormData(prev => ({
        ...prev,
        images: prev.images.filter((_, i) => i !== index)
      }));
    }
  };

  const handleConfirmMediaDelete = async () => {
    if (!mediaToDelete) return;

    try {
      const { index, url } = mediaToDelete;
      
      // Delete from Firebase Storage
      await deleteMediaFile(url);
      
      // Remove from form data
      setFormData(prev => ({
        ...prev,
        images: prev.images.filter((_, i) => i !== index)
      }));
      
      // Close dialog and reset state
      setMediaDeleteConfirmOpen(false);
      setMediaToDelete(null);
    } catch (error) {
      console.error('Error deleting media file:', error);
      alert(t('inventory.failedToDeleteMedia') || 'Failed to delete media file. Please try again.');
      setMediaDeleteConfirmOpen(false);
      setMediaToDelete(null);
    }
  };

  const handleCancelMediaDelete = () => {
    setMediaDeleteConfirmOpen(false);
    setMediaToDelete(null);
  };

  const handleSkuChange = (newSku: string) => {
    setFormData({ ...formData, sku: newSku });
    setSkuManuallyEdited(true);
  };

  const handleRegenerateSku = () => {
    const sup = (formData.supplierSKU || '').trim();
    if (!formData.category || !formData.line || !sup) {
      alert(
        t('inventory.skuNeedsCategoryLineSupplier') ||
          'Set category, material (line), and supplier SKU to generate an internal SKU.'
      );
      return;
    }
    const pool = collectUsedSkus(inventory, purchaseOrders).filter((s) => s !== formData.sku);
    const newSku = generateUniqueSKU(formData.category, formData.line, sup, pool);
    setFormData({ ...formData, sku: newSku });
    setSkuManuallyEdited(false);
  };

  const handlePurchaseOrderToggle = (orderId: string) => {
    const linkedOrders = formData.linkedPurchaseOrders.includes(orderId)
      ? formData.linkedPurchaseOrders.filter(id => id !== orderId)
      : [...formData.linkedPurchaseOrders, orderId];
    setFormData({ ...formData, linkedPurchaseOrders: linkedOrders });
  };

  /** Prefer linked verified POs (source of truth), not only cached verificationIssues on the item. */
  const getLiveVerificationIssues = (item: InventoryItem) =>
    reconcileVerificationIssuesForItem(
      { linkedPurchaseOrders: item.linkedPurchaseOrders ?? [] },
      purchaseOrders
    );

  const getTotalProblemQty = (item: InventoryItem) =>
    getLiveVerificationIssues(item).reduce((sum, v) => sum + v.quantityProblem, 0);

  const inventoryWithProblemsCount = filteredInventory.filter(
    (item) => getTotalProblemQty(item) > 0
  ).length;

  const getTotalStock = (item: InventoryItem) => {
    return item.ecuadorStock + item.usaStock;
  };

  const handleGenerateBarcode = (item: InventoryItem) => {
    if (!isValidBarcodeInput(item.sku)) {
      alert(t('inventory.invalidSkuFormat'));
      return;
    }

    try {
      const barcodeImage = generateBarcodeFromSKU(item.sku);
      void updateInventoryItem(item.id, { barcode: barcodeImage });
    } catch (error) {
      alert(t('inventory.barcodeGenerationFailed'));
      console.error('Barcode generation error:', error);
    }
  };

  // Sorting and filtering logic
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedInventory = filteredInventory
    .filter(item => {
      // Since we now use ACTIONS instead of filtering:
      // - Items are only created when purchase orders are verified
      // - Items are removed when purchase orders become non-verified
      // This filter is just a safety net to catch any edge cases
      
      // Show all items - the sync actions ensure only verified items exist
      // But keep a safety check for items with linked orders that aren't verified
      const linkedIds = item.linkedPurchaseOrders ?? [];
      if (linkedIds.length > 0) {
        const hasVerifiedOrder = linkedIds.some((orderId) => {
          const order = purchaseOrders.find((o) => o.id === orderId);
          return order && order.status === 'Verified';
        });
        // Safety: Hide items with linked orders but none verified (shouldn't happen with actions)
        if (!hasVerifiedOrder) {
          return false;
        }
      }
      
      // Show all other items (standalone items or items with verified orders)
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          item.name.toLowerCase().includes(query) ||
          item.sku.toLowerCase().includes(query) ||
          item.supplierSKU.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      
      // Low stock filter (from dashboard)
      const storedFilters = sessionStorage.getItem('dashboardFilters_inventory');
      if (storedFilters) {
        try {
          const filters = JSON.parse(storedFilters);
          if (filters.filterLowStock) {
            const totalStock = item.ecuadorStock + item.usaStock;
            if (totalStock > 2) return false;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
      
      // Category filter
      if (filterCategory !== 'all' && item.category !== filterCategory) {
        return false;
      }
      
      // Line filter
      if (filterLine !== 'all' && item.line !== filterLine) {
        return false;
      }
      
      // Country filter
      if (filterCountry !== 'all') {
        if (filterCountry === 'ecuador' && item.ecuadorStock === 0) {
          return false;
        }
        if (filterCountry === 'usa' && item.usaStock === 0) {
          return false;
        }
        if (filterCountry === 'both' && (item.ecuadorStock === 0 || item.usaStock === 0)) {
          return false;
        }
      }

      if (showProblemsOnly && getTotalProblemQty(item) === 0) {
        return false;
      }
      
      return true;
    })
    .sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;
      
      switch (sortField) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'sku':
          aValue = a.sku.toLowerCase();
          bValue = b.sku.toLowerCase();
          break;
        case 'category':
          aValue = a.category.toLowerCase();
          bValue = b.category.toLowerCase();
          break;
        case 'line':
          aValue = a.line.toLowerCase();
          bValue = b.line.toLowerCase();
          break;
        case 'ecuadorStock':
          aValue = a.ecuadorStock;
          bValue = b.ecuadorStock;
          break;
        case 'usaStock':
          aValue = a.usaStock;
          bValue = b.usaStock;
          break;
        case 'totalStock':
          aValue = getTotalStock(a);
          bValue = getTotalStock(b);
          break;
        default:
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
      }
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

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

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">{t('inventory.title')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('inventory.subtitle')}</p>
        </div>
        <div className="flex gap-3">
          {!isReadOnly && (
            <button
              onClick={() => setIsTransferModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm"
            >
              <svg className="w-4 h-4 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span className="text-sm font-medium text-gray-700">{t('inventory.transfer.openMove')}</span>
            </button>
          )}
          <button
            onClick={() => setIsCatalogModalOpen(true)}
            disabled={inventory.length === 0}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">{t('inventory.createCatalog')}</span>
          </button>
          
          {!isReadOnly && (
            <button
              onClick={() => {
                resetForm();
                setIsFormOpen(true);
              }}
              className="flex items-center gap-2 px-3 py-2 bg-[#4f0c1b] hover:bg-[#3d0a15] text-white rounded-lg hover:shadow-md transition-all duration-200 text-sm shadow-sm"
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="text-sm font-medium text-white">{t('inventory.addItem')}</span>
            </button>
          )}
        </div>
      </div>

      {/* View Controls */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {/* View Mode Toggle */}
        <div className="relative">
          <button
            onClick={() => setShowViewDropdown(!showViewDropdown)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {viewMode === 'grid' ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              )}
            </svg>
            <span className="text-sm font-medium text-gray-700">
              {viewMode === 'grid' ? t('inventory.gridView') : t('inventory.galleryView')}
            </span>
          </button>
          
          {showViewDropdown && (
            <div ref={viewDropdownRef} className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-10">
              <div className="p-2">
                <button
                  onClick={() => {
                    setViewMode('grid');
                    setShowViewDropdown(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    viewMode === 'grid' ? 'bg-[#4f0c1b] text-white' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  {t('inventory.gridView')}
                </button>
                <button
                  onClick={() => {
                    setViewMode('gallery');
                    setShowViewDropdown(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    viewMode === 'gallery' ? 'bg-[#4f0c1b] text-white' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                  </svg>
                  {t('inventory.galleryView')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Gallery Fields Selection (only show in gallery view) */}
        {viewMode === 'gallery' && (
          <div className="relative">
            <button
              onClick={() => setShowGalleryFieldsDropdown(!showGalleryFieldsDropdown)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">Fields</span>
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showGalleryFieldsDropdown && (
              <div ref={galleryFieldsDropdownRef} className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-10">
                <div className="p-4">
                  <div className="text-sm font-medium text-gray-700 mb-3">Gallery Fields</div>
                  <div className="grid grid-cols-2 gap-3">
                    {getGalleryFields().map(field => (
                      <div key={field.key} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{field.label}</span>
                        <button
                          onClick={() => {
                            if (galleryFields.has(field.key)) {
                              setGalleryFields(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(field.key);
                                return newSet;
                              });
                            } else {
                              setGalleryFields(prev => new Set([...prev, field.key]));
                            }
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:ring-offset-2 ${
                            galleryFields.has(field.key) ? 'bg-[#4f0c1b]' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              galleryFields.has(field.key) ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowProblemsOnly((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 border rounded-lg hover:shadow-md transition-all duration-200 text-sm ${
            showProblemsOnly
              ? 'border-amber-500 bg-amber-50 text-amber-950 ring-1 ring-amber-400'
              : 'border-gray-300 hover:bg-gray-50 text-gray-700'
          }`}
          title={t('inventory.showProblemsOnlyHint')}
        >
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-sm font-medium whitespace-nowrap">{t('inventory.showProblemsOnly')}</span>
          {inventoryWithProblemsCount > 0 && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full font-bold tabular-nums ${
                showProblemsOnly ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-900'
              }`}
            >
              {inventoryWithProblemsCount}
            </span>
          )}
        </button>

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
            <span className="text-sm font-medium">{t('inventory.filters')}</span>
            {(filterCategory !== 'all' || filterLine !== 'all' || filterCountry !== 'all') && (
              <span className="bg-red-100 text-red-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                {[filterCategory !== 'all', filterLine !== 'all', filterCountry !== 'all'].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {/* Column Visibility Control (only show in grid view) */}
        {viewMode === 'grid' && (
          <div className="relative">
            <button
              onClick={() => setShowColumnDropdown(!showColumnDropdown)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm"
            >
              <svg className={`w-4 h-4 ${hiddenColumns.size > 0 ? 'text-gray-400' : 'text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">{t('inventory.hideFields')}</span>
              {hiddenColumns.size > 0 && (
                <span className="bg-red-100 text-red-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                  {hiddenColumns.size}
                </span>
              )}
            </button>
            
            {showColumnDropdown && (
              <div ref={dropdownRef} className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-10">
                <div className="p-4">
                  <div className="text-sm font-medium text-gray-700 mb-3">{t('inventory.columnVisibility')}</div>
                  <div className="grid grid-cols-2 gap-3">
                    {getVisibleColumns().map(column => (
                      <div key={column.key} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{column.label}</span>
                        <button
                          onClick={() => {
                            if (hiddenColumns.has(column.key)) {
                              setHiddenColumns(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(column.key);
                                return newSet;
                              });
                            } else {
                              setHiddenColumns(prev => new Set([...prev, column.key]));
                            }
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:ring-offset-2 ${
                            hiddenColumns.has(column.key) ? 'bg-gray-300' : 'bg-[#4f0c1b]'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              hiddenColumns.has(column.key) ? 'translate-x-1' : 'translate-x-6'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search Button */}
        <div className="relative">
          <button
            onClick={() => setShowSearchDropdown(!showSearchDropdown)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          
          {showSearchDropdown && (
            <div ref={searchDropdownRef} className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-10">
              <div className="p-4">
                <div className="text-sm font-medium text-gray-700 mb-3">{t('inventory.search')}</div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder={t('inventory.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                  <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Expandable Filters */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
          <div className="border-t border-gray-200 p-4 bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Category Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('inventory.category')}</label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent text-sm bg-white"
                >
                  <option value="all">{t('inventory.allCategories')}</option>
                  {predefinedCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  {existingCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              
              {/* Line Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('inventory.line')}</label>
                <select
                  value={filterLine}
                  onChange={(e) => setFilterLine(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent text-sm bg-white"
                >
                  <option value="all">{t('inventory.allLines')}</option>
                  {predefinedLines.map(line => (
                    <option key={line} value={line}>{line}</option>
                  ))}
                  {existingLines.map(line => (
                    <option key={line} value={line}>{line}</option>
                  ))}
                </select>
              </div>

              {/* Country Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Country</label>
                <select
                  value={filterCountry}
                  onChange={(e) => setFilterCountry(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent text-sm bg-white"
                >
                  <option value="all">All Countries</option>
                  <option value="ecuador">Ecuador Only</option>
                  <option value="usa">USA Only</option>
                  <option value="both">Both Countries</option>
                </select>
              </div>
            </div>
            
            {/* Clear filters button */}
            {(searchQuery ||
              filterCategory !== 'all' ||
              filterLine !== 'all' ||
              filterCountry !== 'all' ||
              showProblemsOnly) && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setFilterCategory('all');
                    setFilterLine('all');
                    setFilterCountry('all');
                    setShowProblemsOnly(false);
                  }}
                  className="text-[#4f0c1b] hover:text-[#3d0a15] font-medium text-sm"
                >
                  {t('inventory.clearAllFilters')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Warning Banner for Items Needing Review */}
      {inventory.some(item => item.category.includes('NEEDS REVIEW')) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h3 className="text-sm font-semibold text-amber-900">{t('inventory.itemsNeedReview')}</h3>
            <p className="text-sm text-amber-700 mt-1">
              {t('inventory.itemsNeedReviewMessage').replace('{count}', inventory.filter(item => item.category.includes('NEEDS REVIEW')).length.toString())}
              {t('inventory.clickToEdit')}
            </p>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 duration-300">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingItem ? t('inventory.editInventoryItem') : t('inventory.addNewInventoryItem')}
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
                <label className="block text-sm font-medium mb-1 text-gray-700">{t('inventory.nameRequired')}</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">{t('inventory.description')}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">{t('inventory.categoryRequired')}</label>
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
                            // Generate SKU after category change (only for new items)
                            setTimeout(() => generateSkuIfNeeded(), 0);
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                      >
                        <option value="">{t('inventory.selectCategory')}</option>
                        {predefinedCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                        {existingCategories.length > 0 && (
                          <>
                            <optgroup label={t('inventory.otherCategories')}>
                              {existingCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </optgroup>
                          </>
                        )}
                        <option value="__new__">{t('inventory.addNewCategory')}</option>
                      </select>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={formData.category}
                        onChange={(e) => {
                          setFormData({ ...formData, category: e.target.value });
                          // Generate SKU after category change (only for new items)
                          setTimeout(() => generateSkuIfNeeded(), 0);
                        }}
                        placeholder={t('inventory.enterNewCategory')}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setCategoryMode('select')}
                        className="px-3 text-sm text-gray-600 hover:text-gray-900"
                      >
                        {t('inventory.cancel')}
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">{t('inventory.lineRequired')}</label>
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
                            // Generate SKU after line change (only for new items)
                            setTimeout(() => generateSkuIfNeeded(), 0);
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                      >
                        <option value="">{t('inventory.selectLine')}</option>
                        {predefinedLines.map(line => (
                          <option key={line} value={line}>{line}</option>
                        ))}
                        {existingLines.length > 0 && (
                          <>
                            <optgroup label={t('inventory.otherLines')}>
                              {existingLines.map(line => (
                                <option key={line} value={line}>{line}</option>
                              ))}
                            </optgroup>
                          </>
                        )}
                        <option value="__new__">{t('inventory.addNewLine')}</option>
                      </select>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={formData.line}
                        onChange={(e) => {
                          setFormData({ ...formData, line: e.target.value });
                          // Generate SKU after line change (only for new items)
                          setTimeout(() => generateSkuIfNeeded(), 0);
                        }}
                        placeholder={t('inventory.enterNewLine')}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setLineMode('select')}
                        className="px-3 text-sm text-gray-600 hover:text-gray-900"
                      >
                        {t('inventory.cancel')}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('inventory.internalSku')}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={formData.sku}
                    onChange={(e) => handleSkuChange(e.target.value)}
                    placeholder={t('inventory.autoGeneratedSku')}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent bg-white font-mono"
                    readOnly={!!editingItem}
                  />
                  <button
                    type="button"
                    onClick={handleRegenerateSku}
                    disabled={!!editingItem || !formData.category || !formData.line}
                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-white hover:border-[#4f0c1b] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title={t('inventory.regenerateSku')}
                  >
                    <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Format: {formData.category ? formData.category.substring(0, 2).toUpperCase() : 'XX'}
                  {formData.line ? (() => {
                    const words = formData.line.trim().split(/\s+/);
                    if (words.length >= 2) {
                      return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
                    } else if (words.length === 1) {
                      return words[0].substring(0, 2).toUpperCase();
                    }
                    return 'XX';
                  })() : 'XX'}-#####
                  {!editingItem && t('inventory.autoGeneratesWhen')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">{t('inventory.supplierSku')}</label>
                <input
                  type="text"
                  value={formData.supplierSKU}
                  onChange={(e) => setFormData({ ...formData, supplierSKU: e.target.value })}
                  placeholder={t('inventory.supplierSkuPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">{t('inventory.ecuadorStockLabel')} *</label>
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
                  <label className="block text-sm font-medium mb-1 text-gray-700">{t('inventory.usaStockLabel')} *</label>
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
                <label className="block text-sm font-medium mb-2 text-gray-700">{t('inventory.productImages')}</label>
                {user?.role === 'admin' && hasPermission('media.delete') && (
                  <p className="text-xs text-gray-500 mb-2">
                    💡 Admin: Click the red X button on images to permanently delete them from storage
                  </p>
                )}
                
                {/* Image Grid */}
                {formData.images.length > 0 && (
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    {formData.images.map((image, index) => {
                      const isAdmin = user?.role === 'admin' && hasPermission('media.delete');
                      return (
                        <div key={index} className="relative group">
                          <img
                            src={image}
                            alt={`Product ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg border-2 border-gray-200"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(index)}
                            title={isAdmin ? "Delete media file permanently (Admin only)" : "Remove from form"}
                            className={`absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 transition-opacity shadow-lg ${
                              isAdmin ? 'opacity-80 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                          {index === 0 && (
                            <div className="absolute bottom-1 left-1 bg-[#4f0c1b] text-white text-xs px-2 py-0.5 rounded">
                              {t('inventory.main')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* Upload Button */}
                <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-[#4f0c1b] hover:bg-gray-50 cursor-pointer transition-all">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-sm text-gray-600">{t('inventory.uploadImages')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  {t('inventory.uploadUpTo10Images')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">{t('inventory.linkedPurchaseOrders')}</label>
                <div className="border border-gray-300 rounded-lg p-4 max-h-60 overflow-y-auto bg-gray-50">
                  {purchaseOrders.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('inventory.noPurchaseOrdersAvailable')}</p>
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
                {t('inventory.cancel')}
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                className="flex-1 bg-[#4f0c1b] hover:bg-[#3d0a15] text-white px-6 py-2.5 rounded-xl transition-all font-medium shadow-sm hover:shadow active:scale-95"
              >
                {editingItem ? t('inventory.update') : t('inventory.add')} {t('common.item')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                  #
                </th>
                {!hiddenColumns.has('name') && (
                  <th 
                    onClick={() => handleSort('name')}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      {t('inventory.name')}
                      <SortIcon field="name" />
                    </div>
                  </th>
                )}
                {!hiddenColumns.has('sku') && (
                  <th 
                    onClick={() => handleSort('sku')}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      {t('inventory.sku')}
                      <SortIcon field="sku" />
                    </div>
                  </th>
                )}
                {!hiddenColumns.has('barcode') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('inventory.barcode')}
                  </th>
                )}
                {!hiddenColumns.has('category') && (
                  <th 
                    onClick={() => handleSort('category')}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      {t('inventory.category')}
                      <SortIcon field="category" />
                    </div>
                  </th>
                )}
                {!hiddenColumns.has('line') && (
                  <th 
                    onClick={() => handleSort('line')}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      {t('inventory.line')}
                      <SortIcon field="line" />
                    </div>
                  </th>
                )}
                {!hiddenColumns.has('ecuadorStock') && (
                  <th 
                    onClick={() => handleSort('ecuadorStock')}
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-1 justify-center">
                      {t('inventory.ecuadorStock')}
                      <SortIcon field="ecuadorStock" />
                    </div>
                  </th>
                )}
                {!hiddenColumns.has('usaStock') && (
                  <th 
                    onClick={() => handleSort('usaStock')}
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-1 justify-center">
                      {t('inventory.usaStock')}
                      <SortIcon field="usaStock" />
                    </div>
                  </th>
                )}
                {!hiddenColumns.has('totalStock') && (
                  <th 
                    onClick={() => handleSort('totalStock')}
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-1 justify-center">
                      {t('inventory.totalStock')}
                      <SortIcon field="totalStock" />
                    </div>
                  </th>
                )}
                {!hiddenColumns.has('actions') && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('inventory.actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredAndSortedInventory.length === 0 ? (
                <tr>
                  <td colSpan={getVisibleColumnCount() + 1} className="px-6 py-12 text-center text-sm text-gray-500">
                    {filteredInventory.length === 0 
                      ? t('inventory.noItemsYet')
                      : t('inventory.noItemsMatchFilters')}
                  </td>
                </tr>
              ) : (
                filteredAndSortedInventory.map((item, index) => {
                  const needsReview = item.category.includes('NEEDS REVIEW');
                  return (
                    <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${needsReview ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                        {index + 1}
                      </td>
                      {!hiddenColumns.has('name') && (
                        <td className="px-6 py-4">
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedItem(item)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedItem(item);
                              }
                            }}
                            className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#4f0c1b] focus-visible:ring-offset-2"
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
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-[#4f0c1b] hover:underline">{item.name}</span>
                              {needsReview && (
                                <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">
                                  {t('inventory.needsReview')}
                                </span>
                              )}
                              {getTotalProblemQty(item) > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setVerificationIssuesModalItem(item);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 text-amber-900 px-2 py-0.5 text-xs font-semibold hover:bg-amber-100 transition-colors max-w-[10rem]"
                                  title={t('inventory.verificationProblemHint')}
                                >
                                  <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                                    <path
                                      fillRule="evenodd"
                                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  <span className="text-left leading-tight">
                                    {t('inventory.includesProblemUnits').replace(
                                      '{{count}}',
                                      String(getTotalProblemQty(item))
                                    )}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      )}
                      {!hiddenColumns.has('sku') && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-mono">{item.sku}</td>
                      )}
                      {!hiddenColumns.has('barcode') && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {item.barcode ? (
                            <div className="flex items-center gap-2">
                              <img
                                src={item.barcode}
                                alt={`Barcode for ${item.sku}`}
                                className="h-12 w-auto border border-gray-200 rounded"
                              />
                              {!isReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => handleGenerateBarcode(item)}
                                  className="text-gray-400 hover:text-[#4f0c1b] transition-colors"
                                  title={t('inventory.regenerateBarcode') || 'Regenerate barcode'}
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                    />
                                  </svg>
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={isReadOnly}
                              onClick={() => handleGenerateBarcode(item)}
                              className="text-[#4f0c1b] hover:text-[#3d0a15] font-medium text-sm transition-colors flex items-center gap-1 disabled:opacity-50 disabled:pointer-events-none"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Generate
                            </button>
                          )}
                        </td>
                      )}
                      {!hiddenColumns.has('category') && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {needsReview ? '-' : item.category}
                        </td>
                      )}
                      {!hiddenColumns.has('line') && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.line || '-'}</td>
                      )}
                      {!hiddenColumns.has('ecuadorStock') && (
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-700">{item.ecuadorStock}</td>
                      )}
                      {!hiddenColumns.has('usaStock') && (
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-700">{item.usaStock}</td>
                      )}
                      {!hiddenColumns.has('totalStock') && (
                        <td className="px-6 py-4 text-center align-middle">
                          <div className="flex flex-col items-center justify-center gap-1.5">
                            <span className="text-lg font-semibold text-gray-900 tabular-nums">
                              {getTotalStock(item)}
                            </span>
                            <span className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">
                              {t('inventory.totalOnHandShort')}
                            </span>
                            {getTotalProblemQty(item) > 0 && (
                              <button
                                type="button"
                                onClick={() => setVerificationIssuesModalItem(item)}
                                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-950 hover:bg-amber-100 transition-colors shadow-sm"
                                title={t('inventory.verificationProblemHint')}
                              >
                                <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                                  <path
                                    fillRule="evenodd"
                                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                {t('inventory.includesProblemUnits').replace(
                                  '{{count}}',
                                  String(getTotalProblemQty(item))
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                      {!hiddenColumns.has('actions') && (
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          {!isReadOnly && (
                            <>
                              <button
                                onClick={() => handleEdit(item)}
                                className="text-[#4f0c1b] hover:text-[#3d0a15] font-medium mr-4 transition-colors"
                              >
                                {needsReview ? 'Complete Info' : 'Edit'}
                              </button>
                              <button
                                onClick={() => {
                                  setItemToDelete(item);
                                  setDeleteConfirmOpen(true);
                                }}
                                className="text-red-600 hover:text-red-700 font-medium transition-colors"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-3 flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center gap-4">
            <span>
              {t('purchaseOrders.showing')}{' '}
              <span className="font-semibold text-gray-900">{filteredAndSortedInventory.length}</span>{' '}
              {t('purchaseOrders.of')}{' '}
              <span className="font-semibold text-gray-900">{filteredInventory.length}</span>{' '}
              {t('inventory.footerItems')}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{t('inventory.tableRowNumbersHint')}</span>
          </div>
        </div>
      </div>
      )}

      {/* Gallery View */}
      {viewMode === 'gallery' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-6">
            {filteredAndSortedInventory.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-sm text-gray-500">
                  {inventory.length === 0 
                    ? 'No inventory items yet. Add your first item to get started.'
                    : 'No items match your filters. Try adjusting your search or filters.'}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {filteredAndSortedInventory.map((item) => {
                  const needsReview = item.category.includes('NEEDS REVIEW');
                  return (
                    <div key={item.id} className={`group relative bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-200 hover:border-[#4f0c1b] ${needsReview ? 'ring-2 ring-amber-200' : ''}`}>
                      {getTotalProblemQty(item) > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setVerificationIssuesModalItem(item);
                          }}
                          className="absolute top-2 left-2 z-20 inline-flex items-center gap-1 rounded-full bg-amber-500 text-white px-2 py-1 text-[10px] font-bold shadow-md hover:bg-amber-600 transition-colors max-w-[7.5rem] leading-tight text-left"
                          title={t('inventory.verificationProblemHint')}
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                            <path
                              fillRule="evenodd"
                              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {t('inventory.includesProblemUnits').replace(
                            '{{count}}',
                            String(getTotalProblemQty(item))
                          )}
                        </button>
                      )}
                      {/* Image Section */}
                      <div className="aspect-square relative overflow-hidden bg-gray-100">
                        {item.images && item.images.length > 0 && !imageErrors.has(`${item.id}-${item.images[0]}`) ? (
                          <>
                            <img 
                              src={item.images[0]} 
                              alt={item.name} 
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              onError={() => {
                                // Mark this image as failed to load
                                setImageErrors(prev => new Set([...prev, `${item.id}-${item.images[0]}`]));
                              }}
                              onLoad={(e) => {
                                // Ensure image is visible and properly styled
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'block';
                                target.style.backgroundColor = 'transparent';
                              }}
                              loading="lazy"
                            />
                            {item.images.length > 1 && (
                              <div className="absolute top-2 right-2 bg-[#4f0c1b] text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-medium z-10">
                                {item.images.length}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gray-100">
                            <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        
                        {/* Action Buttons Overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200 flex items-center justify-center pointer-events-none">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-2 pointer-events-auto">
                            <button
                              onClick={() => setSelectedItem(item)}
                              className="bg-white text-[#4f0c1b] px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-lg"
                            >
                              View
                            </button>
                            {!isReadOnly && (
                              <button
                                onClick={() => handleEdit(item)}
                                className="bg-[#4f0c1b] text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[#3d0a15] transition-colors shadow-lg"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Content Section */}
                      <div className="p-4 space-y-2">
                        {/* Name */}
                        {galleryFields.has('name') && (
                          <div>
                            <h3 className="font-medium text-[#4f0c1b] text-sm truncate">{item.name}</h3>
                            {needsReview && (
                              <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">
                                {t('inventory.needsReview')}
                              </span>
                            )}
                          </div>
                        )}

                        {/* SKU */}
                        {galleryFields.has('sku') && (
                          <div className="text-xs text-gray-600 font-mono">{item.sku}</div>
                        )}

                        {/* Category */}
                        {galleryFields.has('category') && (
                          <div className="text-xs text-gray-500">
                            <span className="font-medium">Category:</span> {item.category}
                          </div>
                        )}

                        {/* Line */}
                        {galleryFields.has('line') && (
                          <div className="text-xs text-gray-500">
                            <span className="font-medium">Line:</span> {item.line}
                          </div>
                        )}

                        {/* Stock Information */}
                        {(galleryFields.has('ecuadorStock') || galleryFields.has('usaStock') || galleryFields.has('totalStock')) && (
                          <div className="flex gap-2 text-xs">
                            {galleryFields.has('ecuadorStock') && (
                              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                EC: {item.ecuadorStock}
                              </span>
                            )}
                            {galleryFields.has('usaStock') && (
                              <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full">
                                US: {item.usaStock}
                              </span>
                            )}
                              {galleryFields.has('totalStock') && (
                                <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full font-medium inline-flex items-center gap-1">
                                  Total: {item.ecuadorStock + item.usaStock}
                                  {getTotalProblemQty(item) > 0 && (
                                    <span className="text-amber-700" title={t('inventory.verificationProblemHint')}>
                                      ({getTotalProblemQty(item)} {t('inventory.problemUnitsShort')})
                                    </span>
                                  )}
                                </span>
                              )}
                          </div>
                        )}

                        {/* Cost Information */}
                        {(galleryFields.has('unitCost') || galleryFields.has('totalValue')) && (
                          <div className="text-xs text-gray-500 space-y-1">
                              {galleryFields.has('unitCost') && (
                                <div>
                                  <span className="font-medium">Unit Cost:</span> $0.00
                                </div>
                              )}
                              {galleryFields.has('totalValue') && (
                                <div>
                                  <span className="font-medium">Total Value:</span> $0.00
                                </div>
                              )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="bg-gray-50 border-t border-gray-200 px-6 py-3 flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-4">
              <span>
                {t('purchaseOrders.showing')}{' '}
                <span className="font-semibold text-gray-900">{filteredAndSortedInventory.length}</span>{' '}
                {t('purchaseOrders.of')}{' '}
                <span className="font-semibold text-gray-900">{filteredInventory.length}</span>{' '}
                {t('inventory.footerItems')}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{t('inventory.footerCountsHint')}</span>
            </div>
          </div>
        </div>
      )}

      {verificationIssuesModalItem && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="verification-issues-title"
          onClick={() => setVerificationIssuesModalItem(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
              <h3 id="verification-issues-title" className="font-semibold text-gray-900">
                {t('inventory.verificationProblemTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setVerificationIssuesModalItem(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
                aria-label={t('common.close')}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4">
              <p className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">{verificationIssuesModalItem.name}</span>
                <span className="text-gray-400"> · {verificationIssuesModalItem.sku}</span>
              </p>
              <p className="text-xs text-gray-500">{t('inventory.verificationProblemIntro')}</p>
              {getLiveVerificationIssues(verificationIssuesModalItem).map((issue) => {
                const po = purchaseOrders.find((o) => o.id === issue.purchaseOrderId);
                return (
                  <div
                    key={issue.purchaseOrderId}
                    className="border border-amber-200 bg-amber-50/80 rounded-lg p-4 space-y-2"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-amber-950">
                        {po?.invoice ?? t('inventory.purchaseOrder')}
                      </span>
                    </div>
                    {issue.quantityGoodAtVerification !== undefined ? (
                      <p className="text-sm font-semibold text-gray-900">
                        {t('inventory.verificationBreakdownLine')
                          .replace('{{good}}', String(issue.quantityGoodAtVerification))
                          .replace('{{problem}}', String(issue.quantityProblem))}
                      </p>
                    ) : (
                      <p className="text-sm font-bold text-amber-900">
                        {t('inventory.problemQtyLabel')}: {issue.quantityProblem}
                      </p>
                    )}
                    {issue.comment ? (
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{issue.comment}</p>
                    ) : (
                      <p className="text-sm text-gray-500 italic">{t('inventory.noVerificationComment')}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
          inventory={inventory.filter(item => {
            // Only include items that have stock (items you currently hold)
            const totalStock = item.ecuadorStock + item.usaStock;
            return totalStock > 0;
          })}
          onClose={() => setIsCatalogModalOpen(false)}
        />
      )}

      {/* Transfer Modal */}
      {isTransferModalOpen && (
        <InventoryTransferModal
          isOpen={isTransferModalOpen}
          onClose={() => setIsTransferModalOpen(false)}
        />
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        title={t('common.deleteInventoryItem')}
        description={t('inventory.deleteConfirm')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
        onConfirm={() => {
          if (itemToDelete) {
            deleteInventoryItem(itemToDelete.id);
            setItemToDelete(null);
          }
          setDeleteConfirmOpen(false);
        }}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setItemToDelete(null);
        }}
      />

      <ConfirmDialog
        open={mediaDeleteConfirmOpen}
        title="Delete Media File"
        description="Are you sure you want to permanently delete this media file? This action cannot be undone. The file will be removed from Firebase Storage."
        confirmText="Delete Permanently"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleConfirmMediaDelete}
        onCancel={handleCancelMediaDelete}
      />
    </div>
  );
}
