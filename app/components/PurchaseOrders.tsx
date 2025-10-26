'use client';

import { useState, useEffect, useRef } from 'react';
import React from 'react';
import { useInventory } from '../context/InventoryContext';
import { PurchaseOrder, Supplier } from '../types';
import SupplierDetailPanel from './SupplierDetailPanel';
import { generateUniqueSKU } from '../utils/skuGenerator';
import { getExchangeRates, getExchangeRate, formatLastUpdate } from '../utils/currencyApi';
import BulkImportModal from './BulkImportModal';
import BulkDeleteModal from './BulkDeleteModal';
import { syncPurchaseOrderToInventory, cleanupInventoryAfterOrderDeletion } from '../utils/syncUpdates';

export default function PurchaseOrders() {
  const { purchaseOrders, addPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, suppliers, inventory, addInventoryItem, updateInventoryItem, deleteInventoryItem } = useInventory();
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>('');
  const [isCreatingNewItem, setIsCreatingNewItem] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<any>(null);
  const [isLoadingRates, setIsLoadingRates] = useState(false);
  const [lastRateUpdate, setLastRateUpdate] = useState<string>('');
  const [categoryMode, setCategoryMode] = useState<'select' | 'new'>('select');
  const [lineMode, setLineMode] = useState<'select' | 'new'>('select');
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);
  const [originalSku, setOriginalSku] = useState<string>('');
  
  // Sorting and filtering state
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [filterDestination, setFilterDestination] = useState<string>('all');
  const [filterDuplicateSku, setFilterDuplicateSku] = useState<boolean>(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterLine, setFilterLine] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  
  // Column visibility state
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Search dropdown state
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  
  // Group by state
  const [groupByField, setGroupByField] = useState<string>('');
  const [showGroupByDropdown, setShowGroupByDropdown] = useState(false);
  const groupByDropdownRef = useRef<HTMLDivElement>(null);
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  
  // Bulk operations state
  const [showBulkDropdown, setShowBulkDropdown] = useState(false);
  const bulkDropdownRef = useRef<HTMLDivElement>(null);
  
  // Predefined category options
  const predefinedCategories = ['Necklace', 'Ring', 'Bracelet', 'Set', 'Anklet', 'Earring'];
  
  // Predefined line options
  const predefinedLines = ['Gold Plated', 'Gold Filled', 'Sterling Silver'];
  
  // Get visible columns based on current view mode
  const getVisibleColumns = () => {
    const allColumns = [
      { key: 'invoice', label: 'Invoice' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'description', label: 'Description' },
      { key: 'sku', label: 'SKU' },
      { key: 'quantity', label: 'Quantity' },
      { key: 'destination', label: 'Destination' },
      { key: 'status', label: 'Status' },
      { key: 'landedCost', label: 'Cost/Unit' }
    ];
    
    // Return all columns that can be toggled (excluding # and Actions which are always visible)
    return allColumns;
  };

  // Get group by fields
  const getGroupByFields = () => {
    return [
      { key: 'invoice', label: 'Invoice' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'category', label: 'Category' },
      { key: 'line', label: 'Line' },
      { key: 'destination', label: 'Destination' },
      { key: 'status', label: 'Status' },
      { key: 'createdAt', label: 'Date Created' },
    ];
  };

  // Get visible column keys for rendering
  const getVisibleColumnKeys = () => {
    const allColumns = ['invoice', 'supplier', 'description', 'sku', 'quantity', 'destination', 'status', 'landedCost'];
    return allColumns.filter(key => !hiddenColumns.has(key));
  };
  
  // Toggle column visibility
  const toggleColumnVisibility = (columnKey: string) => {
    setHiddenColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(columnKey)) {
        newSet.delete(columnKey);
      } else {
        newSet.add(columnKey);
      }
      return newSet;
    });
  };
  
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
  ].filter(cat => cat && !cat.includes('NEEDS REVIEW') && !predefinedCategories.includes(cat)))].sort();
  
  const existingLines = [...new Set([
    ...inventory.map(item => item.line),
    ...purchaseOrders.map(order => order.line)
  ].filter(line => line && line.trim() !== '' && !predefinedLines.includes(line)))].sort();

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
    destinationStock: 'Ecuador' as 'Ecuador' | 'USA',
    currency: 'USD',
    costPerUnit: 0,
    discountPerUnit: 0,
    exchangeRate: 1,
    purchaseDate: new Date().toISOString().split('T')[0],
    status: 'Ordered' as 'Ordered' | 'Shipped' | 'Received' | 'Verified',
  });

  // Auto-generate SKU when creating new item or when category/line changes during edit
  useEffect(() => {
    if (isCreatingNewItem && formData.category && formData.line && !editingOrder && !skuManuallyEdited) {
      const existingSkus = inventory.map(item => item.sku);
      const newSku = generateUniqueSKU(formData.category, formData.line, existingSkus);
      setFormData(prev => ({ ...prev, sku: newSku }));
    }
    // Auto-regenerate during edit if category/line changed and SKU wasn't manually edited
    if (editingOrder && formData.category && formData.line && !skuManuallyEdited) {
      // Check if category or line changed from original values
      const categoryChanged = formData.category !== editingOrder.category;
      const lineChanged = formData.line !== editingOrder.line;
      
      if (categoryChanged || lineChanged) {
        console.log('SKU regeneration triggered:', {
          originalCategory: editingOrder.category,
          newCategory: formData.category,
          originalLine: editingOrder.line,
          newLine: formData.line,
          categoryChanged,
          lineChanged
        });
        
      const existingSkus = inventory.map(item => item.sku).filter(sku => sku !== editingOrder.sku);
      const newSku = generateUniqueSKU(formData.category, formData.line, existingSkus);
      if (newSku !== formData.sku) {
          console.log('SKU updated from', formData.sku, 'to', newSku);
        setFormData(prev => ({ ...prev, sku: newSku }));
        }
      }
    }
  }, [formData.category, formData.line, isCreatingNewItem, editingOrder, inventory, skuManuallyEdited]);

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
  useEffect(() => {
    if (isFormOpen && !exchangeRates) {
      fetchExchangeRates();
    }
  }, [isFormOpen]);

  // Auto-update exchange rate when currency changes
  useEffect(() => {
    if (exchangeRates && formData.currency !== 'USD') {
      const rate = getExchangeRate(formData.currency, 'USD', exchangeRates);
      if (rate !== formData.exchangeRate) {
        setFormData(prev => ({ ...prev, exchangeRate: rate }));
      }
    }
  }, [formData.currency, exchangeRates]);

  const fetchExchangeRates = async () => {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totals = calculateTotals();
    
    // Prepare dates based on status
    const statusDates: any = {};
    if (formData.status === 'Received' || formData.status === 'Verified') {
      statusDates.receivedDate = editingOrder?.receivedDate || new Date();
    }
    if (formData.status === 'Verified') {
      statusDates.verifiedDate = editingOrder?.verifiedDate || new Date();
    }
    
    const orderData = {
      ...formData,
      ...totals,
      ...statusDates,
      purchaseDate: new Date(formData.purchaseDate),
    };

    if (editingOrder) {
      // Update the purchase order
      const updatedOrder = { ...editingOrder, ...orderData };
      
      // SAFEGUARD: Handle inventory updates based on status changes
      const oldStatus = editingOrder.status;
      const newStatus = formData.status;
      
      // Moving backwards from Verified - remove inventory
      if (oldStatus === 'Verified' && newStatus !== 'Verified') {
        const quantityToRemove = editingOrder.quantityReceived || updatedOrder.quantity;
        const confirmed = confirm(
          `⚠️ WARNING: This order was already verified and added to inventory!\n\n` +
          `Changing status will REMOVE ${quantityToRemove} units from your ${updatedOrder.destinationStock} inventory.\n\n` +
          `Continue?`
        );
        
        if (!confirmed) {
          return; // Cancel the edit
        }
        
        const inventoryItem = inventory.find(item => item.sku === updatedOrder.sku);
        if (inventoryItem) {
          const stockUpdate: any = {};
          if (updatedOrder.destinationStock === 'Ecuador') {
            stockUpdate.ecuadorStock = Math.max(0, inventoryItem.ecuadorStock - quantityToRemove);
          } else {
            stockUpdate.usaStock = Math.max(0, inventoryItem.usaStock - quantityToRemove);
          }
          updateInventoryItem(inventoryItem.id, stockUpdate);
        }
      }
      // Moving TO Verified - prompt for actual quantity and add to inventory
      else if (oldStatus !== 'Verified' && newStatus === 'Verified') {
        const quantityReceived = prompt(
          `📦 INVENTORY VERIFICATION\n\n` +
          `Order: ${updatedOrder.description}\n` +
          `SKU: ${updatedOrder.sku}\n` +
          `Expected Quantity: ${updatedOrder.quantity}\n` +
          `Destination: ${updatedOrder.destinationStock}\n\n` +
          `Enter the ACTUAL quantity received and counted:`,
          updatedOrder.quantity.toString()
        );
        
        if (quantityReceived === null) {
          return; // User cancelled
        }
        
        const actualQuantity = parseInt(quantityReceived);
        
        if (isNaN(actualQuantity) || actualQuantity < 0) {
          alert('Invalid quantity entered. Please enter a valid number.');
          return;
        }
        
        // Warn if quantity doesn't match
        if (actualQuantity !== updatedOrder.quantity) {
          const difference = actualQuantity - updatedOrder.quantity;
          const diffText = difference > 0 ? `+${difference} MORE` : `${Math.abs(difference)} LESS`;
          
          const confirmMismatch = confirm(
            `⚠️ QUANTITY MISMATCH\n\n` +
            `Expected: ${updatedOrder.quantity}\n` +
            `Received: ${actualQuantity}\n` +
            `Difference: ${diffText}\n\n` +
            `This will add ${actualQuantity} units to inventory.\n\n` +
            `Continue with this quantity?`
          );
          
          if (!confirmMismatch) {
            return;
          }
        }
        
        // Store the actual quantity received in orderData
        orderData.quantityReceived = actualQuantity;
        
        // Add to inventory using actual quantity
        const inventoryItem = inventory.find(item => item.sku === updatedOrder.sku);
        if (inventoryItem) {
          const stockUpdate: any = {};
          if (updatedOrder.destinationStock === 'Ecuador') {
            stockUpdate.ecuadorStock = inventoryItem.ecuadorStock + actualQuantity;
          } else {
            stockUpdate.usaStock = inventoryItem.usaStock + actualQuantity;
          }
          updateInventoryItem(inventoryItem.id, stockUpdate);
        }
      }
      
      updatePurchaseOrder(editingOrder.id, orderData);
      
      // Sync changes to inventory, passing original SKU if it changed
      const previousSku = originalSku !== updatedOrder.sku ? originalSku : undefined;
      syncPurchaseOrderToInventory(updatedOrder, inventory, updateInventoryItem, addInventoryItem, previousSku);
    } else {
      // Add the purchase order
      const newOrderId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newOrder = { ...orderData, id: newOrderId, createdAt: new Date() };
      addPurchaseOrder(orderData);

      // If creating new item, add it to inventory (with 0 stock - will update when received)
      if (isCreatingNewItem && formData.sku && formData.category && formData.line) {
        addInventoryItem({
          name: formData.description,
          sku: formData.sku,
          supplierSKU: formData.supplierSKU,
          category: formData.category,
          line: formData.line,
          description: formData.description,
          images: formData.images,
          ecuadorStock: 0, // Start with 0 - will update when order is verified
          usaStock: 0,
          linkedPurchaseOrders: [newOrderId],
        });
      } else if (formData.sku) {
        // Sync to existing inventory if needed
        syncPurchaseOrderToInventory(newOrder, inventory, updateInventoryItem, addInventoryItem);
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
      destinationStock: 'Ecuador',
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
  };

  const handleRegenerateSku = () => {
    if (formData.category && formData.line) {
      const existingSkus = inventory.map(item => item.sku).filter(sku => sku !== formData.sku);
      const newSku = generateUniqueSKU(formData.category, formData.line, existingSkus);
      setFormData({ ...formData, sku: newSku });
      setSkuManuallyEdited(false);
    }
  };

  const handleSkuChange = (newSku: string) => {
    setFormData({ ...formData, sku: newSku });
    setSkuManuallyEdited(true);
  };

  const handleStatusChange = (order: PurchaseOrder, newStatus: 'Ordered' | 'Shipped' | 'Received' | 'Verified') => {
    const oldStatus = order.status;
    
    // SAFEGUARD: Prevent moving backwards from Verified without confirmation
    if (oldStatus === 'Verified' && newStatus !== 'Verified') {
      const quantityToRemove = order.quantityReceived || order.quantity;
      const confirmed = confirm(
        `⚠️ WARNING: This order has already been verified and added to inventory!\n\n` +
        `Moving back to "${newStatus}" will REMOVE ${quantityToRemove} units from your ${order.destinationStock} inventory.\n\n` +
        `This should only be done if the verification was a mistake.\n\n` +
        `Are you sure you want to continue?`
      );
      
      if (!confirmed) {
        // User cancelled - don't change status
        return;
      }
      
      // Remove inventory that was previously added
      const inventoryItem = inventory.find(item => item.sku === order.sku);
      if (inventoryItem) {
        const stockUpdate: any = {};
        if (order.destinationStock === 'Ecuador') {
          stockUpdate.ecuadorStock = Math.max(0, inventoryItem.ecuadorStock - quantityToRemove);
        } else {
          stockUpdate.usaStock = Math.max(0, inventoryItem.usaStock - quantityToRemove);
        }
        updateInventoryItem(inventoryItem.id, stockUpdate);
      }
    }
    
    const statusUpdate: any = { status: newStatus };
    
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
    
    // VERIFICATION: When moving to Verified, prompt for actual quantity received
    if (oldStatus !== 'Verified' && newStatus === 'Verified') {
      const quantityReceived = prompt(
        `📦 INVENTORY VERIFICATION\n\n` +
        `Order: ${order.description}\n` +
        `SKU: ${order.sku}\n` +
        `Expected Quantity: ${order.quantity}\n` +
        `Destination: ${order.destinationStock}\n\n` +
        `Enter the ACTUAL quantity received and counted:`,
        order.quantity.toString()
      );
      
      // User cancelled
      if (quantityReceived === null) {
        return;
      }
      
      const actualQuantity = parseInt(quantityReceived);
      
      // Validate input
      if (isNaN(actualQuantity) || actualQuantity < 0) {
        alert('Invalid quantity entered. Please enter a valid number.');
        return;
      }
      
      // Warn if quantity doesn't match
      if (actualQuantity !== order.quantity) {
        const difference = actualQuantity - order.quantity;
        const diffText = difference > 0 ? `+${difference} MORE` : `${Math.abs(difference)} LESS`;
        
        const confirmMismatch = confirm(
          `⚠️ QUANTITY MISMATCH\n\n` +
          `Expected: ${order.quantity}\n` +
          `Received: ${actualQuantity}\n` +
          `Difference: ${diffText}\n\n` +
          `This will add ${actualQuantity} units to inventory.\n\n` +
          `Continue with this quantity?`
        );
        
        if (!confirmMismatch) {
          return;
        }
      }
      
      // Store the actual quantity received
      statusUpdate.quantityReceived = actualQuantity;
      
      // Add to inventory using actual quantity
      const inventoryItem = inventory.find(item => item.sku === order.sku);
      if (inventoryItem) {
        const stockUpdate: any = {};
        if (order.destinationStock === 'Ecuador') {
          stockUpdate.ecuadorStock = inventoryItem.ecuadorStock + actualQuantity;
        } else {
          stockUpdate.usaStock = inventoryItem.usaStock + actualQuantity;
        }
        updateInventoryItem(inventoryItem.id, stockUpdate);
      }
    }
    
    updatePurchaseOrder(order.id, statusUpdate);
    
    // Sync changes to inventory after status update
    const updatedOrder = { ...order, ...statusUpdate };
    syncPurchaseOrderToInventory(updatedOrder, inventory, updateInventoryItem, addInventoryItem);
  };

  const handleEdit = (order: PurchaseOrder) => {
    setEditingOrder(order);
    setOriginalSku(order.sku); // Track original SKU for sync purposes
    setSelectedInventoryId(''); // Reset selector for fresh linking option
    setSkuManuallyEdited(false); // Reset SKU manual edit flag to allow regeneration
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
      destinationStock: order.destinationStock,
      currency: order.currency,
      costPerUnit: order.costPerUnit,
      discountPerUnit: order.discountPerUnit,
      exchangeRate: order.exchangeRate,
      purchaseDate: order.purchaseDate.toISOString().split('T')[0],
      status: order.status || 'Ordered',
    });
    setIsFormOpen(true);
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
      if (filterStatus !== 'all' && order.status !== filterStatus) {
        return false;
      }
      
      // Supplier filter
      if (filterSupplier !== 'all' && order.supplierId !== filterSupplier) {
        return false;
      }
      
      // Destination filter
      if (filterDestination !== 'all' && order.destinationStock !== filterDestination) {
        return false;
      }
      
      // Duplicate SKU filter
      if (filterDuplicateSku && !duplicateSkus.includes(order.sku)) {
        return false;
      }
      
      // Category filter
      if (filterCategory !== 'all' && order.category !== filterCategory) {
        return false;
      }
      
      // Line filter
      if (filterLine !== 'all' && order.line !== filterLine) {
        return false;
      }
      
      return true;
    })
    .sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
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
        case 'destination':
          aValue = a.destinationStock;
          bValue = b.destinationStock;
          break;
        case 'status':
          const statusOrder = { 'Ordered': 1, 'Shipped': 2, 'Received': 3, 'Verified': 4 };
          aValue = statusOrder[a.status] || 0;
          bValue = statusOrder[b.status] || 0;
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
          groupKey = order.category || 'No Category';
          break;
        case 'line':
          groupKey = order.line || 'No Line';
          break;
        case 'destination':
          groupKey = order.destination;
          break;
        case 'status':
          groupKey = order.status;
          break;
        case 'createdAt':
          groupKey = new Date(order.createdAt).toLocaleDateString();
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
          <h2 className="text-2xl font-semibold text-gray-900">Purchase Orders</h2>
          <p className="text-sm text-gray-500 mt-1">Import, track, and manage supplier orders</p>
        </div>
        <div className="flex gap-3">
          {/* Bulk Operations Dropdown */}
          <div className="relative">
          <button
              onClick={() => setShowBulkDropdown(!showBulkDropdown)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <span className="text-sm font-medium text-gray-700">Bulk</span>
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
          </button>

            {showBulkDropdown && (
              <div ref={bulkDropdownRef} className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-10">
                <div className="p-2">
          <button
                    onClick={() => {
                      setIsBulkImportOpen(true);
                      setShowBulkDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-gray-700 hover:bg-gray-50"
                  >
                    <svg className="w-4 h-4 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                    Import Orders
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
                    Delete Orders
          </button>
        </div>
              </div>
            )}
      </div>

          <button
            onClick={() => setIsFormOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#4f0c1b] hover:bg-[#3d0a15] text-white rounded-lg transition-all font-medium text-sm shadow-sm hover:shadow-md active:scale-95"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span className="text-sm font-medium text-white">Add Order</span>
          </button>
        </div>
          </div>
          
      {/* Column Visibility Control */}
      <div className="mt-4 flex items-center justify-end gap-3">
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
            <span className="text-sm font-medium">Filters</span>
            {(filterStatus !== 'all' || filterSupplier !== 'all' || filterDestination !== 'all' || filterDuplicateSku || filterCategory !== 'all' || filterLine !== 'all') && (
              <span className="bg-red-100 text-red-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                {[filterStatus !== 'all', filterSupplier !== 'all', filterDestination !== 'all', filterDuplicateSku, filterCategory !== 'all', filterLine !== 'all'].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {/* Group By Button */}
        <div className="relative">
          <button
            onClick={() => setShowGroupByDropdown(!showGroupByDropdown)}
            className={`flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm ${
              groupByField ? 'bg-[#4f0c1b] text-white border-[#4f0c1b]' : ''
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="text-sm font-medium">Group by</span>
            {groupByField && (
              <span className="bg-red-100 text-red-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                1
          </span>
            )}
          </button>

          {showGroupByDropdown && (
            <div ref={groupByDropdownRef} className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-10">
              <div className="p-4">
                <div className="text-sm font-medium text-gray-700 mb-3">Group by Field</div>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setGroupByField('');
                      setShowGroupByDropdown(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      !groupByField ? 'bg-[#4f0c1b] text-white' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    No Grouping
                  </button>
                  {getGroupByFields().map(field => (
                    <button
                      key={field.key}
                      onClick={() => {
                        setGroupByField(field.key);
                        setShowGroupByDropdown(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        groupByField === field.key ? 'bg-[#4f0c1b] text-white' : 'text-gray-700 hover:bg-gray-50'
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
            <span className="text-sm font-medium text-gray-700">Hide fields</span>
            {hiddenColumns.size > 0 && (
              <span className="bg-red-100 text-red-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                {hiddenColumns.size}
              </span>
            )}
          </button>
          
          {showColumnDropdown && (
            <div ref={dropdownRef} className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-10">
              <div className="p-4">
                <div className="text-sm font-medium text-gray-700 mb-3">Column Visibility</div>
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
                <div className="text-sm font-medium text-gray-700 mb-3">Search</div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search purchase orders..."
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

      {/* Expandable Filter Menu */}
        {showFilters && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {/* Status Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent text-sm bg-white"
                >
                  <option value="all">All Status</option>
                  <option value="Ordered">📦 Ordered</option>
                  <option value="Shipped">🚚 Shipped</option>
                  <option value="Received">📥 Received</option>
                  <option value="Verified">✅ Verified</option>
                </select>
              </div>
              
              {/* Supplier Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Supplier</label>
                <select
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent text-sm bg-white"
                >
                  <option value="all">All Suppliers</option>
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </div>
              
              {/* Destination Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Destination</label>
                <select
                  value={filterDestination}
                  onChange={(e) => setFilterDestination(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent text-sm bg-white"
                >
                  <option value="all">All Destinations</option>
                  <option value="Ecuador">Ecuador</option>
                  <option value="USA">USA</option>
                </select>
              </div>
              
              {/* Category Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent text-sm bg-white"
                >
                  <option value="all">All Categories</option>
                  {predefinedCategories.map(cat => (
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
                <label className="block text-xs font-medium text-gray-700 mb-1">Line</label>
                <select
                  value={filterLine}
                  onChange={(e) => setFilterLine(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent text-sm bg-white"
                >
                  <option value="all">All Lines</option>
                  {predefinedLines.map(line => (
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
                  className="w-4 h-4 text-[#4f0c1b] border-gray-300 rounded focus:ring-[#4f0c1b] focus:ring-2"
                />
                <span className="text-gray-700">
                  Show only duplicate SKUs ({duplicateSkus.length} SKUs with multiple orders)
                </span>
              </label>
            </div>
            
            {/* Clear filters button */}
            {(searchQuery || filterStatus !== 'all' || filterSupplier !== 'all' || filterDestination !== 'all' || filterDuplicateSku || filterCategory !== 'all' || filterLine !== 'all') && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setFilterStatus('all');
                    setFilterSupplier('all');
                    setFilterDestination('all');
                    setFilterDuplicateSku(false);
                    setFilterCategory('all');
                    setFilterLine('all');
                  }}
                  className="text-[#4f0c1b] hover:text-[#3d0a15] font-medium text-sm"
                >
                  Clear All Filters
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
            <h3 className="text-sm font-semibold text-amber-900">Orders Need Review</h3>
            <p className="text-sm text-amber-700 mt-1">
              {purchaseOrders.filter(order => order.category.includes('NEEDS REVIEW') || !order.supplierId).length} orders from bulk import need additional information.
              Click Edit to add missing supplier or other details.
            </p>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 duration-300">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingOrder ? 'Edit Purchase Order' : 'Add New Purchase Order'}
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
                    {editingOrder ? 'Link to Existing Product (Optional)' : 'Product'}
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={selectedInventoryId}
                      onChange={(e) => setSelectedInventoryId(e.target.value)}
                      className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent bg-white text-sm"
                    >
                      <option value="">
                        {editingOrder ? 'Keep current / create new product...' : 'Select existing product or create new...'}
                      </option>
                      {!editingOrder && <option value="new">Create New Product</option>}
                      {inventory.length > 0 && <option disabled>──────────</option>}
                      {inventory.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.sku}
                          {item.supplierSKU && formData.supplierSKU && item.supplierSKU === formData.supplierSKU && ' ✓ (Supplier SKU Match)'}
                        </option>
                      ))}
                    </select>
                    {selectedInventoryId === 'new' && (
                      <button
                        type="button"
                        onClick={() => setSelectedInventoryId('')}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  {selectedInventoryId && selectedInventoryId !== 'new' && !editingOrder && (
                    <p className="text-xs text-gray-500 mt-1.5">
                      Product details loaded from inventory
                    </p>
                  )}
                  {selectedInventoryId && selectedInventoryId !== 'new' && editingOrder && (
                    <p className="text-xs text-green-600 mt-1.5 font-medium">
                      ✓ Will link to existing product and use its SKU, Category, and Line
                    </p>
                  )}
                  {isCreatingNewItem && (
                    <p className="text-xs text-[#4f0c1b] mt-1.5 font-medium">
                      New product will be added to inventory
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Invoice *</label>
                  <input
                    type="text"
                    required
                    value={formData.invoice}
                    onChange={(e) => setFormData({ ...formData, invoice: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Invoice Link</label>
                  <input
                    type="url"
                    value={formData.invoiceLink}
                    onChange={(e) => setFormData({ ...formData, invoiceLink: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Supplier *</label>
                  <select
                    required
                    value={formData.supplierId}
                    onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  >
                    <option value="">Select a supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Supplier SKU</label>
                  <input
                    type="text"
                    value={formData.supplierSKU}
                    onChange={(e) => setFormData({ ...formData, supplierSKU: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
              </div>

              {/* Product Details Section */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">
                    {isCreatingNewItem ? 'Product Name *' : 'Description'}
                  </label>
                  <input
                    type="text"
                    required={isCreatingNewItem}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={isCreatingNewItem ? 'e.g., Gold Diamond Ring' : 'Order description'}
                    disabled={!!(selectedInventoryId && selectedInventoryId !== 'new' && !editingOrder)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">
                      Category {(isCreatingNewItem || editingOrder) && '*'}
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                      >
                        <option value="">Select...</option>
                        {predefinedCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                        {existingCategories.length > 0 && (
                          <>
                            <optgroup label="Other Categories">
                        {existingCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                            </optgroup>
                          </>
                        )}
                        <option value="__new__">+ Add New</option>
                      </select>
                    ) : (
                      <div className="flex gap-1">
                        <input
                          type="text"
                          required={isCreatingNewItem || !!editingOrder}
                          value={formData.category}
                          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                          placeholder="New category"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
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
                      Line {(isCreatingNewItem || editingOrder) && '*'}
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                      >
                        <option value="">Select...</option>
                        {predefinedLines.map(line => (
                          <option key={line} value={line}>{line}</option>
                        ))}
                        {existingLines.length > 0 && (
                          <>
                            <optgroup label="Other Lines">
                        {existingLines.map(line => (
                          <option key={line} value={line}>{line}</option>
                        ))}
                            </optgroup>
                          </>
                        )}
                        <option value="__new__">+ Add New</option>
                      </select>
                    ) : (
                      <div className="flex gap-1">
                        <input
                          type="text"
                          required={isCreatingNewItem || !!editingOrder}
                          value={formData.line}
                          onChange={(e) => setFormData({ ...formData, line: e.target.value })}
                          placeholder="New line"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
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
                      SKU {isCreatingNewItem && '*'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required={isCreatingNewItem || !!editingOrder}
                        value={formData.sku}
                        onChange={(e) => handleSkuChange(e.target.value)}
                        placeholder={isCreatingNewItem ? 'Auto' : ''}
                        disabled={!!(selectedInventoryId && selectedInventoryId !== 'new' && !editingOrder)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 font-mono text-sm"
                      />
                      {(isCreatingNewItem || editingOrder) && (
                        <button
                          type="button"
                          onClick={handleRegenerateSku}
                          disabled={!formData.category || !formData.line}
                          className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-white hover:border-[#4f0c1b] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                          title="Regenerate SKU from category & line"
                        >
                          <svg className="w-5 h-5 text-[#4f0c1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {isCreatingNewItem && formData.category && formData.line && formData.sku && (
                  <p className="text-xs text-gray-500">
                    SKU will be: {formData.sku}
                  </p>
                )}
                {editingOrder && formData.category && formData.line && (
                  <p className="text-xs text-[#4f0c1b]">
                    💡 Tip: Update Category & Line, then click the regenerate button to create a new SKU. Changes will sync to linked inventory.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Quantity *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Destination Stock *</label>
                  <select
                    required
                    value={formData.destinationStock}
                    onChange={(e) => setFormData({ ...formData, destinationStock: e.target.value as 'Ecuador' | 'USA' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  >
                    <option value="Ecuador">Ecuador</option>
                    <option value="USA">USA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Currency</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
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
                  <label className="block text-sm font-medium mb-1 text-gray-700">Cost Per Unit *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.costPerUnit}
                    onChange={(e) => setFormData({ ...formData, costPerUnit: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Discount Per Unit</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.discountPerUnit}
                    onChange={(e) => setFormData({ ...formData, discountPerUnit: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Exchange Rate to USD</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={formData.exchangeRate}
                      onChange={(e) => setFormData({ ...formData, exchangeRate: parseFloat(e.target.value) || 1 })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={fetchExchangeRates}
                      disabled={isLoadingRates || formData.currency === 'USD'}
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Refresh exchange rate"
                    >
                      {isLoadingRates ? '...' : '↻'}
                    </button>
                  </div>
                  {lastRateUpdate && formData.currency !== 'USD' && (
                    <p className="text-xs text-gray-500 mt-1">
                      Rate updated: {lastRateUpdate}
                    </p>
                  )}
                  {formData.currency === 'USD' && (
                    <p className="text-xs text-gray-500 mt-1">
                      No conversion needed (USD)
                    </p>
                  )}
                </div>
              </div>


              {/* Cost Summary */}
              <div className="bg-white border-2 border-[#4f0c1b] rounded-lg p-4">
                <h4 className="font-semibold mb-3 text-[#4f0c1b]">Cost Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Product Cost ({formData.currency}):</span>
                    <span>{totals.totalCostWithDiscount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Product Cost (USD):</span>
                    <span>${totals.costInUSD.toFixed(2)}</span>
                  </div>
                  <div className="border-t-2 border-gray-200 pt-2 mt-2">
                    <div className="flex justify-between font-semibold text-gray-900 text-base">
                      <span>Total Cost:</span>
                      <span>${totals.costInUSD.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="bg-[#4f0c1b] text-white rounded-lg p-3 mt-3">
                    <div className="flex justify-between font-semibold">
                      <span>Cost Per Unit:</span>
                      <span>${(totals.costInUSD / formData.quantity).toFixed(2)}</span>
                    </div>
                    <div className="text-xs mt-1 opacity-90">
                      vs Supplier Cost: {formData.currency} {totals.costPerUnitWithDiscount.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Purchase Date *</label>
                <input
                  type="date"
                  required
                  value={formData.purchaseDate}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Product images are managed in the Inventory section
                </p>
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
                {editingOrder ? 'Update' : 'Add'} Purchase Order
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    #
                  </th>
                  {!hiddenColumns.has('invoice') && (
                <th 
                  onClick={() => handleSort('invoice')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    Invoice
                    <SortIcon field="invoice" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('supplier') && (
                <th 
                  onClick={() => handleSort('supplier')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    Supplier
                    <SortIcon field="supplier" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('description') && (
                <th 
                  onClick={() => handleSort('description')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    Description
                    <SortIcon field="description" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('sku') && (
                <th 
                  onClick={() => handleSort('sku')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    SKU
                    <SortIcon field="sku" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('quantity') && (
                <th 
                  onClick={() => handleSort('quantity')}
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-1 justify-end">
                    Quantity
                    <SortIcon field="quantity" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('destination') && (
                <th 
                  onClick={() => handleSort('destination')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    Destination
                    <SortIcon field="destination" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('status') && (
                <th 
                  onClick={() => handleSort('status')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    Status
                    <SortIcon field="status" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('landedCost') && (
                <th 
                  onClick={() => handleSort('landedCost')}
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-1 justify-end">
                    Cost/Unit
                    <SortIcon field="landedCost" />
                  </div>
                </th>
                  )}
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            ) : (
              // Grouped view headers (no Invoice column)
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    #
                  </th>
                  {!hiddenColumns.has('supplier') && (
                    <th 
                      onClick={() => handleSort('supplier')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        Supplier
                        <SortIcon field="supplier" />
                      </div>
                    </th>
                  )}
                  {!hiddenColumns.has('description') && (
                    <th 
                      onClick={() => handleSort('description')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        Description
                        <SortIcon field="description" />
                      </div>
                    </th>
                  )}
                  {!hiddenColumns.has('sku') && (
                    <th 
                      onClick={() => handleSort('sku')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        SKU
                        <SortIcon field="sku" />
                      </div>
                    </th>
                  )}
                  {!hiddenColumns.has('quantity') && (
                    <th 
                      onClick={() => handleSort('quantity')}
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-1 justify-end">
                    Quantity
                    <SortIcon field="quantity" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('destination') && (
                <th 
                  onClick={() => handleSort('destination')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    Destination
                    <SortIcon field="destination" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('status') && (
                <th 
                  onClick={() => handleSort('status')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    Status
                    <SortIcon field="status" />
                  </div>
                </th>
                  )}
                  {!hiddenColumns.has('landedCost') && (
                <th 
                  onClick={() => handleSort('landedCost')}
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-1 justify-end">
                        Cost/Unit
                    <SortIcon field="landedCost" />
                  </div>
                </th>
                  )}
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            )}
            <tbody className="divide-y divide-gray-100">
              {filteredAndSortedOrders.length === 0 ? (
                <tr>
                  <td colSpan={!groupByField ? 10 - hiddenColumns.size : 9 - hiddenColumns.size} className="px-6 py-12 text-center text-sm text-gray-500">
                    {purchaseOrders.length === 0 
                      ? 'No purchase orders yet. Add your first purchase order to get started.'
                      : 'No orders match your filters. Try adjusting your search or filters.'}
                  </td>
                </tr>
              ) : !groupByField ? (
                filteredAndSortedOrders.map((order, index) => {
                  const supplier = suppliers.find(s => s.id === order.supplierId);
                  const needsReview = order.category.includes('NEEDS REVIEW') || !order.supplierId;
                  return (
                    <tr key={order.id} className={`hover:bg-gray-50 transition-colors ${needsReview ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                        {index + 1}
                      </td>
                      {!hiddenColumns.has('invoice') && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {supplier ? (
                          <button
                            onClick={() => setSelectedSupplier(supplier)}
                            className="text-[#4f0c1b] hover:text-[#3d0a15] hover:underline transition-colors font-medium"
                          >
                            {supplier.name}
                          </button>
                        ) : (
                          <span className="text-amber-600 font-medium">Missing Supplier</span>
                        )}
                      </td>
                      )}
                      {!hiddenColumns.has('description') && (
                      <td className="px-6 py-4 text-sm text-gray-700">{order.description}</td>
                      )}
                      {!hiddenColumns.has('sku') && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{order.sku}</td>
                      )}
                      {!hiddenColumns.has('quantity') && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-gray-700">{order.quantity}</span>
                          {order.status === 'Verified' && order.quantityReceived !== undefined && order.quantityReceived !== order.quantity && (
                            <span className="text-amber-600 text-xs font-medium" title={`Actually received: ${order.quantityReceived}`}>
                              (⚠️ {order.quantityReceived})
                            </span>
                          )}
                        </div>
                      </td>
                      )}
                      {!hiddenColumns.has('destination') && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{order.destinationStock}</td>
                      )}
                      {!hiddenColumns.has('status') && (
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <select
                            value={order.status || 'Ordered'}
                            onChange={(e) => handleStatusChange(order, e.target.value as any)}
                            className={`text-xs font-medium px-2 py-1 rounded-full border-0 focus:ring-2 focus:ring-[#4f0c1b] ${
                              order.status === 'Verified' ? 'bg-green-100 text-green-800 font-bold' :
                              order.status === 'Received' ? 'bg-blue-100 text-blue-800' :
                              order.status === 'Shipped' ? 'bg-purple-100 text-purple-800' :
                              'bg-gray-100 text-gray-800'
                            }`}
                          >
                            <option value="Ordered">📦 Ordered</option>
                            <option value="Shipped">🚚 Shipped</option>
                            <option value="Received">📥 Received</option>
                            <option value="Verified">✅ Verified</option>
                          </select>
                          {order.status === 'Verified' && (
                            <span className="text-green-600 text-xs" title="Inventory updated">
                              🔒
                            </span>
                          )}
                        </div>
                      </td>
                      )}
                      {!hiddenColumns.has('landedCost') && (
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="font-medium text-gray-900">${order.landedCostPerUnit.toFixed(2)}</div>
                        <div className="text-xs text-gray-500">Total: ${order.totalLandedCost.toFixed(2)}</div>
                      </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                        <div className="flex items-center gap-2 justify-center">
                        <button
                          onClick={() => handleEdit(order)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-sm transition-all duration-200 hover:shadow-md ${
                              needsReview 
                                ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300' 
                                : 'bg-[#4f0c1b] text-white hover:bg-[#3d0a15] shadow-sm'
                            }`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          {needsReview ? 'Complete Info' : 'Edit'}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this purchase order?')) {
                                // Clean up orphaned inventory items
                                cleanupInventoryAfterOrderDeletion([order.id], inventory, deleteInventoryItem);
                              deletePurchaseOrder(order.id);
                            }
                          }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 hover:text-red-800 rounded-lg font-medium text-sm transition-all duration-200 hover:shadow-md border border-red-200"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          Delete
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
                  const supplier = suppliers.find(s => s.id === orders[0].supplierId);
                  const hasNeedsReview = orders.some(order => order.category.includes('NEEDS REVIEW') || !order.supplierId);
                  
                  return (
                    <React.Fragment key={groupKey}>
                      {/* Group Header Row */}
                      <tr className="bg-gray-50 border-t-2 border-gray-200">
                        <td colSpan={9 - hiddenColumns.size} className="px-6 py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <h3 className="text-lg font-semibold text-gray-900">{groupKey}</h3>
                              <span className="bg-[#4f0c1b] text-white px-2 py-1 rounded-full text-xs font-medium">
                                {totalOrders} order{totalOrders !== 1 ? 's' : ''}
                              </span>
                              {hasNeedsReview && (
                                <span className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded-full font-medium">
                                  Needs Review
                                </span>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium text-gray-900">
                                ${totalValue.toFixed(2)}
                              </div>
                              <div className="text-xs text-gray-500">
                                Total Value
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                      
                      {/* Individual Orders - Grouped View Structure (no Invoice column) */}
                      {orders.map((order, orderIndex) => {
                        const supplier = suppliers.find(s => s.id === order.supplierId);
                        const needsReview = order.category.includes('NEEDS REVIEW') || !order.supplierId;
                        return (
                          <tr key={order.id} className={`hover:bg-gray-50 transition-colors ${needsReview ? 'bg-amber-50/30' : ''}`}>
                            {/* Row Number */}
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                              {orderIndex + 1}
                            </td>
                            
                            {/* Supplier */}
                            {!hiddenColumns.has('supplier') && (
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <div className="flex items-center gap-2">
                                  {supplier ? (
                                    <button
                                      onClick={() => setSelectedSupplier(supplier)}
                                      className="text-[#4f0c1b] hover:text-[#3d0a15] hover:underline transition-colors font-medium"
                                    >
                                      {supplier.name}
                                    </button>
                                  ) : (
                                    <span className="text-amber-600 font-medium">Missing Supplier</span>
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
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {order.description}
                              </td>
                            )}
                            
                            {/* SKU */}
                            {!hiddenColumns.has('sku') && (
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {order.sku}
                              </td>
                            )}
                            
                            {/* Quantity */}
                            {!hiddenColumns.has('quantity') && (
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                                {order.quantity}
                                {order.quantityReceived && order.quantityReceived !== order.quantity && (
                                  <span className="text-amber-600 ml-1">
                                    (⚠️ {order.quantityReceived})
                                  </span>
                                )}
                              </td>
                            )}
                            
                            {/* Destination */}
                            {!hiddenColumns.has('destination') && (
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {order.destinationStock}
                              </td>
                            )}
                            
                            {/* Status */}
                            {!hiddenColumns.has('status') && (
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    order.status === 'Verified' ? 'bg-green-100 text-green-800' :
                                    order.status === 'Received' ? 'bg-blue-100 text-blue-800' :
                                    order.status === 'Shipped' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {order.status === 'Verified' ? '✅' : order.status === 'Received' ? '📥' : order.status === 'Shipped' ? '🚚' : '📦'} {order.status}
                                  </span>
                                </div>
                              </td>
                            )}
                            
                            {/* Landed Cost */}
                            {!hiddenColumns.has('landedCost') && (
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <div className="font-medium text-gray-900">${order.landedCostPerUnit.toFixed(2)}</div>
                                <div className="text-xs text-gray-500">Total: ${order.totalLandedCost.toFixed(2)}</div>
                              </td>
                            )}
                            
                            {/* Actions */}
                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                              <div className="flex items-center gap-2 justify-center">
                                <button
                                  onClick={() => handleEdit(order)}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-sm transition-all duration-200 hover:shadow-md ${
                                    needsReview 
                                      ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300' 
                                      : 'bg-[#4f0c1b] text-white hover:bg-[#3d0a15] shadow-sm'
                                  }`}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  {needsReview ? 'Complete Info' : 'Edit'}
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Are you sure you want to delete this purchase order?')) {
                                      // Clean up orphaned inventory items
                                      cleanupInventoryAfterOrderDeletion([order.id], inventory, deleteInventoryItem);
                                      deletePurchaseOrder(order.id);
                                    }
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 hover:text-red-800 rounded-lg font-medium text-sm transition-all duration-200 hover:shadow-md border border-red-200"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  Delete
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
              Showing <span className="font-semibold text-gray-900">{filteredAndSortedOrders.length}</span> of <span className="font-semibold text-gray-900">{purchaseOrders.length}</span> orders
            </span>
            {groupByField && (
              <span className="text-gray-400">•</span>
            )}
            {groupByField && (
              <span>
                <span className="font-semibold text-gray-900">{Object.keys(groupedOrders).length}</span> {getGroupByFields().find(f => f.key === groupByField)?.label.toLowerCase() || 'groups'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Row numbers reset per group when grouping is active</span>
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

      {/* Bulk Import Modal */}
      {isBulkImportOpen && (
        <BulkImportModal onClose={() => setIsBulkImportOpen(false)} />
      )}

      {/* Bulk Delete Modal */}
      {isBulkDeleteOpen && (
        <BulkDeleteModal 
          purchaseOrders={purchaseOrders}
          onClose={() => setIsBulkDeleteOpen(false)}
          onBulkDelete={(invoiceNumbers) => {
            console.log('Bulk delete triggered with invoices:', invoiceNumbers);
            console.log('Total purchase orders before delete:', purchaseOrders.length);
            
            // Collect all order IDs that will be deleted
            const deletedOrderIds: string[] = [];
            
            // Delete orders by invoice numbers
            invoiceNumbers.forEach(invoice => {
              const ordersToDelete = purchaseOrders.filter(order => order.invoice === invoice);
              console.log(`Deleting ${ordersToDelete.length} orders for invoice: ${invoice}`);
              ordersToDelete.forEach(order => {
                console.log('Deleting order:', order.id, order.invoice);
                deletedOrderIds.push(order.id);
                deletePurchaseOrder(order.id);
              });
            });
            
            // Clean up orphaned inventory items
            console.log('Cleaning up inventory items for deleted orders:', deletedOrderIds);
            cleanupInventoryAfterOrderDeletion(deletedOrderIds, inventory, deleteInventoryItem);
            
            console.log('Bulk delete completed');
          }}
        />
      )}
    </div>
  );
}