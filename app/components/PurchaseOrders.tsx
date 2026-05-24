'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import React from 'react';
import { useInventory } from '../context/InventoryContext';
import { PurchaseOrder, Supplier, InventoryItem, PurchaseOrderStatus } from '../types';
import SupplierDetailPanel from './SupplierDetailPanel';
import PurchaseOrderLineDetailPanel from './PurchaseOrderLineDetailPanel';
import PurchaseOrderBarcodeCell from './PurchaseOrderBarcodeCell';
import {
  resolveInternalSku,
  validateAndNormalizeInternalSku,
  findInternalSkuBySupplierSku,
  collectUsedSkus,
  generateUniqueSKU,
} from '../utils/skuGenerator';
import { getExchangeRates, getExchangeRate, formatLastUpdate, type ExchangeRateResponse } from '../utils/currencyApi';
import BulkImportModal from './BulkImportModal';
import BulkImportEditPickerModal from './BulkImportEditPickerModal';
import BulkDeleteModal from './BulkDeleteModal';
import BulkStatusChangeModal from './BulkStatusChangeModal';
import BarcodePrintModal from './BarcodePrintModal';
import BarcodePrintProgress from './BarcodePrintProgress';
import ModalPortal from './ui/ModalPortal';
import {
  downloadBarcodePdfBlob,
  prepareBarcodePrintItemsForPdf,
  type BarcodePrintPdfItem,
  type BarcodePrintProgressPhase,
} from '../utils/barcodePrintPdf';
import PurchaseOrderStatusCell from './PurchaseOrderStatusCell';
import { tableRowActionButtonClass } from './ui/tableRowActionClass';
import PurchaseOrderQuantityCell from './PurchaseOrderQuantityCell';
import InvoiceStatusActionsBar from './InvoiceStatusActionsBar';
import InvoiceBatchVerificationModal, { type InvoiceVerifyLineInput } from './InvoiceBatchVerificationModal';
import POScannerVerificationSession, {
  type ScannerScanResult,
} from './POScannerVerificationSession';
import {
  findPurchaseOrderLinesByBarcodeScan,
  getScanProgress,
  hasActiveScanProgress,
  isLineReadyToConfirm,
  scanProgressClearUpdate,
} from '../utils/purchaseOrderBarcodeScan';
import { getNextStatus } from '../utils/purchaseOrderStatusFlow';
import {
  orderMatchesStatusFilter,
  PO_ACTIVE_STATUSES,
  effectivePurchaseOrderStatus,
} from '../utils/purchaseOrderStatusTheme';
import PoStatusIcon from './icons/PoStatusIcon';
import {
  syncPurchaseOrderToInventory,
  cleanupInventoryAfterOrderDeletion,
  generateBarcodeForInventoryItem,
  attachBarcodeToPurchaseOrderIfNeeded,
} from '../utils/syncUpdates';
import { useTranslation } from '../context/TranslationContext';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAuth } from '../context/AuthContext';
import { usePersistedFilterState, usePersistedStringSetFilter } from '../hooks/usePersistedFilterState';
import POVerificationModal from './POVerificationModal';
import { generatePOVerificationPDF } from '../utils/poVerificationPDF';
import ConfirmDialog from './ui/ConfirmDialog';
import DateInput from './ui/DateInput';
import {
  PREDEFINED_CATEGORIES_ES,
  PREDEFINED_LINES_ES,
  allKnownCategoryKeys,
  allKnownLineKeys,
} from '../constants/merchandise';
import { displayCategory, displayLine } from '../utils/merchandiseLabels';
import { formatDateDMY, formatDateTimeShort } from '../utils/formatDate';

/** Row used to validate supplier + internal SKU before verification (inventory sync requires both). */
function purchaseOrderSnapshotForSkuGate(data: {
  order: PurchaseOrder;
  updatedOrder?: PurchaseOrder;
  orderData?: Partial<PurchaseOrder>;
  isEditing?: boolean;
}): PurchaseOrder {
  if (data.isEditing && data.updatedOrder && data.orderData != null) {
    return { ...data.updatedOrder, ...data.orderData } as PurchaseOrder;
  }
  if (data.updatedOrder) {
    return data.updatedOrder;
  }
  return data.order;
}

function purchaseOrderHasSkusForVerification(po: PurchaseOrder): boolean {
  return (
    String(po.supplierSKU ?? '').trim().length > 0 &&
    String(po.sku ?? '').trim().length > 0
  );
}

export default function PurchaseOrders() {
  const {
    purchaseOrders,
    addPurchaseOrder,
    updatePurchaseOrder,
    updatePurchaseOrdersBulk,
    deletePurchaseOrder,
    deletePurchaseOrdersBulk,
    suppliers,
    inventory,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    addSupplier,
  } = useInventory();
  const { t, tf } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id;
  const darkMode = useDarkMode();
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [poLineDetailOrder, setPoLineDetailOrder] = useState<PurchaseOrder | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkImportEditId, setBulkImportEditId] = useState<string | null>(null);
  const [bulkImportEditPickerOpen, setBulkImportEditPickerOpen] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [bulkStatusChangeBusy, setBulkStatusChangeBusy] = useState(false);
  const [isBulkStatusChangeOpen, setIsBulkStatusChangeOpen] = useState(false);
  const [isPOVerificationModalOpen, setIsPOVerificationModalOpen] = useState(false);
  const [isBarcodePrintModalOpen, setIsBarcodePrintModalOpen] = useState(false);
  const [barcodePrintBusy, setBarcodePrintBusy] = useState(false);
  const [barcodePrintProgress, setBarcodePrintProgress] = useState<{
    phase: BarcodePrintProgressPhase;
    current: number;
    total: number;
  }>({ phase: 'images', current: 0, total: 0 });
  const barcodePrintLockRef = useRef(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  
  // Confirmation dialog states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<PurchaseOrder | null>(null);
  const [statusChangeConfirmOpen, setStatusChangeConfirmOpen] = useState(false);
  const [statusChangeData, setStatusChangeData] = useState<{oldStatus: string, newStatus: string, order: PurchaseOrder, updatedOrder: PurchaseOrder, orderData: any, previousSku?: string} | null>(null);
  const [quantityMismatchConfirmOpen, setQuantityMismatchConfirmOpen] = useState(false);
  const [quantityMismatchData, setQuantityMismatchData] = useState<{expected: number, received: number, difference: string, order: PurchaseOrder, orderData?: any, previousSku?: string, statusUpdate?: Partial<PurchaseOrder>} | null>(null);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [verificationData, setVerificationData] = useState<{
    order: PurchaseOrder;
    orderData?: Partial<PurchaseOrder>;
    previousSku?: string;
    isEditing?: boolean;
    updatedOrder?: PurchaseOrder;
    fromScanner?: boolean;
  } | null>(null);
  const [invoiceBatchVerify, setInvoiceBatchVerify] = useState<{ invoice: string; orders: PurchaseOrder[] } | null>(null);
  const [invoiceWorkflowBusy, setInvoiceWorkflowBusy] = useState(false);
  const [batchVerifySubmitting, setBatchVerifySubmitting] = useState(false);
  const [scannerSession, setScannerSession] = useState<{ initialInvoice?: string } | null>(null);
  const [verificationQuantity, setVerificationQuantity] = useState<string>('');
  const [verificationQuantityGood, setVerificationQuantityGood] = useState<string>('');
  const [verificationQuantityProblem, setVerificationQuantityProblem] = useState<string>('');
  const [verificationQuantityNotReceived, setVerificationQuantityNotReceived] = useState<string>('');
  const [verificationComment, setVerificationComment] = useState<string>('');
  const [verificationMedia, setVerificationMedia] = useState<File[]>([]);
  const [verificationMediaUrls, setVerificationMediaUrls] = useState<string[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>('');
  const [isCreatingNewItem, setIsCreatingNewItem] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateResponse | null>(null);
  const [isLoadingRates, setIsLoadingRates] = useState(false);
  const [lastRateUpdate, setLastRateUpdate] = useState<string>('');
  const [exchangeRateManuallySet, setExchangeRateManuallySet] = useState(false);
  const [categoryMode, setCategoryMode] = useState<'select' | 'new'>('select');
  const [supplierNameInput, setSupplierNameInput] = useState<string>('');
  const [supplierInputMode, setSupplierInputMode] = useState<'select' | 'text'>('select');
  const [lineMode, setLineMode] = useState<'select' | 'new'>('select');
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);
  const [originalSku, setOriginalSku] = useState<string>('');
  
  // Sorting and filtering state
  const [sortField, setSortField] = usePersistedFilterState('purchase-orders', 'sortField', 'createdAt', userId);
  const [sortDirection, setSortDirection] = usePersistedFilterState<'asc' | 'desc'>(
    'purchase-orders',
    'sortDirection',
    'desc',
    userId
  );
  const [searchQuery, setSearchQuery] = usePersistedFilterState('purchase-orders', 'searchQuery', '', userId);
  const [filterStatus, setFilterStatus] = usePersistedFilterState('purchase-orders', 'filterStatus', 'all', userId);
  const [filterSupplier, setFilterSupplier] = usePersistedFilterState('purchase-orders', 'filterSupplier', 'all', userId);
  const [filterDuplicateSku, setFilterDuplicateSku] = usePersistedFilterState(
    'purchase-orders',
    'filterDuplicateSku',
    false,
    userId
  );
  const [filterCategory, setFilterCategory] = usePersistedFilterState('purchase-orders', 'filterCategory', 'all', userId);
  const [filterLine, setFilterLine] = usePersistedFilterState('purchase-orders', 'filterLine', 'all', userId);

  // Load filters from sessionStorage when component mounts (from dashboard navigation)
  useEffect(() => {
    const storedFilters = sessionStorage.getItem('dashboardFilters_purchase-orders');
    if (storedFilters) {
      try {
        const filters = JSON.parse(storedFilters);
        if (filters.filterStatus) {
          const st = filters.filterStatus === 'Shipped' ? 'Received' : filters.filterStatus;
          setFilterStatus(st);
        }
        // Clear the stored filters after applying
        sessionStorage.removeItem('dashboardFilters_purchase-orders');
      } catch (e) {
        console.error('Error parsing dashboard filters:', e);
      }
    }
  }, []);
  const [filterQuantityIssues, setFilterQuantityIssues] = usePersistedFilterState(
    'purchase-orders',
    'filterQuantityIssues',
    'all',
    userId
  );
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  
  // Column visibility state
  const [hiddenColumns, setHiddenColumns] = usePersistedStringSetFilter('purchase-orders', 'hiddenColumns', userId);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Search dropdown state
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  
  // Group by state
  const [groupByField, setGroupByField] = usePersistedFilterState('purchase-orders', 'groupByField', '', userId);
  const [showGroupByDropdown, setShowGroupByDropdown] = useState(false);
  const groupByDropdownRef = useRef<HTMLDivElement>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  
  // Bulk operations state
  const [showBulkDropdown, setShowBulkDropdown] = useState(false);
  const bulkDropdownRef = useRef<HTMLDivElement>(null);
  
  const knownPoCategories = allKnownCategoryKeys();
  const knownPoLines = allKnownLineKeys();
  
  // Get visible columns based on current view mode
  const getVisibleColumns = () => {
    const allColumns = [
      { key: 'invoice', label: t('purchaseOrders.invoice') },
      { key: 'supplier', label: t('purchaseOrders.supplier') },
      { key: 'description', label: t('purchaseOrders.description') },
      { key: 'sku', label: t('purchaseOrders.sku') },
      { key: 'barcode', label: t('purchaseOrders.barcodeColumn') },
      { key: 'quantity', label: t('purchaseOrders.quantity') },
      { key: 'status', label: t('purchaseOrders.status') },
      { key: 'landedCost', label: t('purchaseOrders.costPerUnit') }
    ];
    
    // Return all columns that can be toggled (excluding # and Actions which are always visible)
    return allColumns;
  };

  // Get group by fields
  const getGroupByFields = () => {
    return [
      { key: 'invoice', label: t('purchaseOrders.invoice') },
      { key: 'supplier', label: t('purchaseOrders.supplier') },
      { key: 'category', label: t('purchaseOrders.category') },
      { key: 'line', label: t('purchaseOrders.line') },
      { key: 'status', label: t('purchaseOrders.status') },
      { key: 'createdAt', label: t('purchaseOrders.dateCreated') },
    ];
  };

  // Get visible column keys for rendering
  const getVisibleColumnKeys = () => {
    const allColumns = ['invoice', 'supplier', 'description', 'sku', 'barcode', 'quantity', 'status', 'landedCost'];
    return allColumns.filter(key => !hiddenColumns.has(key));
  };
  
  // Note: toggleColumnVisibility is defined but not currently used
  // This will be used when column visibility UI is implemented
  // const toggleColumnVisibility = (columnKey: string) => {
  //   setHiddenColumns(prev => {
  //     const newSet = new Set(prev);
  //     if (newSet.has(columnKey)) {
  //       newSet.delete(columnKey);
  //     } else {
  //       newSet.add(columnKey);
  //     }
  //     return newSet;
  //   });
  // };
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showColumnDropdown && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowColumnDropdown(false);
      }
      if (showSearchDropdown && searchDropdownRef.current && !searchDropdownRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
      if (showGroupByDropdown && groupByDropdownRef.current && !groupByDropdownRef.current.contains(event.target as Node)) {
        setShowGroupByDropdown(false);
      }
      if (showBulkDropdown && bulkDropdownRef.current && !bulkDropdownRef.current.contains(event.target as Node)) {
        setShowBulkDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColumnDropdown, showSearchDropdown, showGroupByDropdown, showBulkDropdown]);

  // Get unique categories and lines from existing data (excluding predefined ones)
  const existingCategories = [...new Set([
    ...inventory.map(item => item.category),
    ...purchaseOrders.map(order => order.category)
  ].filter(cat => cat && !cat.includes('NEEDS REVIEW') && !knownPoCategories.has(cat)))].sort();
  
  const existingLines = [...new Set([
    ...inventory.map(item => item.line),
    ...purchaseOrders.map(order => order.line)
  ].filter(line => line && line.trim() !== '' && !knownPoLines.has(line)))].sort();

  // Get SKUs that appear multiple times across purchase orders
  const getDuplicateSkus = () => {
    const skuCounts: { [sku: string]: number } = {};
    purchaseOrders.forEach(order => {
      if (order.sku) {
        skuCounts[order.sku] = (skuCounts[order.sku] || 0) + 1;
      }
    });
    return Object.keys(skuCounts).filter(sku => skuCounts[sku] > 1);
  };

  const duplicateSkus = getDuplicateSkus();
  
  const [formData, setFormData] = useState({
    invoice: '',
    invoiceLink: '',
    supplierId: '',
    supplierSKU: '',
    description: '',
    sku: '',
    category: '',
    line: '',
    images: [] as string[],
    quantity: 0,
    currency: 'USD',
    costPerUnit: 0,
    discountPerUnit: 0,
    exchangeRate: 1,
    purchaseDate: new Date().toISOString().split('T')[0],
    status: 'Ordered' as PurchaseOrderStatus,
  });

  /** Orden en contexto + SKU del formulario (para generar código antes de guardar otros campos). */
  const mergedOrderForFormBarcode = useMemo((): PurchaseOrder | null => {
    if (!editingOrder?.id) return null;
    const live = purchaseOrders.find((o) => o.id === editingOrder.id) ?? editingOrder;
    const sku = (formData.sku || '').trim() || (live.sku || '').trim();
    return { ...live, sku };
  }, [editingOrder, purchaseOrders, formData.sku]);

  /** Debounce supplier SKU so the internal SKU does not change on every keystroke. */
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

  // SKU interno secuencial; el SKU de proveedor enlaza siempre al mismo producto existente.
  useEffect(() => {
    if (!formData.category || !formData.line || skuManuallyEdited) return;

    const shouldApply =
      (!editingOrder && isCreatingNewItem) ||
      (editingOrder &&
        (supplierSkuStable !== (editingOrder.supplierSKU || '').trim() ||
          formData.category !== editingOrder.category ||
          formData.line !== editingOrder.line));

    if (!shouldApply) return;

    const resolved = resolveInternalSku({
      category: formData.category,
      line: formData.line,
      supplierSKU: supplierSkuStable,
      inventory,
      purchaseOrders,
      ignorePurchaseOrderId: editingOrder?.id,
    });

    setFormData((prev) => (prev.sku !== resolved ? { ...prev, sku: resolved } : prev));
  }, [
    supplierSkuStable,
    formData.category,
    formData.line,
    isCreatingNewItem,
    editingOrder,
    inventory,
    purchaseOrders,
    skuManuallyEdited,
  ]);

  // When selecting an existing inventory item, auto-fill fields
  useEffect(() => {
    if (selectedInventoryId && selectedInventoryId !== 'new') {
      const item = inventory.find(i => i.id === selectedInventoryId);
      if (item) {
        setFormData(prev => ({
          ...prev,
          sku: item.sku,
          description: editingOrder ? prev.description : (item.description || item.name),
          category: item.category,
          line: item.line,
          images: item.images || [],
          supplierSKU: editingOrder ? prev.supplierSKU : item.supplierSKU,
        }));
        setIsCreatingNewItem(false);
        setSkuManuallyEdited(true); // Prevent auto-regeneration when linked to existing
      }
    } else if (selectedInventoryId === 'new') {
      setIsCreatingNewItem(true);
      // Clear product fields
      setFormData(prev => ({
        ...prev,
        sku: '',
        description: '',
        category: '',
        line: '',
        images: [],
        supplierSKU: '',
      }));
    }
  }, [selectedInventoryId, inventory, editingOrder]);

  // Fetch exchange rates when form opens
  const fetchExchangeRates = useCallback(async () => {
    setIsLoadingRates(true);
    try {
      const rates = await getExchangeRates('USD');
      if (rates) {
        setExchangeRates(rates);
        setLastRateUpdate(formatLastUpdate(rates.time_last_update_utc));
        
        // Auto-set exchange rate if currency is already selected
        if (formData.currency !== 'USD') {
          const rate = getExchangeRate(formData.currency, 'USD', rates);
          setFormData(prev => ({ ...prev, exchangeRate: rate }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch exchange rates:', error);
    } finally {
      setIsLoadingRates(false);
    }
  }, [formData.currency]);

  useEffect(() => {
    if (isFormOpen && !exchangeRates) {
      fetchExchangeRates();
    }
  }, [isFormOpen, exchangeRates, fetchExchangeRates]);

  // Track previous currency to detect changes
  const prevCurrencyRef = useRef<string>(formData.currency);
  
  // Auto-update exchange rate when currency changes (only for NEW orders, not when editing)
  // When editing, preserve the original exchange rate to avoid accounting problems
  useEffect(() => {
    // Don't auto-update exchange rate when editing an existing order
    if (editingOrder) {
      return;
    }
    
    // Reset manual flag when currency changes (so new currency gets auto-populated)
    if (prevCurrencyRef.current !== formData.currency) {
      setExchangeRateManuallySet(false);
      prevCurrencyRef.current = formData.currency;
    }
    
    // Only auto-update for new orders
    if (exchangeRates && formData.currency !== 'USD' && !exchangeRateManuallySet) {
      const rate = getExchangeRate(formData.currency, 'USD', exchangeRates);
      if (rate !== formData.exchangeRate) {
        setFormData(prev => ({ ...prev, exchangeRate: rate }));
      }
    } else if (formData.currency === 'USD' && !exchangeRateManuallySet) {
      // Reset to 1 for USD if not manually set
      if (formData.exchangeRate !== 1) {
        setFormData(prev => ({ ...prev, exchangeRate: 1 }));
      }
    }
  }, [formData.currency, exchangeRates, exchangeRateManuallySet, editingOrder]);

  // Helper function to find or create a supplier by name
  const findOrCreateSupplier = async (supplierName: string): Promise<string> => {
    if (!supplierName || supplierName.trim() === '') {
      return '';
    }

    const displayName = supplierName.trim();
    const key = displayName.toLowerCase();

    const existingSupplier = suppliers.find((s) => s.name.trim().toLowerCase() === key);

    if (existingSupplier) {
      return existingSupplier.id;
    }

    try {
      const { getSuppliers } = await import('../services/suppliersService');
      const allSuppliers = await getSuppliers();
      const dbMatch = allSuppliers.find((s) => s.name.trim().toLowerCase() === key);

      if (dbMatch) {
        return dbMatch.id;
      }

      return await addSupplier({
        name: displayName,
        email: '',
        phone: '',
        country: '',
        currency: formData.currency || 'USD',
        notes: 'Auto-created from purchase order',
      });
    } catch (error) {
      console.error('Error creating supplier:', error);
      try {
        const { getSuppliers } = await import('../services/suppliersService');
        const allSuppliers = await getSuppliers();
        const match = allSuppliers.find((s) => s.name.trim().toLowerCase() === key);
        if (match) {
          return match.id;
        }
      } catch (retryError) {
        console.error('Error retrying supplier lookup:', retryError);
      }
      throw error;
    }
  };

  const calculateTotals = () => {
    const totalCost = formData.quantity * formData.costPerUnit;
    const totalDiscount = formData.quantity * formData.discountPerUnit;
    const costPerUnitWithDiscount = formData.costPerUnit - formData.discountPerUnit;
    const totalCostWithDiscount = totalCost - totalDiscount;
    const costInUSD = totalCostWithDiscount * formData.exchangeRate;
    
    // Additional costs in USD
    const shippingCost = 0;
    const tariffCost = 0;
    const otherFees = 0;
    
    // Total cost = product cost only
    const totalLandedCost = costInUSD;
    
    // Landed cost per unit = total landed cost / quantity
    const landedCostPerUnit = formData.quantity > 0 ? totalLandedCost / formData.quantity : 0;
    
    return {
      totalCost,
      totalDiscount,
      costPerUnitWithDiscount,
      totalCostWithDiscount,
      costInUSD,
      shippingCost,
      tariffCost,
      otherFees,
      totalLandedCost,
      landedCostPerUnit,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Handle supplier: if using text input mode, find or create supplier
    let finalSupplierId = formData.supplierId;
    if (supplierInputMode === 'text' && supplierNameInput.trim()) {
      try {
        finalSupplierId = await findOrCreateSupplier(supplierNameInput);
        if (!finalSupplierId) {
          alert(t('purchaseOrders.supplierRequired') || 'Supplier is required');
          return;
        }
      } catch (error) {
        console.error('Error handling supplier:', error);
        alert(t('purchaseOrders.supplierCreationError') || 'Error creating supplier. Please try again.');
        return;
      }
    }
    
    const totals = calculateTotals();

    const skuValidation = validateAndNormalizeInternalSku(
      formData.sku,
      formData.supplierSKU,
      inventory,
      purchaseOrders,
      { ignorePurchaseOrderId: editingOrder?.id }
    );
    if (!skuValidation.ok) {
      if (skuValidation.reason === 'supplier_mismatch') {
        alert(
          (t('purchaseOrders.supplierSkuAlreadyLinked') ||
            'Este SKU de proveedor ya está vinculado al SKU interno {sku}. Se usará ese código.'
          ).replace('{sku}', skuValidation.sku)
        );
      } else {
        alert(
          t('purchaseOrders.internalSkuTakenByOtherSupplier') ||
            'Este SKU interno ya pertenece a otro SKU de proveedor.'
        );
        return;
      }
    }
    const normalizedSku = skuValidation.sku;
    
    // Prepare dates based on status
    const statusDates: Partial<PurchaseOrder> = {};
    if (formData.status === 'Received' || formData.status === 'Verified') {
      statusDates.receivedDate = editingOrder?.receivedDate || new Date();
    }
    if (formData.status === 'Verified') {
      statusDates.verifiedDate = editingOrder?.verifiedDate || new Date();
    }
    
    const orderData = {
      ...formData,
      sku: normalizedSku,
      supplierId: finalSupplierId,
      ...totals,
      ...statusDates,
      purchaseDate: new Date(formData.purchaseDate),
    };

    if (editingOrder) {
      // Update the purchase order
      const updatedOrder = { ...editingOrder, ...orderData };
      
      // Handle inventory updates based on status changes
      const oldStatus = editingOrder.status;
      const newStatus = formData.status;
      
      // Moving backwards FROM Verified TO non-verified - remove from inventory
      if (oldStatus === 'Verified' && newStatus !== 'Verified') {
        const previousSku = originalSku !== updatedOrder.sku ? originalSku : undefined;
        setStatusChangeData({ oldStatus, newStatus, order: editingOrder, updatedOrder, orderData, previousSku });
        setStatusChangeConfirmOpen(true);
        return; // Wait for confirmation
      }
      // Moving TO Verified - show modal for actual quantity and add to inventory
      else if (oldStatus !== 'Verified' && newStatus === 'Verified') {
        if (!purchaseOrderHasSkusForVerification(updatedOrder as PurchaseOrder)) {
          alert(
            t('purchaseOrders.cannotVerifyMissingSkus') ||
              'No se puede verificar: falta el SKU del proveedor y/o el SKU interno. Complételos en la orden antes de verificar.'
          );
          return;
        }
        setVerificationData({
          order: editingOrder,
            orderData,
          previousSku: originalSku !== updatedOrder.sku ? originalSku : undefined,
          isEditing: true,
          updatedOrder
        });
      setVerificationQuantity(updatedOrder.quantity.toString());
      setVerificationQuantityGood(updatedOrder.quantityGood?.toString() || updatedOrder.quantity.toString());
      setVerificationQuantityProblem(updatedOrder.quantityProblem?.toString() || '0');
      setVerificationQuantityNotReceived(updatedOrder.quantityNotReceived?.toString() || '0');
      setVerificationComment(updatedOrder.verificationComment || '');
      setVerificationModalOpen(true);
      return; // Wait for modal confirmation
      }
      
      await updatePurchaseOrder(editingOrder.id, orderData);

      let orderForSync: PurchaseOrder = { ...editingOrder, ...orderData } as PurchaseOrder;
      const skuChanged = Boolean(originalSku && originalSku !== orderForSync.sku);
      orderForSync = await attachBarcodeToPurchaseOrderIfNeeded(
        orderForSync,
        updatePurchaseOrder,
        inventory,
        { forceRegenerate: skuChanged },
        purchaseOrders
      );

      const previousSku = originalSku !== orderForSync.sku ? originalSku : undefined;
      await syncPurchaseOrderToInventory(
        orderForSync,
        inventory,
        updateInventoryItem,
        addInventoryItem,
        deleteInventoryItem,
        purchaseOrders,
        previousSku,
        orderForSync.status === 'Verified',
        editingOrder,
        updatePurchaseOrder
      );
    } else {
      const newId = await addPurchaseOrder(orderData as Omit<PurchaseOrder, 'id' | 'createdAt'>);
      let orderForSync: PurchaseOrder = {
        ...(orderData as Omit<PurchaseOrder, 'id' | 'createdAt'>),
        id: newId,
        createdAt: new Date(),
      } as PurchaseOrder;

      if (orderForSync.sku) {
        orderForSync = await attachBarcodeToPurchaseOrderIfNeeded(
          orderForSync,
          updatePurchaseOrder,
          inventory,
          undefined,
          purchaseOrders
        );
        await syncPurchaseOrderToInventory(
          orderForSync,
          inventory,
          updateInventoryItem,
          addInventoryItem,
          deleteInventoryItem,
          purchaseOrders,
          undefined,
          orderForSync.status === 'Verified',
          undefined,
          updatePurchaseOrder
        );
      }
    }
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      invoice: '',
      invoiceLink: '',
      supplierId: '',
      supplierSKU: '',
      description: '',
      sku: '',
      category: '',
      line: '',
      images: [],
      quantity: 0,
      currency: 'USD',
      costPerUnit: 0,
      discountPerUnit: 0,
      exchangeRate: 1,
      purchaseDate: new Date().toISOString().split('T')[0],
      status: 'Ordered',
    });
    setEditingOrder(null);
    setIsFormOpen(false);
    setSelectedInventoryId('');
    setIsCreatingNewItem(false);
    setCategoryMode('select');
    setLineMode('select');
    setSkuManuallyEdited(false);
    setOriginalSku('');
    setSupplierNameInput('');
    setSupplierInputMode('select');
    setExchangeRateManuallySet(false); // Reset flag for new orders
  };

  const handleRegenerateSku = () => {
    if (!formData.category || !formData.line) {
      alert(
        t('purchaseOrders.skuNeedsCategoryLineSupplier') ||
          'Indique categoría y línea/material para generar el SKU interno.'
      );
      return;
    }
    const sup = (formData.supplierSKU || '').trim();
    if (sup) {
      const linked = findInternalSkuBySupplierSku(sup, inventory, purchaseOrders, {
        ignorePurchaseOrderId: editingOrder?.id,
      });
      if (linked) {
        setFormData({ ...formData, sku: linked });
        setSkuManuallyEdited(false);
        return;
      }
    }
    const pool = collectUsedSkus(inventory, purchaseOrders, {
      ignorePurchaseOrderId: editingOrder?.id,
    }).filter((s) => s !== formData.sku);
    const newSku = generateUniqueSKU(formData.category, formData.line, pool);
    setFormData({ ...formData, sku: newSku });
    setSkuManuallyEdited(false);
  };

  const handleSkuChange = (newSku: string) => {
    setFormData({ ...formData, sku: newSku });
    setSkuManuallyEdited(true);
  };

  // Helper function to generate barcodes after sync if order is verified
  const handleBarcodeGenerationAfterSync = async (barcodesToGenerate: Array<{ sku: string; itemId: string }>, orderStatus: PurchaseOrderStatus) => {
    if (orderStatus !== 'Verified') return;
    
    for (const barcodeInfo of barcodesToGenerate) {
      if (barcodeInfo.itemId) {
        // Item already exists, generate barcode immediately
        generateBarcodeForInventoryItem(barcodeInfo.sku, updateInventoryItem, barcodeInfo.itemId).catch(err => {
          console.error('Error generating barcode:', err);
        });
      } else {
        // Item was just created, find it by SKU
        // Try multiple times with increasing delays to handle async state updates
        let attempts = 0;
        const maxAttempts = 5;
        const findAndGenerateBarcode = () => {
          const newItem = inventory.find(item => item.sku === barcodeInfo.sku);
          if (newItem) {
            generateBarcodeForInventoryItem(barcodeInfo.sku, updateInventoryItem, newItem.id).catch(err => {
              console.error('Error generating barcode:', err);
            });
          } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(findAndGenerateBarcode, 200 * attempts); // Exponential backoff
          } else {
            console.warn(`Could not find inventory item with SKU ${barcodeInfo.sku} for barcode generation`);
          }
        };
        setTimeout(findAndGenerateBarcode, 100);
      }
    }
  };

  const resolveSupplierClaimStatus = (
    quantityNotReceived: number,
    previous?: PurchaseOrder['supplierClaimStatus']
  ): PurchaseOrder['supplierClaimStatus'] => {
    if (quantityNotReceived > 0) return 'pending';
    if (previous === 'resolved') return 'resolved';
    return 'none';
  };

  const openVerificationModalForOrder = useCallback(
    (
      order: PurchaseOrder,
      opts?: {
        fromScanner?: boolean;
        orderData?: Partial<PurchaseOrder>;
        isEditing?: boolean;
        updatedOrder?: PurchaseOrder;
        previousSku?: string;
      }
    ) => {
      const prog = getScanProgress(order);
      setVerificationData({
        order,
        orderData: opts?.orderData,
        isEditing: opts?.isEditing,
        updatedOrder: opts?.updatedOrder,
        previousSku: opts?.previousSku,
        fromScanner: opts?.fromScanner,
      });
      if (opts?.fromScanner) {
        setVerificationQuantity(order.quantity.toString());
        setVerificationQuantityGood(prog.scanned.toString());
        setVerificationQuantityProblem('0');
        setVerificationQuantityNotReceived('0');
      } else if (opts?.isEditing) {
        setVerificationQuantity(order.quantityReceived?.toString() || order.quantity.toString());
        setVerificationQuantityGood(
          order.quantityGood?.toString() || order.quantityReceived?.toString() || order.quantity.toString()
        );
        setVerificationQuantityProblem(order.quantityProblem?.toString() || '0');
        setVerificationQuantityNotReceived(order.quantityNotReceived?.toString() || '0');
      } else {
        setVerificationQuantity(order.quantity.toString());
        setVerificationQuantityGood(order.quantityGood?.toString() || order.quantity.toString());
        setVerificationQuantityProblem(order.quantityProblem?.toString() || '0');
        setVerificationQuantityNotReceived(order.quantityNotReceived?.toString() || '0');
      }
      setVerificationComment(order.verificationComment || '');
      setVerificationMediaUrls(order.verificationMedia || []);
      setVerificationMedia([]);
      setVerificationModalOpen(true);
    },
    []
  );

  const applyVerificationAllNotReceived = () => {
    if (!verificationData) return;
    const q = verificationData.order.quantity;
    setVerificationQuantity('0');
    setVerificationQuantityGood('0');
    setVerificationQuantityProblem('0');
    setVerificationQuantityNotReceived(String(q));
    if (!verificationComment.trim()) {
      setVerificationComment(
        t('purchaseOrders.notReceivedClaimDefault') ||
          'Mercancía no recibida — reclamación pendiente al proveedor.'
      );
    }
  };

  /** Verificación → Verified + sync inventario (misma lógica que el modal por línea). */
  const completeOrderVerification = async (
    order: PurchaseOrder,
    payload: {
      actualQuantity: number;
      quantityGood: number;
      quantityProblem: number;
      quantityNotReceived: number;
      comment?: string;
      mediaUrls?: string[];
    },
    stockBaselineOrder: PurchaseOrder
  ): Promise<'ok' | 'quantity_mismatch'> => {
    const expectedQuantity = order.quantity;
    const statusUpdate: Partial<PurchaseOrder> = {
      status: 'Verified',
      quantityReceived: payload.actualQuantity,
      quantityGood: payload.quantityGood,
      quantityProblem: payload.quantityProblem,
      quantityNotReceived: payload.quantityNotReceived,
      verificationComment: payload.comment || undefined,
      verificationMedia: payload.mediaUrls && payload.mediaUrls.length > 0 ? payload.mediaUrls : undefined,
      supplierClaimStatus: resolveSupplierClaimStatus(
        payload.quantityNotReceived,
        order.supplierClaimStatus
      ),
      ...scanProgressClearUpdate(),
    };
    if (!order.receivedDate) {
      statusUpdate.receivedDate = new Date();
    }
    if (!order.verifiedDate) {
      statusUpdate.verifiedDate = new Date();
    }

    if (payload.actualQuantity !== expectedQuantity) {
      const difference = payload.actualQuantity - expectedQuantity;
      const diffText =
        difference > 0
          ? `+${difference} ${t('purchaseOrders.more')}`
          : `${Math.abs(difference)} ${t('purchaseOrders.less')}`;
      setQuantityMismatchData({
        expected: expectedQuantity,
        received: payload.actualQuantity,
        difference: diffText,
        order,
        statusUpdate,
      });
      setQuantityMismatchConfirmOpen(true);
      return 'quantity_mismatch';
    }

    await updatePurchaseOrder(order.id, statusUpdate);

    let orderWithGoodQuantity: PurchaseOrder = {
      ...order,
      ...statusUpdate,
      quantity: payload.quantityGood,
      quantityReceived: payload.quantityGood,
    } as PurchaseOrder;
    orderWithGoodQuantity = await attachBarcodeToPurchaseOrderIfNeeded(
      orderWithGoodQuantity,
      updatePurchaseOrder,
      inventory,
      undefined,
      purchaseOrders
    );
    await syncPurchaseOrderToInventory(
      orderWithGoodQuantity,
      inventory,
      updateInventoryItem,
      addInventoryItem,
      deleteInventoryItem,
      purchaseOrders,
      undefined,
      true,
      stockBaselineOrder,
      updatePurchaseOrder
    );
    return 'ok';
  };

  const handleAdvanceStatus = (order: PurchaseOrder) => {
    const next = getNextStatus(order.status);
    if (!next) return;
    void handleStatusChange(order, next);
  };

  const registerScanUnit = useCallback(
    async (orderId: string): Promise<ScannerScanResult> => {
      const order = purchaseOrders.find((o) => o.id === orderId);
      if (!order) {
        return { ok: false, message: t('purchaseOrders.scanner.notFound') };
      }
      if (effectivePurchaseOrderStatus(order.status) !== 'Received') {
        return { ok: false, message: t('purchaseOrders.scanner.alreadyComplete') };
      }
      if (!purchaseOrderHasSkusForVerification(order)) {
        return { ok: false, message: t('purchaseOrders.scanner.missingSkus') };
      }

      const prog = getScanProgress(order);
      if (prog.isComplete) {
        return {
          ok: true,
          readyToConfirm: true,
          message: t('purchaseOrders.scanner.confirmLinePrompt'),
          order,
        };
      }

      const nextScanned = Math.min(prog.scanned + 1, prog.expected);
      await updatePurchaseOrder(order.id, {
        quantityScanned: nextScanned,
        lastScannedAt: new Date(),
      });

      const updatedPartial: PurchaseOrder = {
        ...order,
        quantityScanned: nextScanned,
        lastScannedAt: new Date(),
      };

      if (nextScanned >= prog.expected) {
        return {
          ok: true,
          readyToConfirm: true,
          message: t('purchaseOrders.scanner.scanCompleteConfirm'),
          order: updatedPartial,
        };
      }

      return {
        ok: true,
        message: t('purchaseOrders.scanner.unitAdded'),
        order: updatedPartial,
      };
    },
    [purchaseOrders, t, updatePurchaseOrder]
  );

  const undoScanUnit = useCallback(
    async (orderId: string): Promise<ScannerScanResult> => {
      const order = purchaseOrders.find((o) => o.id === orderId);
      if (!order) {
        return { ok: false, message: t('purchaseOrders.scanner.notFound') };
      }
      if (effectivePurchaseOrderStatus(order.status) !== 'Received') {
        return { ok: false, message: t('purchaseOrders.scanner.alreadyComplete') };
      }

      const prog = getScanProgress(order);
      if (prog.scanned <= 0) {
        return { ok: false, message: t('purchaseOrders.scanner.nothingToUndo') };
      }

      const nextScanned = prog.scanned - 1;
      await updatePurchaseOrder(order.id, {
        quantityScanned: nextScanned,
        ...(nextScanned > 0 ? { lastScannedAt: new Date() } : {}),
      });

      const updatedPartial: PurchaseOrder = {
        ...order,
        quantityScanned: nextScanned,
      };

      return {
        ok: true,
        message: (t('purchaseOrders.scanner.unitUndone') || '')
          .replace('{scanned}', String(nextScanned))
          .replace('{expected}', String(prog.expected)),
        order: updatedPartial,
      };
    },
    [purchaseOrders, t, updatePurchaseOrder]
  );

  const confirmScannedLine = useCallback(
    async (orderId: string): Promise<ScannerScanResult> => {
      const order = purchaseOrders.find((o) => o.id === orderId);
      if (!order) {
        return { ok: false, message: t('purchaseOrders.scanner.notFound') };
      }
      if (effectivePurchaseOrderStatus(order.status) !== 'Received') {
        return { ok: false, message: t('purchaseOrders.scanner.alreadyComplete') };
      }
      if (!purchaseOrderHasSkusForVerification(order)) {
        return { ok: false, message: t('purchaseOrders.scanner.missingSkus') };
      }
      const prog = getScanProgress(order);
      if (!prog.isComplete) {
        return { ok: false, message: t('purchaseOrders.scanner.scanMoreBeforeConfirm') };
      }

      setScannerSession(null);
      openVerificationModalForOrder(order, { fromScanner: true });
      return {
        ok: true,
        readyToConfirm: true,
        message: t('purchaseOrders.scanner.openingVerificationModal'),
        order,
      };
    },
    [purchaseOrders, t, openVerificationModalForOrder]
  );

  const processScannerCode = useCallback(
    async (
      invoice: string,
      code: string,
      preferredOrderId?: string
    ): Promise<ScannerScanResult> => {
      if (preferredOrderId) {
        return registerScanUnit(preferredOrderId);
      }

      const matches = findPurchaseOrderLinesByBarcodeScan(purchaseOrders, code, { invoice });
      if (matches.length === 0) {
        return { ok: false, message: t('purchaseOrders.scanner.notFound') };
      }
      if (matches.length === 1) {
        return registerScanUnit(matches[0].id);
      }
      return {
        ok: false,
        message: t('purchaseOrders.scanner.pickLineTitle'),
        pickCandidates: matches,
      };
    },
    [purchaseOrders, registerScanUnit, t]
  );

  const runInvoiceMarkReceived = async (orders: PurchaseOrder[]) => {
    setInvoiceWorkflowBusy(true);
    try {
      for (const order of orders) {
        if (effectivePurchaseOrderStatus(order.status) === 'Ordered') {
          await handleStatusChange(order, 'Received');
        }
      }
    } finally {
      setInvoiceWorkflowBusy(false);
    }
  };

  const openInvoiceBatchVerify = (invoice: string, orders: PurchaseOrder[]) => {
    const eligible = orders.filter((o) => o.status === 'Received');
    const withSkus = eligible.filter(purchaseOrderHasSkusForVerification);
    if (withSkus.length === 0) {
      alert(
        t('purchaseOrders.cannotVerifyInvoiceMissingSkus') ||
          'No hay líneas recibidas con SKU de proveedor e interno completos.'
      );
      return;
    }
    if (withSkus.length < eligible.length) {
      alert(
        t('purchaseOrders.someLinesMissingSkuForVerify') ||
          'Algunas líneas recibidas no tienen SKU completo y se omitirán.'
      );
    }
    setInvoiceBatchVerify({ invoice, orders: withSkus });
  };

  const handleInvoiceBatchVerifyConfirm = async (lines: InvoiceVerifyLineInput[]) => {
    setBatchVerifySubmitting(true);
    let verified = 0;
    try {
      for (const line of lines) {
        const order = purchaseOrders.find((o) => o.id === line.orderId);
        if (!order || order.status !== 'Received') continue;
        if (!purchaseOrderHasSkusForVerification(order)) continue;

        const result = await completeOrderVerification(
          order,
          {
            actualQuantity: line.actualQuantity,
            quantityGood: line.quantityGood,
            quantityProblem: line.quantityProblem,
            quantityNotReceived: line.quantityNotReceived,
            comment: line.comment,
          },
          order
        );
        if (result === 'quantity_mismatch') {
          setInvoiceBatchVerify(null);
          return;
        }
        verified++;
      }
      setInvoiceBatchVerify(null);
      setToastMessage(
        (t('purchaseOrders.invoiceVerifiedSuccess') || '{count} líneas verificadas').replace(
          '{count}',
          String(verified)
        )
      );
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setBatchVerifySubmitting(false);
    }
  };

  const handleVerificationConfirm = async () => {
    if (!verificationData) return;

    const actualQuantity = parseInt(verificationQuantity) || 0;
    const quantityGood = parseInt(verificationQuantityGood) || 0;
    const quantityProblem = parseInt(verificationQuantityProblem) || 0;
    const quantityNotReceived = parseInt(verificationQuantityNotReceived) || 0;
    const comment = verificationComment.trim();
    
    // Validate inputs
    if (isNaN(actualQuantity) || actualQuantity < 0) {
      alert(t('purchaseOrders.invalidQuantity'));
      return;
    }

    // Validate that quantities add up correctly
    const totalAccounted = quantityGood + quantityProblem + quantityNotReceived;
    if (totalAccounted !== actualQuantity) {
      alert(t('purchaseOrders.quantitiesMustMatch') || `Quantities must add up: Good (${quantityGood}) + Problems (${quantityProblem}) + Not Received (${quantityNotReceived}) = ${totalAccounted}, but Total Received = ${actualQuantity}`);
      return;
    }

    const poForSku = purchaseOrderSnapshotForSkuGate(verificationData);
    if (!purchaseOrderHasSkusForVerification(poForSku)) {
      alert(
        t('purchaseOrders.cannotVerifyMissingSkus') ||
          'No se puede verificar: falta el SKU del proveedor y/o el SKU interno. Complételos en la orden antes de verificar.'
      );
      return;
    }

    const order = verificationData.order;
    const expectedQuantity = order.quantity;
    
    // Upload media files if any
    let mediaUrls: string[] = [...verificationMediaUrls];
    if (verificationMedia.length > 0) {
      setUploadingMedia(true);
      try {
        const { uploadMultipleFiles } = await import('../services/storageService');
        const timestamp = Date.now();
        const uploadedUrls = await uploadMultipleFiles(
          verificationMedia,
          `verification/${order.id}/${timestamp}/`
        );
        mediaUrls = [...verificationMediaUrls, ...uploadedUrls];
      } catch (error) {
        console.error('Error uploading media:', error);
        alert(t('purchaseOrders.mediaUploadError') || 'Error uploading media files. Please try again.');
        setUploadingMedia(false);
        return;
      }
      setUploadingMedia(false);
    }

    // Close modal first (capture baseline before clearing — used for inventory stock delta)
    const data = verificationData;
    // Always use `order`: the row as it was when the modal opened. `updatedOrder` (form→verify flow)
    // is already merged with status Verified + form fields before quantities are confirmed, which
    // made baseline look "verified" and zeroed stock delta — so inventory never updated/created.
    const stockBaselineOrder = data.order;
    setVerificationModalOpen(false);
    setVerificationData(null);
    setVerificationQuantity('');
    setVerificationQuantityGood('');
    setVerificationQuantityProblem('');
    setVerificationQuantityNotReceived('');
    setVerificationComment('');
    setVerificationMedia([]);
    setVerificationMediaUrls([]);

    // Edit verification only (e.g. "Edit verification" on a verified order) — not full form submit
    if (data.isEditing && data.updatedOrder && data.orderData == null) {
      const updateData: Partial<PurchaseOrder> = {
        quantityReceived: actualQuantity,
        quantityGood: quantityGood,
        quantityProblem: quantityProblem,
        quantityNotReceived: quantityNotReceived,
        verificationComment: comment || undefined,
        verificationMedia: mediaUrls.length > 0 ? mediaUrls : undefined,
        supplierClaimStatus: resolveSupplierClaimStatus(
          quantityNotReceived,
          data.updatedOrder.supplierClaimStatus
        ),
      };
      
      await updatePurchaseOrder(data.updatedOrder.id, updateData);

      let mergedPo: PurchaseOrder = {
        ...data.updatedOrder,
        ...updateData,
      } as PurchaseOrder;
      mergedPo = await attachBarcodeToPurchaseOrderIfNeeded(
        mergedPo,
        updatePurchaseOrder,
        inventory,
        undefined,
        purchaseOrders
      );

      await syncPurchaseOrderToInventory(
        mergedPo,
        inventory,
        updateInventoryItem,
        addInventoryItem,
        deleteInventoryItem,
        purchaseOrders,
        undefined,
        true,
        stockBaselineOrder,
        updatePurchaseOrder
      );
      return;
    } else if (data.isEditing && data.orderData && data.updatedOrder) {
      // Editing through form submission flow
      const orderData = data.orderData;
      const updatedOrder = data.updatedOrder;
      
      // Store verification data
      orderData.quantityReceived = actualQuantity;
      orderData.quantityGood = quantityGood;
      orderData.quantityProblem = quantityProblem;
      orderData.quantityNotReceived = quantityNotReceived;
      orderData.verificationComment = comment || undefined;
      orderData.verificationMedia = mediaUrls.length > 0 ? mediaUrls : undefined;
      orderData.supplierClaimStatus = resolveSupplierClaimStatus(
        quantityNotReceived,
        updatedOrder.supplierClaimStatus
      );
      
      // Warn if total quantity doesn't match expected
      if (actualQuantity !== expectedQuantity) {
        const difference = actualQuantity - expectedQuantity;
        const diffText = difference > 0 ? `+${difference} ${t('purchaseOrders.more')}` : `${Math.abs(difference)} ${t('purchaseOrders.less')}`;
        
        setQuantityMismatchData({
          expected: expectedQuantity,
          received: actualQuantity,
          difference: diffText,
          order: updatedOrder,
          orderData,
          previousSku: data.previousSku
        });
        setQuantityMismatchConfirmOpen(true);
        return;
      }
      
      await updatePurchaseOrder(updatedOrder.id, orderData);
      const previousSku = data.previousSku;
      let orderWithGoodQuantity: PurchaseOrder = {
        ...updatedOrder,
        ...orderData,
        quantity: quantityGood,
        quantityReceived: quantityGood,
      } as PurchaseOrder;
      orderWithGoodQuantity = await attachBarcodeToPurchaseOrderIfNeeded(
        orderWithGoodQuantity,
        updatePurchaseOrder,
        inventory,
        undefined,
        purchaseOrders
      );
      await syncPurchaseOrderToInventory(
        orderWithGoodQuantity,
        inventory,
        updateInventoryItem,
        addInventoryItem,
        deleteInventoryItem,
        purchaseOrders,
        previousSku,
        true,
        stockBaselineOrder,
        updatePurchaseOrder
      );
      resetForm();
    } else {
      await completeOrderVerification(
        order,
        {
          actualQuantity,
          quantityGood,
          quantityProblem,
          quantityNotReceived,
          comment: comment || undefined,
          mediaUrls,
        },
        stockBaselineOrder
      );
    }
  };

  const handleStatusChange = async (order: PurchaseOrder, newStatus: PurchaseOrderStatus) => {
    const oldStatus = effectivePurchaseOrderStatus(order.status);

    if (oldStatus === newStatus) {
      return;
    }
    
    // SAFEGUARD: Prevent moving backwards from Verified without confirmation
    if (oldStatus === 'Verified' && newStatus !== 'Verified') {
      const quantityToRemove = order.quantityReceived || order.quantity;
      const updatedOrder = { ...order, status: newStatus };
      const statusUpdateData: Partial<PurchaseOrder> = { status: newStatus };
      setStatusChangeData({ oldStatus, newStatus, order, updatedOrder, orderData: statusUpdateData });
      setStatusChangeConfirmOpen(true);
        return; // Wait for confirmation
      }
      
    const statusUpdate: Partial<PurchaseOrder> = { status: newStatus };
    
    // Add timestamp dates
    if (newStatus === 'Received' || newStatus === 'Verified') {
      if (!order.receivedDate) {
        statusUpdate.receivedDate = new Date();
      }
    }
    if (newStatus === 'Verified') {
      if (!order.verifiedDate) {
        statusUpdate.verifiedDate = new Date();
      }
    }
    
    // VERIFICATION: When moving to Verified, show modal for actual quantity received
    if (oldStatus !== 'Verified' && newStatus === 'Verified') {
      if (!purchaseOrderHasSkusForVerification(order)) {
        alert(
          t('purchaseOrders.cannotVerifyMissingSkus') ||
            'No se puede verificar: falta el SKU del proveedor y/o el SKU interno. Complételos en la orden antes de verificar.'
        );
        return;
      }
      openVerificationModalForOrder(order, { orderData: statusUpdate });
      return; // Wait for modal confirmation
    }
    
    const stockBaselineOrder = order;
    await updatePurchaseOrder(order.id, statusUpdate);

    let updatedOrder: PurchaseOrder = { ...order, ...statusUpdate } as PurchaseOrder;
    if (updatedOrder.sku) {
      updatedOrder = await attachBarcodeToPurchaseOrderIfNeeded(
        updatedOrder,
        updatePurchaseOrder,
        inventory,
        undefined,
        purchaseOrders
      );
    }
    await syncPurchaseOrderToInventory(
      updatedOrder,
      inventory,
      updateInventoryItem,
      addInventoryItem,
      deleteInventoryItem,
      purchaseOrders,
      undefined,
      updatedOrder.status === 'Verified',
      stockBaselineOrder,
      updatePurchaseOrder
    );
  };

  const handleBulkStatusChange = async (orderIds: string[], newStatus: PurchaseOrderStatus) => {
    const ordersToUpdate = orderIds
      .map((id) => purchaseOrders.find((o) => o.id === id))
      .filter((order): order is PurchaseOrder => !!order)
      .filter((order) => effectivePurchaseOrderStatus(order.status) !== newStatus);

    if (ordersToUpdate.length === 0) return;

    setBulkStatusChangeBusy(true);
    try {
      const statusUpdates = ordersToUpdate.map((order) => {
        const statusUpdate: Partial<PurchaseOrder> = { status: newStatus };
        if ((newStatus === 'Received' || newStatus === 'Verified') && !order.receivedDate) {
          statusUpdate.receivedDate = new Date();
        }
        return { id: order.id, orderUpdate: statusUpdate };
      });

      await updatePurchaseOrdersBulk(statusUpdates);

      const baselineById = new Map(ordersToUpdate.map((order) => [order.id, order]));
      const updatedOrders = ordersToUpdate.map(
        (order) =>
          ({
            ...order,
            ...statusUpdates.find((entry) => entry.id === order.id)!.orderUpdate,
          }) as PurchaseOrder
      );

      for (let i = 0; i < updatedOrders.length; i++) {
        let order = updatedOrders[i]!;
        const stockBaselineOrder = baselineById.get(order.id);
        if (order.sku) {
          order = await attachBarcodeToPurchaseOrderIfNeeded(
            order,
            updatePurchaseOrder,
            inventory,
            undefined,
            purchaseOrders
          );
          updatedOrders[i] = order;
        }
        await syncPurchaseOrderToInventory(
          order,
          inventory,
          updateInventoryItem,
          addInventoryItem,
          deleteInventoryItem,
          purchaseOrders,
          undefined,
          order.status === 'Verified',
          stockBaselineOrder,
          updatePurchaseOrder
        );
      }

      setToastMessage(
        t('purchaseOrders.statusChangedSuccessfully').replace('{count}', String(ordersToUpdate.length))
      );
      setTimeout(() => setToastMessage(null), 4000);
    } catch (error) {
      console.error('Bulk status change failed:', error);
      alert(t('purchaseOrders.bulkStatusChangeError'));
    } finally {
      setBulkStatusChangeBusy(false);
    }
  };

  const handlePoRowActivate = (order: PurchaseOrder, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, select, option, label')) return;
    setPoLineDetailOrder(order);
  };

  const handleEdit = (order: PurchaseOrder) => {
    setEditingOrder(order);
    setOriginalSku(order.sku); // Track original SKU for sync purposes
    setSelectedInventoryId(''); // Reset selector for fresh linking option
    setSkuManuallyEdited(false); // Reset SKU manual edit flag to allow regeneration
    setExchangeRateManuallySet(true); // Preserve existing exchange rate when editing
    setSupplierInputMode('select'); // Reset to select mode when editing
    setSupplierNameInput(''); // Clear text input
    setFormData({
      invoice: order.invoice,
      invoiceLink: order.invoiceLink,
      supplierId: order.supplierId,
      supplierSKU: order.supplierSKU,
      description: order.description,
      sku: order.sku,
      category: order.category,
      line: order.line,
      images: order.images || [],
      quantity: order.quantity,
      currency: order.currency,
      costPerUnit: order.costPerUnit,
      discountPerUnit: order.discountPerUnit,
      exchangeRate: order.exchangeRate,
      purchaseDate: order.purchaseDate.toISOString().split('T')[0],
      status: order.status || 'Ordered',
    });
    setIsFormOpen(true);
  };

  const handleEditVerification = (order: PurchaseOrder) => {
    openVerificationModalForOrder(order, { isEditing: true, updatedOrder: order });
  };

  // Get unique invoices that have at least one unverified order
  const getUnverifiedInvoices = () => {
    const invoiceMap = new Map<string, { orders: PurchaseOrder[], hasUnverified: boolean }>();
    
    purchaseOrders.forEach(order => {
      if (!invoiceMap.has(order.invoice)) {
        invoiceMap.set(order.invoice, { orders: [], hasUnverified: false });
      }
      const invoiceData = invoiceMap.get(order.invoice)!;
      invoiceData.orders.push(order);
      if (order.status !== 'Verified') {
        invoiceData.hasUnverified = true;
      }
    });
    
    // Return only invoices with unverified orders
    const unverifiedInvoices: { invoice: string, orders: PurchaseOrder[] }[] = [];
    invoiceMap.forEach((data, invoice) => {
      if (data.hasUnverified) {
        unverifiedInvoices.push({ invoice, orders: data.orders });
      }
    });
    
    return unverifiedInvoices.sort((a, b) => a.invoice.localeCompare(b.invoice));
  };

  const handleDownloadVerificationSheet = async (invoiceNumber: string) => {
    try {
      // Get all orders for this invoice
      const invoiceOrders = purchaseOrders.filter(order => order.invoice === invoiceNumber);
      if (invoiceOrders.length === 0) {
        alert(t('purchaseOrders.noOrdersFound') || 'No orders found for this invoice.');
        return;
      }
      
      // Get supplier (should be same for all orders in invoice)
      const supplierId = invoiceOrders[0].supplierId;
      const supplier = suppliers.find(s => s.id === supplierId);
      
      await generatePOVerificationPDF({
        orders: invoiceOrders,
        supplier: supplier || null,
        invoiceNumber,
      });

      // Show toast notification
      setToastMessage(t('purchaseOrders.verificationPDFGenerated') || 'Verification PDF generated successfully.');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error) {
      console.error('Error generating verification sheet:', error);
      alert(t('purchaseOrders.verificationSheetError') || 'Error generating verification sheet. Please try again.');
    }
  };

  const totals = calculateTotals();

  // Sorting and filtering logic
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedOrders = purchaseOrders
    .filter(order => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          order.invoice.toLowerCase().includes(query) ||
          order.description.toLowerCase().includes(query) ||
          order.sku.toLowerCase().includes(query) ||
          order.supplierSKU.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      
      // Status filter
      if (!orderMatchesStatusFilter(order, filterStatus)) {
        return false;
      }
      
      // Supplier filter
      if (filterSupplier !== 'all' && order.supplierId !== filterSupplier) {
        return false;
      }
      
      // Duplicate SKU filter
      if (filterDuplicateSku && !duplicateSkus.includes(order.sku)) {
        return false;
      }
      
      // Category filter (unifica EN/ES)
      if (filterCategory !== 'all') {
        const oc = displayCategory(order.category);
        const want = displayCategory(filterCategory);
        if (oc !== want) return false;
      }

      if (filterLine !== 'all') {
        const ol = displayLine(order.line || '');
        const wantL = displayLine(filterLine);
        if (ol !== wantL) return false;
      }
      
      // Quantity issues filter (problems or missing items)
      if (filterQuantityIssues !== 'all') {
        const hasProblems = (order.quantityProblem || 0) > 0;
        const hasMissing = (order.quantityNotReceived || 0) > 0;
        
        if (filterQuantityIssues === 'problems' && !hasProblems) {
          return false;
        }
        if (filterQuantityIssues === 'missing' && !hasMissing) {
          return false;
        }
        if (filterQuantityIssues === 'both' && !hasProblems && !hasMissing) {
          return false;
        }
        if (filterQuantityIssues === 'claim') {
          const claimPending =
            order.supplierClaimStatus === 'pending' || (order.status === 'Verified' && hasMissing);
          if (!claimPending) return false;
        }
        if (filterQuantityIssues === 'scanning' && !hasActiveScanProgress(order)) {
          return false;
        }
      }
      
      return true;
    })
    .sort((a, b) => {
      let aValue: string | number | Date;
      let bValue: string | number | Date;
      
      switch (sortField) {
        case 'invoice':
          aValue = a.invoice.toLowerCase();
          bValue = b.invoice.toLowerCase();
          break;
        case 'supplier':
          const supplierA = suppliers.find(s => s.id === a.supplierId)?.name || '';
          const supplierB = suppliers.find(s => s.id === b.supplierId)?.name || '';
          aValue = supplierA.toLowerCase();
          bValue = supplierB.toLowerCase();
          break;
        case 'description':
          aValue = a.description.toLowerCase();
          bValue = b.description.toLowerCase();
          break;
        case 'sku':
          aValue = a.sku.toLowerCase();
          bValue = b.sku.toLowerCase();
          break;
        case 'quantity':
          aValue = a.quantity;
          bValue = b.quantity;
          break;
        case 'status':
          const statusOrder = { Ordered: 1, Received: 2, Verified: 3 };
          const aStatus = effectivePurchaseOrderStatus(a.status);
          const bStatus = effectivePurchaseOrderStatus(b.status);
          aValue = statusOrder[aStatus] || 0;
          bValue = statusOrder[bStatus] || 0;
          break;
        case 'landedCost':
          aValue = a.landedCostPerUnit;
          bValue = b.landedCostPerUnit;
          break;
        case 'purchaseDate':
          aValue = new Date(a.purchaseDate).getTime();
          bValue = new Date(b.purchaseDate).getTime();
          break;
        case 'createdAt':
        default:
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
      }
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  // Group orders by selected field
  const getGroupedOrders = () => {
    if (!groupByField) {
      return {};
    }

    const groups: { [key: string]: PurchaseOrder[] } = {};
    filteredAndSortedOrders.forEach(order => {
      let groupKey: string;
      
      switch (groupByField) {
        case 'invoice':
          groupKey = order.invoice;
          break;
        case 'supplier':
          const supplier = suppliers.find(s => s.id === order.supplierId);
          groupKey = supplier ? supplier.name : 'Unknown Supplier';
          break;
        case 'category':
          groupKey = displayCategory(order.category) || 'No Category';
          break;
        case 'line':
          groupKey = order.line ? displayLine(order.line) : 'No Line';
          break;
        case 'status':
          groupKey = order.status;
          break;
        case 'createdAt':
          groupKey = formatDateDMY(new Date(order.createdAt));
          break;
        default:
          groupKey = 'Unknown';
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(order);
    });
    
    return groups;
  };

  const groupedOrders = getGroupedOrders();

  // Confirmation handlers
  const handleDeleteConfirm = async () => {
    if (orderToDelete) {
      try {
        await cleanupInventoryAfterOrderDeletion(
          [orderToDelete.id],
          inventory,
          updateInventoryItem,
          purchaseOrders
        );
        await deletePurchaseOrder(orderToDelete.id);
      } catch (error) {
        console.error('Error deleting purchase order:', error);
        alert(t('purchaseOrders.bulkDelete.deleteError'));
      }
      setOrderToDelete(null);
    }
    setDeleteConfirmOpen(false);
  };

  const handleStatusChangeConfirm = async () => {
    if (!statusChangeData) return;
    
    const { oldStatus, newStatus, order, updatedOrder, orderData, previousSku } = statusChangeData;
    
    // Remove inventory that was previously added
    if (oldStatus === 'Verified' && newStatus !== 'Verified') {
      // Use sync function to remove order from inventory
      await syncPurchaseOrderToInventory(
        updatedOrder,
        inventory,
        updateInventoryItem,
        addInventoryItem,
        deleteInventoryItem,
        purchaseOrders,
        previousSku,
        false,
        order,
        updatePurchaseOrder
      );
    }
    
    // Continue with the form submission or status update
    if (editingOrder && orderData) {
      await updatePurchaseOrder(editingOrder.id, orderData);
      let o: PurchaseOrder = { ...editingOrder, ...orderData } as PurchaseOrder;
      if (o.sku) {
        o = await attachBarcodeToPurchaseOrderIfNeeded(o, updatePurchaseOrder, inventory, undefined, purchaseOrders);
      }
      await syncPurchaseOrderToInventory(
        o,
        inventory,
        updateInventoryItem,
        addInventoryItem,
        deleteInventoryItem,
        purchaseOrders,
        previousSku,
        o.status === 'Verified',
        editingOrder,
        updatePurchaseOrder
      );
      resetForm();
    } else if (orderData) {
      await updatePurchaseOrder(order.id, orderData);

      const quantityToRemove = order.quantityReceived || order.quantity;
      const inventoryItem = inventory.find((item) => item.sku === order.sku);
      if (inventoryItem) {
        const stockUpdate: Partial<InventoryItem> = {};
        stockUpdate.ecuadorStock = Math.max(0, inventoryItem.ecuadorStock - quantityToRemove);
        updateInventoryItem(inventoryItem.id, stockUpdate);
      }

      let o: PurchaseOrder = { ...order, ...orderData } as PurchaseOrder;
      if (o.sku) {
        o = await attachBarcodeToPurchaseOrderIfNeeded(o, updatePurchaseOrder, inventory, undefined, purchaseOrders);
      }
      await syncPurchaseOrderToInventory(
        o,
        inventory,
        updateInventoryItem,
        addInventoryItem,
        deleteInventoryItem,
        purchaseOrders,
        undefined,
        o.status === 'Verified',
        order,
        updatePurchaseOrder
      );
    }
    
    setStatusChangeData(null);
    setStatusChangeConfirmOpen(false);
  };

  const handleQuantityMismatchConfirm = async () => {
    if (!quantityMismatchData) return;
    
    const { order, orderData, previousSku, statusUpdate } = quantityMismatchData;

    const mergedForSku =
      editingOrder && orderData
        ? ({ ...editingOrder, ...orderData } as PurchaseOrder)
        : statusUpdate
          ? ({ ...order, ...statusUpdate } as PurchaseOrder)
          : order;
    if (
      String(mergedForSku.status ?? '').trim().toLowerCase() === 'verified' &&
      !purchaseOrderHasSkusForVerification(mergedForSku)
    ) {
      alert(
        t('purchaseOrders.cannotVerifyMissingSkus') ||
          'No se puede verificar: falta el SKU del proveedor y/o el SKU interno. Complételos en la orden antes de verificar.'
      );
      return;
    }
    
    // Continue with the form submission or status update
    if (editingOrder && orderData) {
      await updatePurchaseOrder(editingOrder.id, orderData);
      let updatedOrder: PurchaseOrder = { ...editingOrder, ...orderData } as PurchaseOrder;
      if (updatedOrder.sku) {
        updatedOrder = await attachBarcodeToPurchaseOrderIfNeeded(
          updatedOrder,
          updatePurchaseOrder,
          inventory,
          undefined,
          purchaseOrders
        );
      }
      await syncPurchaseOrderToInventory(
        updatedOrder,
        inventory,
        updateInventoryItem,
        addInventoryItem,
        deleteInventoryItem,
        purchaseOrders,
        previousSku,
        updatedOrder.status === 'Verified',
        editingOrder,
        updatePurchaseOrder
      );
      resetForm();
    } else if (statusUpdate) {
      await updatePurchaseOrder(order.id, statusUpdate);

      let updatedOrder: PurchaseOrder = { ...order, ...statusUpdate } as PurchaseOrder;
      if (updatedOrder.sku) {
        updatedOrder = await attachBarcodeToPurchaseOrderIfNeeded(
          updatedOrder,
          updatePurchaseOrder,
          inventory,
          undefined,
          purchaseOrders
        );
      }
      await syncPurchaseOrderToInventory(
        updatedOrder,
        inventory,
        updateInventoryItem,
        addInventoryItem,
        deleteInventoryItem,
        purchaseOrders,
        undefined,
        updatedOrder.status === 'Verified',
        order,
        updatePurchaseOrder
      );
    }
    
    setQuantityMismatchData(null);
    setQuantityMismatchConfirmOpen(false);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortDirection === 'asc' ? (
      <svg className="w-4 h-4 text-[#515151]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-[#515151]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold text-gray-900">{t('purchaseOrders.title')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('purchaseOrders.subtitle')}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 sm:justify-end sm:gap-3">
          {/* Verification Sheet Button */}
          <div className="relative shrink-0">
            <button
              onClick={() => {
                const unverifiedInvoices = getUnverifiedInvoices();
                if (unverifiedInvoices.length === 0) {
                  alert(t('purchaseOrders.allOrdersVerified') || 'All purchase orders are already verified.');
                  return;
                }
                setIsPOVerificationModalOpen(true);
              }}
              className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-all duration-200 hover:bg-blue-100 hover:shadow-md"
            >
              <svg className="size-4 shrink-0 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>{t('purchaseOrders.downloadVerificationSheet')}</span>
            </button>
          </div>
          
          <button
            type="button"
            title={t('purchaseOrders.scanner.openButton')}
            onClick={() => setScannerSession({})}
            className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 transition-all hover:bg-indigo-100 hover:shadow-md"
          >
            <svg className="size-4 shrink-0 flex-none text-indigo-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 16h4.01M8 16H4.01M8 12H4.01M8 8H4.01M12 8h4.01" />
            </svg>
            <span className="hidden xl:inline">{t('purchaseOrders.scanner.openButton')}</span>
            <span className="xl:hidden">
              {tf('purchaseOrders.scannerOpenShort', 'Escáner')}
            </span>
          </button>

          {/* Print Barcodes Button */}
          <div className="relative shrink-0">
            <button
              type="button"
              title={t('purchaseOrders.printBarcodes') || 'Print Barcodes'}
              onClick={() => {
                setIsBarcodePrintModalOpen(true);
              }}
              className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 transition-all duration-200 hover:bg-green-100 hover:shadow-md"
            >
              <svg className="size-4 shrink-0 flex-none text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span className="hidden xl:inline">{t('purchaseOrders.printBarcodes') || 'Print Barcodes'}</span>
              <span className="xl:hidden">
                {tf('purchaseOrders.printBarcodesShort', 'Imprimir códigos')}
              </span>
            </button>
          </div>
          
          {/* Bulk Operations Dropdown */}
          <div className="relative shrink-0">
          <button
              type="button"
              onClick={() => setShowBulkDropdown(!showBulkDropdown)}
              className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-gray-300 px-3 py-2 text-sm transition-all duration-200 hover:bg-gray-50 hover:shadow-md"
            >
              <svg className="size-4 shrink-0 flex-none text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <span className="text-sm font-medium text-gray-700">{t('purchaseOrders.bulk')}</span>
              <svg className="size-4 shrink-0 flex-none text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
          </button>

            {showBulkDropdown && (
              <div ref={bulkDropdownRef} className="absolute top-full right-0 mt-2 min-w-[15rem] w-60 bg-white border border-gray-200 rounded-xl shadow-lg z-10">
                <div className="p-2">
          <button
                    onClick={() => {
                      setBulkImportEditId(null);
                      setIsBulkImportOpen(true);
                      setShowBulkDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-gray-700 hover:bg-gray-50"
                  >
                    <svg className="w-4 h-4 text-[#515151]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                    {t('purchaseOrders.importOrders')}
                  </button>
                  <button
                    type="button"
                    title={t('purchaseOrders.editBulkImport')}
                    onClick={() => {
                      setShowBulkDropdown(false);
                      setBulkImportEditPickerOpen(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-gray-700 hover:bg-gray-50"
                  >
                    <svg className="w-4 h-4 shrink-0 text-[#515151]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span className="text-left leading-snug">{t('purchaseOrders.editBulkImport')}</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsBulkStatusChangeOpen(true);
                      setShowBulkDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-blue-600 hover:bg-blue-50"
                  >
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    {t('purchaseOrders.changeStatus') || 'Change Status'}
                  </button>
                  <button
                    onClick={() => {
                      setIsBulkDeleteOpen(true);
                      setShowBulkDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-red-600 hover:bg-red-50"
                  >
                    <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    {t('purchaseOrders.deleteOrders')}
          </button>
        </div>
              </div>
            )}
      </div>

          <button
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-[#515151] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#000000] hover:shadow-md active:scale-95"
          >
            <svg className="size-4 shrink-0 flex-none text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>{t('purchaseOrders.addOrder')}</span>
          </button>
        </div>
      </div>
          
      {/* Filtro rápido por estado */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500">{t('purchaseOrders.status')}:</span>
        <button
          type="button"
          onClick={() => setFilterStatus('all')}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            filterStatus === 'all'
              ? 'border-[#515151] bg-[#515151] text-white'
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          {t('purchaseOrders.allStatus')}
        </button>
        {PO_ACTIVE_STATUSES.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setFilterStatus(st)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filterStatus === st
                ? 'border-[#515151] bg-[#515151] text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {filterStatus === st ? (
              <span className="h-2 w-2 shrink-0 rounded-full bg-white" aria-hidden />
            ) : (
              <PoStatusIcon status={st} className="h-3.5 w-3.5 shrink-0" />
            )}
            {t(`purchaseOrders.${st === 'Ordered' ? 'statusOrdered' : st === 'Received' ? 'statusReceived' : 'statusVerified'}`)}
          </button>
        ))}
      </div>

      {/* Column Visibility Control */}
      <div className="mt-3 flex items-center justify-end gap-3">
        {/* Filter Button */}
        <div className="relative">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm ${
              showFilters ? 'bg-[#515151] text-white border-[#515151]' : ''
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="text-sm font-medium">{t('purchaseOrders.filters')}</span>
            {(filterStatus !== 'all' || filterSupplier !== 'all' || filterDuplicateSku || filterCategory !== 'all' || filterLine !== 'all' || filterQuantityIssues !== 'all') && (
              <span className="bg-red-100 text-red-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                {[filterStatus !== 'all', filterSupplier !== 'all', filterDuplicateSku, filterCategory !== 'all', filterLine !== 'all', filterQuantityIssues !== 'all'].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {/* Group By Button */}
        <div className="relative">
          <button
            onClick={() => setShowGroupByDropdown(!showGroupByDropdown)}
            className={`flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm ${
              groupByField ? 'bg-[#515151] text-white border-[#515151]' : ''
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="text-sm font-medium">{t('purchaseOrders.groupBy')}</span>
            {groupByField && (
              <span className="bg-red-100 text-red-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                1
          </span>
            )}
          </button>

          {showGroupByDropdown && (
            <div ref={groupByDropdownRef} className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-10">
              <div className="p-4">
                <div className="text-sm font-medium text-gray-700 mb-3">{t('purchaseOrders.groupByField')}</div>
                {groupByField && Object.keys(groupedOrders).length > 0 && (
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => {
                        setExpandedGroups(new Set(Object.keys(groupedOrders)));
                        setShowGroupByDropdown(false);
                      }}
                      className="flex-1 px-3 py-1.5 text-xs bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition-colors"
                    >
                      {t('purchaseOrders.expandAll') || 'Expand All'}
                    </button>
                    <button
                      onClick={() => {
                        setExpandedGroups(new Set());
                        setShowGroupByDropdown(false);
                      }}
                      className="flex-1 px-3 py-1.5 text-xs bg-gray-50 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      {t('purchaseOrders.collapseAll') || 'Collapse All'}
                    </button>
                  </div>
                )}
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setGroupByField('');
                      setShowGroupByDropdown(false);
                      setExpandedGroups(new Set()); // Reset expanded groups when clearing grouping
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      !groupByField ? 'bg-[#515151] text-white' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {t('purchaseOrders.noGrouping')}
                  </button>
                  {getGroupByFields().map(field => (
                    <button
                      key={field.key}
                      onClick={() => {
                        setGroupByField(field.key);
                        setShowGroupByDropdown(false);
                        setExpandedGroups(new Set()); // Reset expanded groups when changing grouping
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        groupByField === field.key ? 'bg-[#515151] text-white' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      {field.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Column Visibility Control */}
        <div className="relative">
          <button
            onClick={() => setShowColumnDropdown(!showColumnDropdown)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm"
          >
            <svg className={`w-4 h-4 ${hiddenColumns.size > 0 ? 'text-gray-400' : 'text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">{t('purchaseOrders.hideFields')}</span>
            {hiddenColumns.size > 0 && (
              <span className="bg-red-100 text-red-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                {hiddenColumns.size}
              </span>
            )}
          </button>
          
          {showColumnDropdown && (
            <div ref={dropdownRef} className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-10">
              <div className="p-4">
                <div className="text-sm font-medium text-gray-700 mb-3">{t('purchaseOrders.columnVisibility')}</div>
                <div className="grid grid-cols-2 gap-3">
                  {getVisibleColumns().map(column => (
                    <div key={column.key} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">{column.label}</span>
                      <button
                        onClick={() => {
                          // Use the exact same click handler that works outside dropdown
                          if (hiddenColumns.has(column.key)) {
                            // Show column
                            setHiddenColumns(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(column.key);
                              return newSet;
                            });
                          } else {
                            // Hide column
                            setHiddenColumns(prev => new Set([...prev, column.key]));
                          }
                        }}
                        className={`toggle-switch relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#515151] focus:ring-offset-2 ${
                          hiddenColumns.has(column.key) ? 'toggle-switch-off' : 'toggle-switch-on'
                        }`}
                      >
                        <span
                          className={`toggle-knob inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
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
                <div className="text-sm font-medium text-gray-700 mb-3">{t('purchaseOrders.search')}</div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder={t('purchaseOrders.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
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

      {/* Expandable Filter Menu */}
        {showFilters && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {/* Status Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('purchaseOrders.status')}</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent text-sm bg-white"
                >
                  <option value="all">{t('purchaseOrders.allStatus')}</option>
                  <option value="Ordered">{t('purchaseOrders.statusOrdered')}</option>
                  <option value="Received">{t('purchaseOrders.statusReceived')}</option>
                  <option value="Verified">{t('purchaseOrders.statusVerified')}</option>
                </select>
              </div>
              
              {/* Supplier Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('purchaseOrders.supplier')}</label>
                <select
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent text-sm bg-white"
                >
                  <option value="all">{t('purchaseOrders.allSuppliers')}</option>
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </div>
              
              {/* Category Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('purchaseOrders.category')}</label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent text-sm bg-white"
                >
                  <option value="all">{t('purchaseOrders.allCategories')}</option>
                  {[...PREDEFINED_CATEGORIES_ES].map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  {existingCategories.length > 0 && (
                    <optgroup label="Custom Categories">
                      {existingCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              
              {/* Line Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('purchaseOrders.line')}</label>
                <select
                  value={filterLine}
                  onChange={(e) => setFilterLine(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent text-sm bg-white"
                >
                  <option value="all">{t('purchaseOrders.allLines')}</option>
                  {[...PREDEFINED_LINES_ES].map(line => (
                    <option key={line} value={line}>{line}</option>
                  ))}
                  {existingLines.length > 0 && (
                    <optgroup label="Custom Lines">
                      {existingLines.map(line => (
                        <option key={line} value={line}>{line}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>
            
            {/* Duplicate SKU Filter */}
            <div className="mt-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={filterDuplicateSku}
                  onChange={(e) => setFilterDuplicateSku(e.target.checked)}
                  className="w-4 h-4 text-[#515151] border-gray-300 rounded focus:ring-[#515151] focus:ring-2"
                />
                <span className="text-gray-700">
                  {t('purchaseOrders.duplicateSkus')} ({duplicateSkus.length} {t('purchaseOrders.sku')}s {t('common.with')} {t('common.multiple')} {t('purchaseOrders.items')})
                </span>
              </label>
            </div>
            
            {/* Quantity Issues Filter */}
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('purchaseOrders.filterQuantityIssues') || 'Quantity Issues'}</label>
              <select
                value={filterQuantityIssues}
                onChange={(e) => setFilterQuantityIssues(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent text-sm bg-white"
              >
                <option value="all">{t('purchaseOrders.allOrders') || 'All Orders'}</option>
                <option value="problems">⚠️ {t('purchaseOrders.withProblems') || 'With Problems'}</option>
                <option value="missing">✗ {t('purchaseOrders.missingItems') || 'Missing Items'}</option>
                <option value="both">⚠️✗ {t('purchaseOrders.problemsOrMissing') || 'Problems or Missing'}</option>
                <option value="claim">📋 {t('purchaseOrders.claimPendingFilter') || 'Reclamación pendiente'}</option>
                <option value="scanning">📷 {t('purchaseOrders.scanInProgressFilter') || 'Escaneo en progreso'}</option>
              </select>
            </div>
            
            {/* Clear filters button */}
            {(searchQuery || filterStatus !== 'all' || filterSupplier !== 'all' || filterDuplicateSku || filterCategory !== 'all' || filterLine !== 'all' || filterQuantityIssues !== 'all') && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setFilterStatus('all');
                    setFilterSupplier('all');
                    setFilterDuplicateSku(false);
                    setFilterCategory('all');
                    setFilterLine('all');
                    setFilterQuantityIssues('all');
                  }}
                  className="text-[#515151] hover:text-[#000000] font-medium text-sm"
                >
                  {t('purchaseOrders.clearAllFilters')}
                </button>
              </div>
            )}
          </div>
      </div>
      )}

      {/* Warning Banner for Orders Needing Review */}
      {purchaseOrders.some(order => order.category.includes('NEEDS REVIEW') || !order.supplierId) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h3 className="text-sm font-semibold text-amber-900">{t('purchaseOrders.ordersNeedReview')}</h3>
            <p className="text-sm text-amber-700 mt-1">
              {t('purchaseOrders.ordersNeedReviewMessage').replace('{count}', purchaseOrders.filter(order => order.category.includes('NEEDS REVIEW') || !order.supplierId).length.toString())}
              {t('purchaseOrders.clickEditToAdd')}
            </p>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 duration-300">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingOrder ? t('purchaseOrders.editPurchaseOrder') : t('purchaseOrders.addNewPurchaseOrder')}
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
            <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-8rem)] p-6 space-y-5">
              {/* Inventory Item Selector - for new orders OR editing orders that need review */}
              {(!editingOrder || (editingOrder && editingOrder.category.includes('NEEDS REVIEW'))) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {editingOrder ? t('purchaseOrders.linkToExistingProduct') : t('purchaseOrders.product')}
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={selectedInventoryId}
                      onChange={(e) => setSelectedInventoryId(e.target.value)}
                      className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent bg-white text-sm"
                    >
                      <option value="">
                        {editingOrder ? t('purchaseOrders.keepCurrentCreateNew') : t('purchaseOrders.selectExistingOrCreate')}
                      </option>
                      {!editingOrder && <option value="new">{t('purchaseOrders.createNewProduct')}</option>}
                      {inventory.length > 0 && <option disabled>──────────</option>}
                      {inventory.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.sku}
                          {item.supplierSKU && formData.supplierSKU && item.supplierSKU === formData.supplierSKU && t('purchaseOrders.supplierSkuMatch')}
                        </option>
                      ))}
                    </select>
                    {selectedInventoryId === 'new' && (
                      <button
                        type="button"
                        onClick={() => setSelectedInventoryId('')}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                      >
                        {t('purchaseOrders.cancel')}
                      </button>
                    )}
                  </div>
                  {selectedInventoryId && selectedInventoryId !== 'new' && !editingOrder && (
                    <p className="text-xs text-gray-500 mt-1.5">
                      {t('purchaseOrders.productDetailsLoaded')}
                    </p>
                  )}
                  {selectedInventoryId && selectedInventoryId !== 'new' && editingOrder && (
                    <p className="text-xs text-green-600 mt-1.5 font-medium">
                      {t('purchaseOrders.willLinkToExisting')}
                    </p>
                  )}
                  {isCreatingNewItem && (
                    <p className="text-xs text-[#515151] mt-1.5 font-medium">
                      {t('purchaseOrders.newProductWillBeAdded')}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">{t('purchaseOrders.invoiceLabel')}</label>
                  <input
                    type="text"
                    required
                    value={formData.invoice}
                    onChange={(e) => setFormData({ ...formData, invoice: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">{t('purchaseOrders.invoiceLink')}</label>
                  <input
                    type="url"
                    value={formData.invoiceLink}
                    onChange={(e) => setFormData({ ...formData, invoiceLink: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">{t('purchaseOrders.supplierLabel')}</label>
                  <div className="flex gap-2">
                  <select
                      value={supplierInputMode === 'select' ? formData.supplierId : ''}
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          setSupplierInputMode('text');
                          setSupplierNameInput('');
                          setFormData({ ...formData, supplierId: '' });
                        } else {
                          setSupplierInputMode('select');
                          setFormData({ ...formData, supplierId: e.target.value });
                        }
                      }}
                      className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent ${supplierInputMode === 'text' ? 'hidden' : ''}`}
                  >
                    <option value="">{t('purchaseOrders.selectSupplier')}</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                      <option value="__new__">{t('purchaseOrders.addNewSupplier') || '+ Add New Supplier'}</option>
                  </select>
                    <input
                      type="text"
                      required
                      value={supplierInputMode === 'text' ? supplierNameInput : ''}
                      onChange={(e) => {
                        setSupplierNameInput(e.target.value);
                        setFormData({ ...formData, supplierId: '' });
                      }}
                      onBlur={(e) => {
                        // If user types a name that matches an existing supplier, switch to select mode
                        const match = suppliers.find(
                          s => s.name.toLowerCase() === e.target.value.trim().toLowerCase()
                        );
                        if (match) {
                          setSupplierInputMode('select');
                          setSupplierNameInput('');
                          setFormData({ ...formData, supplierId: match.id });
                        }
                      }}
                      placeholder={t('purchaseOrders.enterSupplierName') || 'Enter supplier name'}
                      className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent ${supplierInputMode === 'select' ? 'hidden' : ''}`}
                    />
                    {supplierInputMode === 'text' && (
                      <button
                        type="button"
                        onClick={() => {
                          setSupplierInputMode('select');
                          setSupplierNameInput('');
                        }}
                        className="px-3 py-2 text-gray-600 hover:text-gray-800"
                        title={t('purchaseOrders.cancel') || 'Cancel'}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">{t('purchaseOrders.supplierSkuLabel')}</label>
                  <input
                    type="text"
                    value={formData.supplierSKU}
                    onChange={(e) => setFormData({ ...formData, supplierSKU: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                  />
                </div>
              </div>

              {/* Product Details Section */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">
                    {isCreatingNewItem ? t('purchaseOrders.productName') : t('purchaseOrders.descriptionLabel')}
                  </label>
                  <input
                    type="text"
                    required={isCreatingNewItem}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={isCreatingNewItem ? t('purchaseOrders.productNamePlaceholder') : t('purchaseOrders.orderDescription')}
                    disabled={!!(selectedInventoryId && selectedInventoryId !== 'new' && !editingOrder)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">
                      {t('purchaseOrders.categoryLabel')} {(isCreatingNewItem || editingOrder) && '*'}
                    </label>
                    {(selectedInventoryId && selectedInventoryId !== 'new' && !editingOrder) ? (
                      <input
                        type="text"
                        value={formData.category}
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                      />
                    ) : categoryMode === 'select' ? (
                      <select
                        required={isCreatingNewItem || !!editingOrder}
                        value={formData.category}
                        onChange={(e) => {
                          if (e.target.value === '__new__') {
                            setCategoryMode('new');
                            setFormData({ ...formData, category: '' });
                          } else {
                            setFormData({ ...formData, category: e.target.value });
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                      >
                        <option value="">{t('purchaseOrders.select')}</option>
                        {[...PREDEFINED_CATEGORIES_ES].map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                        {existingCategories.length > 0 && (
                          <>
                            <optgroup label={t('purchaseOrders.otherCategories')}>
                        {existingCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                            </optgroup>
                          </>
                        )}
                        <option value="__new__">{t('purchaseOrders.addNew')}</option>
                      </select>
                    ) : (
                      <div className="flex gap-1">
                        <input
                          type="text"
                          required={isCreatingNewItem || !!editingOrder}
                          value={formData.category}
                          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                          placeholder={t('purchaseOrders.newCategory')}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setCategoryMode('select')}
                          className="px-2 text-xs text-gray-600"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">
                      {t('purchaseOrders.lineLabel')} {(isCreatingNewItem || editingOrder) && '*'}
                    </label>
                    {(selectedInventoryId && selectedInventoryId !== 'new' && !editingOrder) ? (
                      <input
                        type="text"
                        value={formData.line}
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                      />
                    ) : lineMode === 'select' ? (
                      <select
                        required={isCreatingNewItem || !!editingOrder}
                        value={formData.line}
                        onChange={(e) => {
                          if (e.target.value === '__new__') {
                            setLineMode('new');
                            setFormData({ ...formData, line: '' });
                          } else {
                            setFormData({ ...formData, line: e.target.value });
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                      >
                        <option value="">{t('purchaseOrders.select')}</option>
                        {[...PREDEFINED_LINES_ES].map(line => (
                          <option key={line} value={line}>{line}</option>
                        ))}
                        {existingLines.length > 0 && (
                          <>
                            <optgroup label={t('purchaseOrders.otherLines')}>
                        {existingLines.map(line => (
                          <option key={line} value={line}>{line}</option>
                        ))}
                            </optgroup>
                          </>
                        )}
                        <option value="__new__">{t('purchaseOrders.addNew')}</option>
                      </select>
                    ) : (
                      <div className="flex gap-1">
                        <input
                          type="text"
                          required={isCreatingNewItem || !!editingOrder}
                          value={formData.line}
                          onChange={(e) => setFormData({ ...formData, line: e.target.value })}
                          placeholder={t('purchaseOrders.newLine')}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setLineMode('select')}
                          className="px-2 text-xs text-gray-600"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">
                      {t('purchaseOrders.skuLabel')} {isCreatingNewItem && '*'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required={isCreatingNewItem || !!editingOrder}
                        value={formData.sku}
                        onChange={(e) => handleSkuChange(e.target.value)}
                        placeholder={isCreatingNewItem ? t('purchaseOrders.auto') : ''}
                        disabled={!!(selectedInventoryId && selectedInventoryId !== 'new' && !editingOrder)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 font-mono text-sm"
                      />
                      {(isCreatingNewItem || editingOrder) && (
                        <button
                          type="button"
                          onClick={handleRegenerateSku}
                          disabled={!formData.category || !formData.line}
                          className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-white hover:border-[#515151] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                          title={t('purchaseOrders.regenerateSkuFromCategory')}
                        >
                          <svg className="w-5 h-5 text-[#515151]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {isCreatingNewItem && formData.category && formData.line && formData.sku && (
                  <p className="text-xs text-gray-500">
                    {t('purchaseOrders.skuWillBe')} {formData.sku}
                  </p>
                )}
                {editingOrder && formData.category && formData.line && (
                  <p className="text-xs text-[#515151]">
                    {t('purchaseOrders.tipUpdateCategory')}
                  </p>
                )}
                {mergedOrderForFormBarcode && (
                  <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('purchaseOrders.barcodeColumn')}
                    </label>
                    <p className="text-xs text-gray-500 mb-3">{t('purchaseOrders.formBarcodeHint')}</p>
                    <PurchaseOrderBarcodeCell
                      variant="block"
                      order={mergedOrderForFormBarcode}
                      purchaseOrders={purchaseOrders}
                      inventory={inventory}
                      updatePurchaseOrder={updatePurchaseOrder}
                      labels={{
                        generate: t('purchaseOrders.generateBarcode'),
                        regenerate: t('purchaseOrders.regenerateBarcode'),
                        alt: t('purchaseOrders.barcodeAlt'),
                        needSku: t('purchaseOrders.lineDetailNeedSku'),
                        failed: t('purchaseOrders.barcodeGenerateFailed'),
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">{t('purchaseOrders.quantityLabel')}</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">{t('purchaseOrders.currency')}</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => {
                      const newCurrency = e.target.value;
                      // When editing, preserve exchange rate even if currency changes
                      // User must manually change exchange rate if they want to update it
                      if (editingOrder) {
                        setFormData({ ...formData, currency: newCurrency });
                        // Keep exchangeRateManuallySet as true to preserve the rate
                      } else {
                        // For new orders, allow auto-update of exchange rate
                        setFormData({ ...formData, currency: newCurrency });
                        setExchangeRateManuallySet(false); // Allow auto-update for new orders
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                  >
                    <option value="USD">USD - US Dollar</option>
                    <option value="COP">COP - Colombian Peso</option>
                    <option value="BRL">BRL - Brazilian Real</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="CNY">CNY - Chinese Yuan</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">{t('purchaseOrders.costPerUnit')}</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.costPerUnit}
                    onChange={(e) => setFormData({ ...formData, costPerUnit: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">{t('purchaseOrders.discountPerUnit')}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.discountPerUnit}
                    onChange={(e) => setFormData({ ...formData, discountPerUnit: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">{t('purchaseOrders.exchangeRateToUsd')}</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={formData.exchangeRate}
                      onChange={(e) => {
                        setFormData({ ...formData, exchangeRate: parseFloat(e.target.value) || 1 });
                        setExchangeRateManuallySet(true);
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (exchangeRates && formData.currency !== 'USD') {
                          const rate = getExchangeRate(formData.currency, 'USD', exchangeRates);
                          setFormData(prev => ({ ...prev, exchangeRate: rate }));
                          setExchangeRateManuallySet(false);
                        } else if (formData.currency === 'USD') {
                          setFormData(prev => ({ ...prev, exchangeRate: 1 }));
                          setExchangeRateManuallySet(false);
                        } else {
                          fetchExchangeRates();
                        }
                      }}
                      disabled={isLoadingRates}
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title={t('purchaseOrders.refreshExchangeRate') || 'Refresh exchange rate'}
                    >
                      {isLoadingRates ? '...' : '↻'}
                    </button>
                  </div>
                  {lastRateUpdate && formData.currency !== 'USD' && (
                    <p className="text-xs text-gray-500 mt-1">
                      {t('purchaseOrders.rateUpdated')} {lastRateUpdate}
                    </p>
                  )}
                  {formData.currency === 'USD' && (
                    <p className="text-xs text-gray-500 mt-1">
                      {t('purchaseOrders.noConversionNeeded') || 'No conversion needed for USD'}
                    </p>
                  )}
                  {formData.currency !== 'USD' && (
                    <p className="text-xs text-blue-600 mt-1">
                      {t('purchaseOrders.rateEditable') || 'You can manually edit the exchange rate'}
                    </p>
                  )}
                </div>
              </div>


              {/* Cost Summary */}
              <div className="bg-white border-2 border-[#515151] rounded-lg p-4">
                <h4 className="font-semibold mb-3 text-[#515151]">{t('purchaseOrders.costSummary')}</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>{t('purchaseOrders.productCost')} ({formData.currency}):</span>
                    <span>{totals.totalCostWithDiscount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>{t('purchaseOrders.productCost')} (USD):</span>
                    <span>${totals.costInUSD.toFixed(2)}</span>
                  </div>
                  <div className="border-t-2 border-gray-200 pt-2 mt-2">
                    <div className="flex justify-between font-semibold text-gray-900 text-base">
                      <span>{t('purchaseOrders.totalCost')}</span>
                      <span>${totals.costInUSD.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="bg-[#515151] text-white rounded-lg p-3 mt-3">
                    <div className="flex justify-between font-semibold">
                      <span>{t('purchaseOrders.costPerUnitLabel')}</span>
                      <span>${(totals.costInUSD / formData.quantity).toFixed(2)}</span>
                    </div>
                    <div className="text-xs mt-1 opacity-90">
                      {t('purchaseOrders.vsSupplierCost')} {formData.currency} {totals.costPerUnitWithDiscount.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">{t('purchaseOrders.purchaseDate')}</label>
                <DateInput
                  required
                  value={formData.purchaseDate}
                  onChange={(purchaseDate) => setFormData({ ...formData, purchaseDate })}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('purchaseOrders.productImagesManaged')}
                </p>
              </div>

            </form>
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 px-6 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all font-medium text-gray-700"
              >
                {t('purchaseOrders.cancel')}
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                className="flex-1 bg-[#515151] hover:bg-[#000000] text-white px-6 py-2.5 rounded-xl transition-all font-medium shadow-sm hover:shadow active:scale-95"
              >
                {editingOrder ? t('purchaseOrders.updatePurchaseOrder') : t('purchaseOrders.addPurchaseOrder')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" key={`table-${Array.from(hiddenColumns).join('-')}`}>
            {!groupByField ? (
              // List view headers
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    #
                  </th>
                  {!hiddenColumns.has('invoice') && (
                <th 
                  onClick={() => handleSort('invoice')}
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-center gap-1">
                    {t('purchaseOrders.invoice')}
                    <SortIcon field="invoice" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('supplier') && (
                <th 
                  onClick={() => handleSort('supplier')}
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-center gap-1">
                    {t('purchaseOrders.supplier')}
                    <SortIcon field="supplier" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('description') && (
                <th 
                  onClick={() => handleSort('description')}
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-center gap-1">
                    {t('purchaseOrders.description')}
                    <SortIcon field="description" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('sku') && (
                <th 
                  onClick={() => handleSort('sku')}
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-center gap-1">
                    {t('purchaseOrders.sku')}
                    <SortIcon field="sku" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('barcode') && (
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('purchaseOrders.barcodeColumn')}
                </th>
                  )}
                  {!hiddenColumns.has('quantity') && (
                <th 
                  onClick={() => handleSort('quantity')}
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-center gap-1">
                    {t('purchaseOrders.quantity')}
                    <SortIcon field="quantity" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('status') && (
                <th 
                  onClick={() => handleSort('status')}
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-center gap-1">
                    {t('purchaseOrders.status')}
                    <SortIcon field="status" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('landedCost') && (
                <th 
                  onClick={() => handleSort('landedCost')}
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-center gap-1">
                    {t('purchaseOrders.costPerUnit')}
                    <SortIcon field="landedCost" />
                  </div>
                </th>
                  )}
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('purchaseOrders.actions')}
                </th>
              </tr>
            </thead>
            ) : (
              // Grouped view headers (no Invoice column)
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    #
                  </th>
                  {!hiddenColumns.has('supplier') && (
                    <th 
                      onClick={() => handleSort('supplier')}
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        {t('purchaseOrders.supplier')}
                        <SortIcon field="supplier" />
                      </div>
                    </th>
                  )}
                  {!hiddenColumns.has('description') && (
                    <th 
                      onClick={() => handleSort('description')}
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        {t('purchaseOrders.description')}
                        <SortIcon field="description" />
                      </div>
                    </th>
                  )}
                  {!hiddenColumns.has('sku') && (
                    <th 
                      onClick={() => handleSort('sku')}
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        {t('purchaseOrders.sku')}
                        <SortIcon field="sku" />
                      </div>
                    </th>
                  )}
                  {!hiddenColumns.has('barcode') && (
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('purchaseOrders.barcodeColumn')}
                    </th>
                  )}
                  {!hiddenColumns.has('quantity') && (
                    <th 
                      onClick={() => handleSort('quantity')}
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                    {t('purchaseOrders.quantity')}
                    <SortIcon field="quantity" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('status') && (
                <th 
                  onClick={() => handleSort('status')}
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-center gap-1">
                    {t('purchaseOrders.status')}
                    <SortIcon field="status" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('landedCost') && (
                <th 
                  onClick={() => handleSort('landedCost')}
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-center gap-1">
                        {t('purchaseOrders.costPerUnit')}
                    <SortIcon field="landedCost" />
                  </div>
                </th>
                  )}
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('purchaseOrders.actions')}
                </th>
              </tr>
            </thead>
            )}
            <tbody className="divide-y divide-gray-100">
              {filteredAndSortedOrders.length === 0 ? (
                <tr>
                  <td colSpan={2 + getVisibleColumnKeys().length} className="px-6 py-12 text-center text-sm text-gray-500">
                    {purchaseOrders.length === 0 
                      ? t('purchaseOrders.noOrdersYet')
                      : t('purchaseOrders.noOrdersMatchFilters')}
                  </td>
                </tr>
              ) : !groupByField ? (
                filteredAndSortedOrders.map((order, index) => {
                  const supplier = suppliers.find(s => s.id === order.supplierId);
                  const needsReview = order.category.includes('NEEDS REVIEW') || !order.supplierId;
                  return (
                    <tr
                      key={order.id}
                      className={`cursor-pointer hover:bg-gray-50 transition-colors ${needsReview ? 'bg-amber-50/30' : ''}`}
                      onClick={(e) => handlePoRowActivate(order, e)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500 font-mono">
                        {index + 1}
                      </td>
                      {!hiddenColumns.has('invoice') && (
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="font-medium text-gray-900">{order.invoice}</span>
                          {needsReview && (
                            <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">
                              ⚠️
                            </span>
                          )}
                        </div>
                      </td>
                      )}
                      {!hiddenColumns.has('supplier') && (
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                        {supplier ? (
                          <button
                            onClick={() => setSelectedSupplier(supplier)}
                            className="text-[#515151] hover:text-[#000000] hover:underline transition-colors font-medium"
                          >
                            {supplier.name}
                          </button>
                        ) : (
                          <span className="text-amber-600 font-medium">{t('purchaseOrders.missingSupplier')}</span>
                        )}
                      </td>
                      )}
                      {!hiddenColumns.has('description') && (
                      <td className="px-6 py-4 text-center text-sm text-gray-700">{order.description}</td>
                      )}
                      {!hiddenColumns.has('sku') && (
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-700">{order.sku}</td>
                      )}
                      {!hiddenColumns.has('barcode') && (
                        <PurchaseOrderBarcodeCell
                          order={order}
                          purchaseOrders={purchaseOrders}
                          inventory={inventory}
                          updatePurchaseOrder={updatePurchaseOrder}
                          labels={{
                            generate: t('purchaseOrders.generateBarcode'),
                            regenerate: t('purchaseOrders.regenerateBarcode'),
                            alt: t('purchaseOrders.barcodeAlt'),
                            needSku: t('purchaseOrders.lineDetailNeedSku'),
                            failed: t('purchaseOrders.barcodeGenerateFailed'),
                          }}
                        />
                      )}
                      {!hiddenColumns.has('quantity') && (
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                        <PurchaseOrderQuantityCell order={order} />
                      </td>
                      )}
                      {!hiddenColumns.has('status') && (
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <div className="flex justify-center">
                          <PurchaseOrderStatusCell
                            order={order}
                            onStatusChange={handleStatusChange}
                            onAdvance={handleAdvanceStatus}
                            onEditVerification={handleEditVerification}
                          />
                        </div>
                      </td>
                      )}
                      {!hiddenColumns.has('landedCost') && (
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="font-medium text-gray-900">${order.landedCostPerUnit.toFixed(2)}</div>
                        <div className="text-xs text-gray-500">{t('purchaseOrders.total')}: ${order.totalLandedCost.toFixed(2)}</div>
                      </td>
                      )}
                      <td className="px-4 py-4 whitespace-nowrap text-center text-sm">
                        <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(order)}
                          className={tableRowActionButtonClass}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          {needsReview ? t('purchaseOrders.completeInfo') : t('purchaseOrders.edit')}
                        </button>
                        {order.status === 'Verified' && (
                          <button
                            onClick={() => handleEditVerification(order)}
                            className={tableRowActionButtonClass}
                            title={t('purchaseOrders.editVerification') || 'Edit Verification'}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {t('purchaseOrders.editVerification') || 'Edit Verification'}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setOrderToDelete(order);
                            setDeleteConfirmOpen(true);
                          }}
                          className={tableRowActionButtonClass}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          {t('purchaseOrders.delete')}
                        </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                // Grouped view by selected field - separate table structure
                Object.entries(groupedOrders).map(([groupKey, orders]) => {
                  const totalOrders = orders.length;
                  const totalValue = orders.reduce((sum, order) => sum + order.totalCostWithDiscount, 0);
                  const hasNeedsReview = orders.some(order => order.category.includes('NEEDS REVIEW') || !order.supplierId);
                  const isExpanded = expandedGroups.has(groupKey);
                  
                  const toggleGroup = () => {
                    setExpandedGroups(prev => {
                      const newSet = new Set(prev);
                      if (newSet.has(groupKey)) {
                        newSet.delete(groupKey);
                      } else {
                        newSet.add(groupKey);
                      }
                      return newSet;
                    });
                  };
                  
                  return (
                    <React.Fragment key={groupKey}>
                      {/* Group Header Row */}
                      <tr className="bg-gray-50 border-t-2 border-gray-200">
                        <td colSpan={2 + getVisibleColumnKeys().length} className="px-6 py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={toggleGroup}
                                className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
                                title={isExpanded ? t('purchaseOrders.collapseGroup') || 'Collapse' : t('purchaseOrders.expandGroup') || 'Expand'}
                              >
                                <svg 
                                  className={`w-5 h-5 text-gray-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                  fill="none" 
                                  viewBox="0 0 24 24" 
                                  stroke="currentColor"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              <h3 className="text-lg font-semibold text-gray-900">{groupKey}</h3>
                              </button>
                              <span className="bg-[#515151] text-white px-2 py-1 rounded-full text-xs font-medium">
                                {totalOrders} {totalOrders !== 1 ? t('purchaseOrders.orders') : t('purchaseOrders.order')}
                              </span>
                              {hasNeedsReview && (
                                <span className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded-full font-medium">
                                  {t('purchaseOrders.needsReview')}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-4">
                              {groupByField === 'invoice' && (
                                <InvoiceStatusActionsBar
                                  invoice={groupKey}
                                  orders={orders}
                                  busy={invoiceWorkflowBusy}
                                  onMarkReceived={() => void runInvoiceMarkReceived(orders)}
                                  onVerifyInvoice={() => openInvoiceBatchVerify(groupKey, orders)}
                                  onOpenScanner={() => setScannerSession({ initialInvoice: groupKey })}
                                />
                              )}
                              <div className="text-right">
                                <div className="text-sm font-medium text-gray-900">${totalValue.toFixed(2)}</div>
                                <div className="text-xs text-gray-500">{t('purchaseOrders.totalValue')}</div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                      
                      {/* Individual Orders - Grouped View Structure (no Invoice column) */}
                      {isExpanded && orders.map((order, orderIndex) => {
                        const supplier = suppliers.find(s => s.id === order.supplierId);
                        const needsReview = order.category.includes('NEEDS REVIEW') || !order.supplierId;
                        return (
                          <tr
                            key={order.id}
                            className={`cursor-pointer hover:bg-gray-50 transition-colors ${needsReview ? 'bg-amber-50/30' : ''}`}
                            onClick={(e) => handlePoRowActivate(order, e)}
                          >
                            {/* Row Number */}
                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500 font-mono">
                              {orderIndex + 1}
                            </td>
                            
                            {/* Supplier */}
                            {!hiddenColumns.has('supplier') && (
                              <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                                <div className="flex items-center justify-center gap-2">
                                  {supplier ? (
                                    <button
                                      onClick={() => setSelectedSupplier(supplier)}
                                      className="text-[#515151] hover:text-[#000000] hover:underline transition-colors font-medium"
                                    >
                                      {supplier.name}
                                    </button>
                                  ) : (
                                    <span className="text-amber-600 font-medium">{t('purchaseOrders.missingSupplier')}</span>
                                  )}
                                  {needsReview && (
                                    <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">
                                      ⚠️
                                    </span>
                                  )}
                                </div>
                              </td>
                            )}
                            
                            {/* Description */}
                            {!hiddenColumns.has('description') && (
                              <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                                {order.description}
                              </td>
                            )}
                            
                            {/* SKU */}
                            {!hiddenColumns.has('sku') && (
                              <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                                {order.sku}
                              </td>
                            )}
                            {!hiddenColumns.has('barcode') && (
                              <PurchaseOrderBarcodeCell
                                order={order}
                                purchaseOrders={purchaseOrders}
                                inventory={inventory}
                                updatePurchaseOrder={updatePurchaseOrder}
                                labels={{
                                  generate: t('purchaseOrders.generateBarcode'),
                                  regenerate: t('purchaseOrders.regenerateBarcode'),
                                  alt: t('purchaseOrders.barcodeAlt'),
                                  needSku: t('purchaseOrders.lineDetailNeedSku'),
                                  failed: t('purchaseOrders.barcodeGenerateFailed'),
                                }}
                              />
                            )}
                            
                            {/* Quantity */}
                            {!hiddenColumns.has('quantity') && (
                              <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                                <PurchaseOrderQuantityCell order={order} />
                              </td>
                            )}
                            
                            {/* Status */}
                            {!hiddenColumns.has('status') && (
                              <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                                <div className="flex justify-center">
                                  <PurchaseOrderStatusCell
                                    order={order}
                                    compact
                                    onStatusChange={handleStatusChange}
                                    onAdvance={handleAdvanceStatus}
                                    onEditVerification={handleEditVerification}
                                  />
                                </div>
                              </td>
                            )}
                            
                            {/* Landed Cost */}
                            {!hiddenColumns.has('landedCost') && (
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="font-medium text-gray-900">${order.landedCostPerUnit.toFixed(2)}</div>
                                <div className="text-xs text-gray-500">{t('purchaseOrders.total')}: ${order.totalLandedCost.toFixed(2)}</div>
                              </td>
                            )}
                            
                            {/* Actions */}
                            <td className="px-4 py-4 whitespace-nowrap text-center text-sm">
                              <div className="flex items-center gap-2 justify-center">
                                <button
                                  onClick={() => handleEdit(order)}
                                  className={tableRowActionButtonClass}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  {needsReview ? t('purchaseOrders.completeInfo') : t('purchaseOrders.edit')}
                                </button>
                                {order.status === 'Verified' && (
                                  <button
                                    onClick={() => handleEditVerification(order)}
                                    className={tableRowActionButtonClass}
                                    title={t('purchaseOrders.editVerification') || 'Edit Verification'}
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {t('purchaseOrders.editVerification') || 'Edit Verification'}
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setOrderToDelete(order);
                                    setDeleteConfirmOpen(true);
                                  }}
                                  className={tableRowActionButtonClass}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  {t('purchaseOrders.delete')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Item Count Indicator */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-3 flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center gap-4">
            <span>
              {t('purchaseOrders.showing')} <span className="font-semibold text-gray-900">{filteredAndSortedOrders.length}</span> {t('purchaseOrders.of')} <span className="font-semibold text-gray-900">{purchaseOrders.length}</span> {t('purchaseOrders.orders')}
            </span>
            {groupByField && (
              <span className="text-gray-400">•</span>
            )}
            {groupByField && (
              <span>
                <span className="font-semibold text-gray-900">{Object.keys(groupedOrders).length}</span> {getGroupByFields().find(f => f.key === groupByField)?.label.toLowerCase() || t('purchaseOrders.groups')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{t('purchaseOrders.rowNumbersReset')}</span>
            <span className="hidden text-gray-400 sm:inline">·</span>
            <span className="hidden max-w-xl sm:inline">{t('purchaseOrders.lineDetailRowHint')}</span>
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedSupplier && (
        <SupplierDetailPanel
          supplier={selectedSupplier}
          onClose={() => setSelectedSupplier(null)}
        />
      )}

      {poLineDetailOrder && (
        <PurchaseOrderLineDetailPanel
          order={poLineDetailOrder}
          purchaseOrders={purchaseOrders}
          inventory={inventory}
          suppliers={suppliers}
          updatePurchaseOrder={updatePurchaseOrder}
          onClose={() => setPoLineDetailOrder(null)}
        />
      )}

      {bulkImportEditPickerOpen && (
        <BulkImportEditPickerModal
          purchaseOrders={purchaseOrders}
          onClose={() => setBulkImportEditPickerOpen(false)}
          onSelect={(id) => {
            setBulkImportEditId(id);
            setIsBulkImportOpen(true);
            setBulkImportEditPickerOpen(false);
          }}
        />
      )}

      {isBulkImportOpen && (
        <BulkImportModal
          key={`bulk-import-${bulkImportEditId ?? 'new'}`}
          editBulkImportId={bulkImportEditId}
          onClose={() => {
            setIsBulkImportOpen(false);
            setBulkImportEditId(null);
          }}
        />
      )}

      {/* PO Verification Modal */}
      {isPOVerificationModalOpen && (
        <POVerificationModal
          purchaseOrders={purchaseOrders}
          suppliers={suppliers}
          onClose={() => setIsPOVerificationModalOpen(false)}
          onSelect={(invoiceNumber) => {
            setIsPOVerificationModalOpen(false);
            handleDownloadVerificationSheet(invoiceNumber);
          }}
        />
      )}

      {/* Bulk Status Change Modal */}
      {isBulkStatusChangeOpen && (
        <BulkStatusChangeModal
          purchaseOrders={purchaseOrders}
          suppliers={suppliers}
          onClose={() => setIsBulkStatusChangeOpen(false)}
          onBulkStatusChange={handleBulkStatusChange}
        />
      )}

      {scannerSession && (
        <POScannerVerificationSession
          purchaseOrders={purchaseOrders}
          suppliers={suppliers}
          initialInvoice={scannerSession.initialInvoice ?? null}
          onClose={() => setScannerSession(null)}
          onProcessScan={processScannerCode}
          onRegisterUnit={registerScanUnit}
          onUndoScanUnit={undoScanUnit}
          onConfirmLine={confirmScannedLine}
        />
      )}

      {invoiceBatchVerify && (
        <InvoiceBatchVerificationModal
          invoice={invoiceBatchVerify.invoice}
          orders={invoiceBatchVerify.orders}
          submitting={batchVerifySubmitting}
          onClose={() => setInvoiceBatchVerify(null)}
          onConfirm={handleInvoiceBatchVerifyConfirm}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <ModalPortal>
          <div
            className="fixed bottom-4 right-4 z-[200] rounded-lg bg-green-600 px-6 py-3 text-white shadow-lg animate-in slide-in-from-bottom-5"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{toastMessage}</span>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Bulk Delete Modal */}
      {isBulkDeleteOpen && (
        <BulkDeleteModal
          purchaseOrders={purchaseOrders}
          suppliers={suppliers}
          onClose={() => setIsBulkDeleteOpen(false)}
          onBulkDelete={async (invoiceNumbers) => {
            const invoiceSet = new Set(invoiceNumbers);
            const ordersSnapshot = purchaseOrders.filter((o) => invoiceSet.has(o.invoice));
            const deletedOrderIds = ordersSnapshot.map((o) => o.id);
            if (deletedOrderIds.length === 0) return;

            setBulkDeleteBusy(true);
            try {
              await cleanupInventoryAfterOrderDeletion(
                deletedOrderIds,
                inventory,
                updateInventoryItem,
                ordersSnapshot
              );
              await deletePurchaseOrdersBulk(deletedOrderIds);
            } catch (error) {
              console.error('Bulk delete failed:', error);
              alert(t('purchaseOrders.bulkDelete.deleteError'));
            } finally {
              setBulkDeleteBusy(false);
            }
          }}
        />
      )}

      {/* Barcode Print Modal */}
      {isBarcodePrintModalOpen && !barcodePrintBusy && (
        <BarcodePrintModal
          purchaseOrders={purchaseOrders}
          inventory={inventory}
          onClose={() => setIsBarcodePrintModalOpen(false)}
          onPrint={async (items) => {
            if (barcodePrintLockRef.current) return;
            barcodePrintLockRef.current = true;
            setIsBarcodePrintModalOpen(false);
            setBarcodePrintBusy(true);
            setBarcodePrintProgress({ phase: 'images', current: 0, total: 0 });

            try {
              const prepared = await prepareBarcodePrintItemsForPdf(
                items as BarcodePrintPdfItem[],
                (phase, current, total) => {
                  setBarcodePrintProgress({ phase, current, total });
                }
              );
              setBarcodePrintProgress({ phase: 'pdf', current: 0, total: 1 });

              const [{ pdf }, { default: BarcodeLabelPDF }] = await Promise.all([
                import('@react-pdf/renderer'),
                import('./BarcodeLabelPDF'),
              ]);

              const blob = await pdf(<BarcodeLabelPDF items={prepared} />).toBlob();
              downloadBarcodePdfBlob(blob);
            } catch (error) {
              console.error('Error generating PDF:', error);
              alert(
                t('purchaseOrders.barcodePrintError') ||
                  'Error generating barcode labels. Please try again.'
              );
            } finally {
              setBarcodePrintBusy(false);
              barcodePrintLockRef.current = false;
            }
          }}
        />
      )}

      {barcodePrintBusy && (
        <BarcodePrintProgress
          phase={barcodePrintProgress.phase}
          current={barcodePrintProgress.current}
          total={barcodePrintProgress.total}
        />
      )}

      {/* Quantity Verification Modal */}
      {verificationModalOpen && verificationData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[min(90vh,calc(100dvh-2rem))] shadow-lg flex flex-col min-h-0 my-auto">
            <div className="px-6 py-5 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {t('purchaseOrders.inventoryVerificationTitle') || 'Inventory Verification'}
                </h3>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                {verificationData.fromScanner
                  ? t('purchaseOrders.inventoryVerificationSubtitleScanner')
                  : t('purchaseOrders.inventoryVerificationSubtitle') ||
                    'Enter the actual quantity received and counted'}
              </p>
            </div>
            
            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1 min-h-0 overscroll-contain">
              {verificationData.fromScanner && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                  {(t('purchaseOrders.scannerConfirmHint') || '')
                    .replace('{scanned}', String(getScanProgress(verificationData.order).scanned))
                    .replace('{expected}', String(verificationData.order.quantity))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyVerificationAllNotReceived}
                  className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
                >
                  {t('purchaseOrders.markAllNotReceived')}
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">{t('purchaseOrders.order') || 'Order'}:</span>
                    <p className="font-medium text-gray-900 mt-1">{verificationData.order.description}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('purchaseOrders.sku')}:</span>
                    <p className="font-mono font-medium text-gray-900 mt-1">{verificationData.order.sku}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('purchaseOrders.expectedQuantity') || 'Expected Quantity'}:</span>
                    <p className="font-medium text-gray-900 mt-1">{verificationData.order.quantity}</p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('purchaseOrders.actualQuantityReceived') || 'Total Quantity Received'} *
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={verificationQuantity}
                    onChange={(e) => {
                      const val = e.target.value;
                      setVerificationQuantity(val);
                      // Auto-update good quantity if it's the same as total
                      if (verificationQuantityGood === verificationQuantity || !verificationQuantityGood) {
                        setVerificationQuantityGood(val);
                      }
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent text-lg font-medium"
                    placeholder={verificationData.order.quantity.toString()}
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('purchaseOrders.enterActualQuantity') || 'Enter the total quantity you physically received and counted'}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('purchaseOrders.quantityGood') || 'Good'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={verificationQuantityGood}
                      onChange={(e) => setVerificationQuantityGood(e.target.value)}
                      className="w-full px-3 py-2 border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t('purchaseOrders.quantityGoodDesc') || 'Goes to inventory'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('purchaseOrders.quantityProblem') || 'Problems'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={verificationQuantityProblem}
                      onChange={(e) => setVerificationQuantityProblem(e.target.value)}
                      className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t('purchaseOrders.quantityProblemDesc') || 'Damaged/needs repair'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('purchaseOrders.quantityNotReceived') || 'Not Received'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={verificationQuantityNotReceived}
                      onChange={(e) => setVerificationQuantityNotReceived(e.target.value)}
                      className="w-full px-3 py-2 border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t('purchaseOrders.quantityNotReceivedDesc') || 'Never received'}
                    </p>
                  </div>
                </div>

                {(() => {
                  const good = parseInt(verificationQuantityGood || '0', 10);
                  const problem = parseInt(verificationQuantityProblem || '0', 10);
                  const notReceived = parseInt(verificationQuantityNotReceived || '0', 10);
                  const total = parseInt(verificationQuantity || '0', 10);
                  const sum = good + problem + notReceived;
                  const isValid = sum === total;
                  const claimPending = notReceived > 0;
                  const breakdownRows = [
                    { key: 'good', label: t('purchaseOrders.quantityGood'), value: good },
                    { key: 'problem', label: t('purchaseOrders.quantityProblem'), value: problem },
                    {
                      key: 'notReceived',
                      label: t('purchaseOrders.quantityNotReceived'),
                      value: notReceived,
                    },
                  ];

                  return (
                    <div className="overflow-hidden rounded-xl border border-gray-200">
                      <div className="border-b border-gray-200 px-4 py-2.5">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                          {t('purchaseOrders.quantityBreakdown')}
                        </p>
                      </div>
                      <dl className="divide-y divide-gray-100">
                        {breakdownRows.map((row) => (
                          <div
                            key={row.key}
                            className="flex items-center justify-between px-4 py-2.5 text-sm"
                          >
                            <dt className="text-gray-600">{row.label}</dt>
                            <dd className="font-semibold tabular-nums text-gray-900">{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                      <div
                        className={`flex items-center justify-between border-t px-4 py-3 text-sm ${
                          isValid ? 'border-gray-200 bg-gray-50' : 'border-red-200 bg-red-50'
                        }`}
                      >
                        <span className={`font-medium ${isValid ? 'text-gray-700' : 'text-red-800'}`}>
                          {isValid
                            ? t('purchaseOrders.quantityBreakdownOk')
                            : t('purchaseOrders.quantityBreakdownError')}
                        </span>
                        <span
                          className={`font-semibold tabular-nums ${isValid ? 'text-gray-900' : 'text-red-700'}`}
                        >
                          {sum} / {total}
                        </span>
                      </div>
                      {claimPending && isValid && (
                        <p className="border-t border-gray-200 px-4 py-2.5 text-xs font-medium text-red-700">
                          {t('purchaseOrders.claimWillBePending')}
                        </p>
                      )}
                    </div>
                  );
                })()}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('purchaseOrders.verificationComment') || 'Verification Comment'} (Optional)
                  </label>
                  <textarea
                    value={verificationComment}
                    onChange={(e) => setVerificationComment(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent resize-none"
                    placeholder={t('purchaseOrders.verificationCommentPlaceholder') || 'Add notes about problems, damages, missing items, etc...'}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('purchaseOrders.verificationCommentDesc') || 'Document any issues, damages, or notes about this verification'}
                  </p>
                  
                  {/* Media Upload Section */}
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('purchaseOrders.verificationMedia') || 'Attach Media'} (Optional)
                    </label>
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          setVerificationMedia(prev => [...prev, ...files]);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent text-sm"
                      />
                      
                      {/* Preview uploaded files */}
                      {(verificationMedia.length > 0 || verificationMediaUrls.length > 0) && (
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          {verificationMediaUrls.map((url, index) => (
                            <div key={`existing-${index}`} className="relative group">
                              {url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                <img src={url} alt={`Media ${index + 1}`} className="w-full h-24 object-cover rounded-lg border border-gray-200" />
                              ) : (
                                <video src={url} className="w-full h-24 object-cover rounded-lg border border-gray-200" />
                              )}
                              <button
                                onClick={() => setVerificationMediaUrls(prev => prev.filter((_, i) => i !== index))}
                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                          {verificationMedia.map((file, index) => (
                            <div key={`new-${index}`} className="relative group">
                              {file.type.startsWith('image/') ? (
                                <img src={URL.createObjectURL(file)} alt={`Preview ${index + 1}`} className="w-full h-24 object-cover rounded-lg border border-gray-200" />
                              ) : (
                                <video src={URL.createObjectURL(file)} className="w-full h-24 object-cover rounded-lg border border-gray-200" />
                              )}
                              <button
                                onClick={() => setVerificationMedia(prev => prev.filter((_, i) => i !== index))}
                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {t('purchaseOrders.verificationMediaDesc') || 'Upload images or videos to document problems, damages, or missing items'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0 bg-white">
              <button
                onClick={() => {
                  setVerificationModalOpen(false);
                  setVerificationData(null);
                  setVerificationQuantity('');
                  setVerificationQuantityGood('');
                  setVerificationQuantityProblem('');
                  setVerificationQuantityNotReceived('');
                  setVerificationComment('');
                  setVerificationMedia([]);
                  setVerificationMediaUrls([]);
                }}
                className="px-4 py-2 rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 font-medium transition-colors"
              >
                {t('common.cancel') || 'Cancel'}
              </button>
              <button
                onClick={handleVerificationConfirm}
                className="px-4 py-2 rounded-xl bg-[#515151] text-white hover:bg-[#000000] font-medium transition-colors"
              >
                {t('purchaseOrders.verify') || 'Verify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title={t('common.deletePurchaseOrders')}
        description={t('purchaseOrders.deleteConfirm')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setOrderToDelete(null);
        }}
      />

      {statusChangeData && (
        <ConfirmDialog
          open={statusChangeConfirmOpen}
          title={t('common.changeStatus')}
          description={
            statusChangeData.oldStatus === 'Verified' && statusChangeData.newStatus !== 'Verified'
              ? t('purchaseOrders.warningVerifiedStatus')
                  .replace('{quantity}', (statusChangeData.order.quantityReceived || statusChangeData.order.quantity).toString())
                  .replace('{destination}', 'Ecuador')
              : t('purchaseOrders.warningVerifiedStatusChange')
                  .replace('{status}', statusChangeData.newStatus)
                  .replace('{quantity}', (statusChangeData.order.quantityReceived || statusChangeData.order.quantity).toString())
                  .replace('{destination}', 'Ecuador')
          }
          confirmText={t('common.confirm')}
          cancelText={t('common.cancel')}
          onConfirm={handleStatusChangeConfirm}
          onCancel={() => {
            setStatusChangeConfirmOpen(false);
            setStatusChangeData(null);
          }}
        />
      )}

      {quantityMismatchData && (
        <ConfirmDialog
          open={quantityMismatchConfirmOpen}
          title={t('common.quantityMismatch')}
          description={t('purchaseOrders.quantityMismatch')
            .replace('{expected}', quantityMismatchData.expected.toString())
            .replace('{received}', quantityMismatchData.received.toString())
            .replace('{difference}', quantityMismatchData.difference)}
          confirmText={t('common.confirm')}
          cancelText={t('common.cancel')}
          onConfirm={handleQuantityMismatchConfirm}
          onCancel={() => {
            setQuantityMismatchConfirmOpen(false);
            setQuantityMismatchData(null);
          }}
        />
      )}

      {bulkDeleteBusy && (
        <div
          className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 backdrop-blur-sm`}
          aria-busy="true"
          aria-live="polite"
          role="status"
        >
          <div className="sasa-modal-panel w-full max-w-sm rounded-2xl px-8 py-7 text-center shadow-xl">
            <div
              className={`mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-t-transparent ${
                darkMode ? 'border-gray-300' : 'border-[#515151]'
              }`}
              aria-hidden
            />
            <p className="text-base font-medium text-gray-900">
              {t('purchaseOrders.bulkDelete.deleting')}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {t('purchaseOrders.bulkDelete.deletingHint')}
            </p>
          </div>
        </div>
      )}

      {bulkStatusChangeBusy && (
        <div
          className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 backdrop-blur-sm`}
          aria-busy="true"
          aria-live="polite"
          role="status"
        >
          <div className="sasa-modal-panel w-full max-w-sm rounded-2xl px-8 py-7 text-center shadow-xl">
            <div
              className={`mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-t-transparent ${
                darkMode ? 'border-gray-300' : 'border-[#515151]'
              }`}
              aria-hidden
            />
            <p className="text-base font-medium text-gray-900">
              {t('purchaseOrders.bulkStatusChanging')}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {t('purchaseOrders.bulkStatusChangingHint')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}