'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SalesInvoice, SalesInvoiceLine, InventoryItem, Client, PaymentRecord } from '../types';
import { getAllInvoices, updateInvoice, deleteInvoice } from '../services/invoicesService';
import { getAllClients } from '../services/clientsService';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';
import { useTranslation } from '../context/TranslationContext';

export default function InvoiceTracking() {
  const { user } = useAuth();
  const { inventory, updateInventoryItem, purchaseOrders } = useInventory();
  const { t } = useTranslation();
  const editDropdownRef = useRef<HTMLDivElement>(null);
  const [allInvoices, setAllInvoices] = useState<SalesInvoice[]>([]);
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [uniqueClients, setUniqueClients] = useState<{id: string, name: string}[]>([]);
  const [filters, setFilters] = useState({
    clientId: '',
    paymentStatus: '',
    deliveryStatus: '',
    dateFrom: '',
    dateTo: ''
  });
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'}>({key: 'date', direction: 'desc'});
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [showModal, setShowModal] = useState(false);
  
  // Edit state
  const [editingInvoice, setEditingInvoice] = useState<SalesInvoice | null>(null);
  const [editItems, setEditItems] = useState<SalesInvoiceLine[]>([]);
  const [editDiscountType, setEditDiscountType] = useState<'percentage' | 'flat'>('percentage');
  const [editDiscountValue, setEditDiscountValue] = useState(0);
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editPaymentComment, setEditPaymentComment] = useState('');
  
  // Search state for edit modal
  const [editSearchTerm, setEditSearchTerm] = useState('');
  const [editShowDropdown, setEditShowDropdown] = useState(false);
  
  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<SalesInvoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);

  // Delivery modal state
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryInvoice, setDeliveryInvoice] = useState<SalesInvoice | null>(null);
  const [deliveryItems, setDeliveryItems] = useState<{[key: number]: number}>({});
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);

  // Invoice details modal state
  const [showInvoiceDetailsModal, setShowInvoiceDetailsModal] = useState(false);
  const [detailsInvoice, setDetailsInvoice] = useState<SalesInvoice | null>(null);

  // Warning modal state
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [warningItems, setWarningItems] = useState<Array<{description: string, quantity: number, currentStock: number, remainingStock: number}>>([]);
  const [warningCallback, setWarningCallback] = useState<(() => void) | null>(null);

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<SalesInvoice | null>(null);
  const [itemsReturningToStock, setItemsReturningToStock] = useState<Array<{description: string, sku: string, quantity: number, currentStock: number, newStock: number}>>([]);

  // PDF language selection modal state
  const [showPdfLanguageModal, setShowPdfLanguageModal] = useState(false);
  const [pdfInvoice, setPdfInvoice] = useState<SalesInvoice | null>(null);

  useEffect(() => {
    loadInvoices();
  }, []);

  // Extract unique clients from all invoices
  useEffect(() => {
    if (allInvoices.length > 0) {
      const uniqueClientMap = new Map<string, string>();
      allInvoices.forEach(invoice => {
        // Include all invoices, even Walk-in Customers with empty clientId
        if (invoice.clientName) {
          const clientId = invoice.clientId || 'walk-in';
          const clientName = invoice.clientName;
          
          // Only add if not already present
          if (!uniqueClientMap.has(clientId)) {
            uniqueClientMap.set(clientId, clientName);
          }
        }
      });
      const uniqueClientsArray = Array.from(uniqueClientMap.entries()).map(([id, name]) => ({
        id,
        name
      }));
      setUniqueClients(uniqueClientsArray);
      console.log('Unique clients from invoices:', uniqueClientsArray);
    }
  }, [allInvoices]);

  // Filter inventory for edit modal
  const getFilteredEditInventory = () => {
    if (!editSearchTerm.trim()) return [];
    const searchLower = editSearchTerm.toLowerCase();
    return inventory.filter(item =>
      item.sku.toLowerCase().includes(searchLower) ||
      item.name.toLowerCase().includes(searchLower) ||
      item.description?.toLowerCase().includes(searchLower)
    ).slice(0, 10);
  };

  const addProductToEditItems = (product: InventoryItem) => {
    // Calculate unit price from landed cost
    let unitPrice = 25; // Default price
    
    if (product.linkedPurchaseOrders.length > 0) {
      const linkedOrders = purchaseOrders.filter(po => 
        product.linkedPurchaseOrders.includes(po.id) && po.status === 'Verified'
      );
      
      if (linkedOrders.length > 0) {
        const avgLandedCost = linkedOrders.reduce((sum, po) => sum + po.landedCostPerUnit, 0) / linkedOrders.length;
        unitPrice = avgLandedCost * 2.5;
      }
    }

    const maxQuantity = product.ecuadorStock + product.usaStock; // Total available stock

    const newItem: SalesInvoiceLine & { maxQuantity?: number } = {
      sku: product.sku,
      description: product.description || product.name,
      line: product.line,
      category: product.category,
      quantity: 1,
      unitPrice: unitPrice,
      totalPrice: unitPrice,
      maxQuantity: maxQuantity
    };

    setEditItems([...editItems, newItem]);
    setEditSearchTerm('');
    setEditShowDropdown(false);
  };

  const loadInvoices = async () => {
    try {
      setLoading(true);
      
      // Load ALL invoices first to populate customer dropdown
      const allInvoicesData = await getAllInvoices();
      
      // Apply filters if any are set
      let filteredData = allInvoicesData;
      
      if (filters.clientId) {
        if (filters.clientId === 'walk-in') {
          filteredData = filteredData.filter(inv => !inv.clientId || inv.clientId === '');
        } else {
          filteredData = filteredData.filter(inv => inv.clientId === filters.clientId);
        }
      }
      
      if (filters.paymentStatus) {
        filteredData = filteredData.filter(inv => inv.paymentStatus === filters.paymentStatus);
      }
      
      if (filters.deliveryStatus) {
        filteredData = filteredData.filter(inv => inv.deliveryStatus === filters.deliveryStatus);
      }
      
      if (filters.dateFrom) {
        const fromDate = new Date(filters.dateFrom);
        filteredData = filteredData.filter(inv => inv.date >= fromDate);
      }
      
      if (filters.dateTo) {
        const toDate = new Date(filters.dateTo);
        filteredData = filteredData.filter(inv => inv.date <= toDate);
      }
      
      // Store all invoices for dropdown population
      setAllInvoices(allInvoicesData);
      // Set invoices to filtered data for display
      setInvoices(filteredData);
    } catch (error) {
      console.error('Error loading invoices:', error);
      alert(t('invoiceTracking.errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [filters]);

  const openEditModal = (invoice: SalesInvoice) => {
    setEditingInvoice(invoice);
    
    // Copy items and enrich with maxQuantity from inventory
    const enrichedItems = invoice.items.map(item => {
      // Find the inventory item by SKU
      const inventoryItem = inventory.find(inv => inv.sku === item.sku);
      
      if (inventoryItem) {
        // Calculate maxQuantity: current stock + original quantity
        // This allows increasing quantity up to available stock
        // (original quantity might have been deducted from stock when invoice was created)
        // For sales role, only use Ecuador stock; otherwise use total stock
        const currentStock = user?.role === 'sales' 
          ? inventoryItem.ecuadorStock 
          : (inventoryItem.ecuadorStock + inventoryItem.usaStock);
        const maxQuantity = currentStock + item.quantity;
        
        return {
          ...item,
          maxQuantity: maxQuantity
        } as SalesInvoiceLine & { maxQuantity?: number };
      }
      
      // If inventory item not found, still include the item but without maxQuantity
      // This handles cases where items might have been deleted from inventory
      return item;
    });
    
    setEditItems(enrichedItems);
    setEditDiscountType(invoice.discountType || 'percentage');
    setEditDiscountValue(invoice.discountValue || 0);
    setEditPaymentMethod(invoice.paymentMethod || '');
    setEditPaymentComment(invoice.paymentComment || '');
  };

  const closeEditModal = () => {
    setEditingInvoice(null);
    setEditItems([]);
    setEditDiscountType('percentage');
    setEditDiscountValue(0);
    setEditPaymentMethod('');
    setEditPaymentComment('');
  };

  const handleEditItem = (index: number, field: string, value: string | number) => {
    const updatedItems = [...editItems];
    if (field === 'quantity' || field === 'unitPrice') {
      let parsedValue = parseFloat(String(value)) || 0;
      
        // For quantity, validate against max stock
        if (field === 'quantity') {
          const item = updatedItems[index] as SalesInvoiceLine & { maxQuantity?: number };
        if (item.maxQuantity) {
          parsedValue = Math.min(Math.max(1, parsedValue), item.maxQuantity);
          if (parseFloat(String(value)) > item.maxQuantity) {
            alert(`${t('invoiceTracking.cannotExceedStock')} ${item.maxQuantity}`);
          }
        }
      }
      
      updatedItems[index] = {
        ...updatedItems[index],
        [field]: parsedValue
      };
      updatedItems[index].totalPrice = updatedItems[index].quantity * updatedItems[index].unitPrice;
    } else {
      updatedItems[index] = {
        ...updatedItems[index],
        [field]: value
      };
    }
    setEditItems(updatedItems);
  };

  const removeEditItem = (index: number) => {
    setEditItems(editItems.filter((_, i) => i !== index));
  };

  const addEditItem = () => {
    setEditItems([...editItems, {
      sku: '',
      description: '',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      line: '',
      category: ''
    }]);
  };

  const calculateEditSubtotal = () => {
    return editItems.reduce((sum, item) => sum + item.totalPrice, 0);
  };

  const calculateEditDiscount = () => {
    const subtotal = calculateEditSubtotal();
    if (editDiscountType === 'percentage') {
      return (subtotal * editDiscountValue) / 100;
    }
    return editDiscountValue;
  };

  const calculateEditGrandTotal = () => {
    return calculateEditSubtotal() - calculateEditDiscount();
  };

  const saveInvoiceEdit = async () => {
    if (!editingInvoice) return;
    
    if (editItems.length === 0) {
      alert(t('invoiceTracking.invoiceMustHaveItem'));
      return;
    }

    // Check if invoice was delivered - if so, we need to handle inventory returns
    const wasDelivered = editingInvoice.deliveryStatus === 'Delivered' || editingInvoice.deliveryStatus === 'Partially Delivered';
    
    // Calculate items that need to be returned to inventory
    const itemsToReturn: Array<{description: string, sku: string, quantity: number, currentStock: number, newStock: number}> = [];
    
    if (wasDelivered) {
      // Create a map of new items by SKU
      const newItemsMap = new Map<string, number>();
      editItems.forEach(item => {
        const existingQty = newItemsMap.get(item.sku) || 0;
        newItemsMap.set(item.sku, existingQty + item.quantity);
      });
      
      // Compare with original items
      editingInvoice.items.forEach(originalItem => {
        const newQuantity = newItemsMap.get(originalItem.sku) || 0;
        const originalQuantity = originalItem.quantity;
        
        if (newQuantity < originalQuantity) {
          // Item was removed or quantity reduced
          const quantityToReturn = originalQuantity - newQuantity;
          const inventoryItem = inventory.find(inv => inv.sku === originalItem.sku);
          
          if (inventoryItem) {
            const currentStock = inventoryItem.ecuadorStock;
            const newStock = currentStock + quantityToReturn;
            
            itemsToReturn.push({
              description: originalItem.description,
              sku: originalItem.sku,
              quantity: quantityToReturn,
              currentStock,
              newStock
            });
          }
        }
        
        // Remove from map so we can check for completely removed items
        newItemsMap.delete(originalItem.sku);
      });
    }

    // Show warning if items need to be returned
    if (itemsToReturn.length > 0) {
      setItemsReturningToStock(itemsToReturn);
      setWarningMessage(t('invoiceTracking.itemsRemovedMessage'));
      setWarningCallback(() => async () => {
        setShowWarningModal(false);
        await processInvoiceEditWithReturns(itemsToReturn);
      });
      setShowWarningModal(true);
      return;
    }

    // No items to return, proceed with normal update
    await processInvoiceEditWithReturns([]);
  };

  const processInvoiceEditWithReturns = async (itemsToReturn: Array<{description: string, sku: string, quantity: number, currentStock: number, newStock: number}>) => {
    if (!editingInvoice) return;

    // Return items to inventory first
    for (const itemReturn of itemsToReturn) {
      const inventoryItem = inventory.find(inv => inv.sku === itemReturn.sku);
      if (inventoryItem) {
        await updateInventoryItem(inventoryItem.id, {
          ecuadorStock: itemReturn.newStock
        });
      }
    }

    const newGrandTotal = calculateEditGrandTotal();
    const currentAmountPaid = editingInvoice.amountPaid || 0;
    const newRemainingBalance = Math.max(0, newGrandTotal - currentAmountPaid);

    // Recalculate payment status based on new total and current payments
    let newPaymentStatus: 'Unpaid' | 'Partially Paid' | 'Paid' = editingInvoice.paymentStatus;
    
    if (currentAmountPaid === 0) {
      newPaymentStatus = 'Unpaid';
    } else if (currentAmountPaid >= newGrandTotal || newRemainingBalance <= 0.01) {
      newPaymentStatus = 'Paid';
    } else {
      newPaymentStatus = 'Partially Paid';
    }

    // Recalculate delivery status
    // If new items are added to a fully delivered invoice, it should become Partially Delivered
    let newDeliveryStatus = editingInvoice.deliveryStatus;
    
    if (editingInvoice.deliveryStatus === 'Delivered' && editItems.length > editingInvoice.items.length) {
      newDeliveryStatus = 'Partially Delivered';
    }

    try {
      const updatedInvoice: Partial<SalesInvoice> = {
        items: editItems,
        subtotal: calculateEditSubtotal(),
        discountType: editDiscountType,
        discountValue: editDiscountValue,
        discountTotal: calculateEditDiscount(),
        grandTotal: newGrandTotal,
        remainingBalance: newRemainingBalance,
        paymentStatus: newPaymentStatus,
        deliveryStatus: newDeliveryStatus
      };

      if (editPaymentMethod) {
        updatedInvoice.paymentMethod = editPaymentMethod;
      }
      if (editPaymentComment) {
        updatedInvoice.paymentComment = editPaymentComment;
      }

      await updateInvoice(editingInvoice.id, updatedInvoice);
      
      // Notify user if statuses changed
      let statusChangedMsg = 'Invoice updated successfully';
      if (newPaymentStatus !== editingInvoice.paymentStatus) {
        statusChangedMsg += `\nPayment status changed to: ${newPaymentStatus}`;
      }
      if (newDeliveryStatus !== editingInvoice.deliveryStatus) {
        statusChangedMsg += `\nDelivery status changed to: ${newDeliveryStatus}`;
      }
      if (itemsToReturn.length > 0) {
        statusChangedMsg += `\n${itemsToReturn.length} item(s) returned to inventory.`;
      }
      alert(statusChangedMsg);
      
      closeEditModal();
      loadInvoices();
    } catch (error) {
      console.error('Error updating invoice:', error);
      alert(t('invoiceTracking.errorUpdating'));
    }
  };

  const openDeliveryModal = (invoice: SalesInvoice) => {
    setDeliveryInvoice(invoice);
    setDeliveryNotes(invoice.deliveryNotes || '');
    
    // Initialize delivery items with all items set to 0 initially
    const initialItems: {[key: number]: number} = {};
    invoice.items.forEach((item, index) => {
      initialItems[index] = 0;
    });
    setDeliveryItems(initialItems);
    
    setShowDeliveryModal(true);
  };

  const closeDeliveryModal = () => {
    setShowDeliveryModal(false);
    setDeliveryInvoice(null);
    setDeliveryNotes('');
    setDeliveryItems({});
    setDeliveryDate(new Date().toISOString().split('T')[0]);
  };

  const handleUpdateDeliveryQuantity = (index: number, value: string) => {
    const quantity = parseInt(value) || 0;
    const invoice = deliveryInvoice!;
    
    // Don't allow more than the original quantity
    if (quantity > invoice.items[index].quantity) {
      alert(`${t('invoiceTracking.cannotDeliverMore')} ${invoice.items[index].quantity} ${t('invoiceTracking.units')}`);
      return;
    }
    
    setDeliveryItems({ ...deliveryItems, [index]: quantity });
  };

  const savePartialDelivery = async () => {
    if (!deliveryInvoice) return;

    // Check if at least one item has quantity > 0
    const totalDelivered = Object.values(deliveryItems).reduce((sum, qty) => sum + qty, 0);
    if (totalDelivered === 0) {
      alert(t('invoiceTracking.pleaseSpecifyQuantities'));
      return;
    }

    // Show warning about inventory subtraction with current and remaining stock
    const itemsToSubtract = deliveryInvoice.items
      .filter((item, index) => deliveryItems[index] > 0)
      .map((item, index) => {
        const inventoryItem = inventory.find(inv => inv.sku === item.sku);
        const currentStock = inventoryItem?.ecuadorStock || 0;
        const remainingStock = Math.max(0, currentStock - deliveryItems[index]);
        return `- ${item.description}: ${deliveryItems[index]} units (Ecuador stock: ${currentStock} → ${remainingStock})`;
      })
      .join('\n');

    const warningMessage = `${t('invoiceTracking.warningSubtractInventory')}\n\n` +
      `${t('invoiceTracking.itemsToBeSubtracted')}\n${itemsToSubtract}\n\n` +
      `${t('invoiceTracking.stockLevelsWillBeReduced')}`;

    if (!confirm(warningMessage)) return;

    try {
      const updateData: Partial<SalesInvoice> = {
        deliveryStatus: 'Partially Delivered',
        deliveryDate: new Date(deliveryDate),
        deliveryNotes: deliveryNotes
      };

      await updateInvoice(deliveryInvoice.id, updateData);

      // Update inventory for delivered items only
      for (let i = 0; i < deliveryInvoice.items.length; i++) {
        const quantityToDeliver = deliveryItems[i] || 0;
        if (quantityToDeliver > 0) {
          const item = deliveryInvoice.items[i];
          const inventoryItem = inventory.find(inv => inv.sku === item.sku);
          if (inventoryItem) {
            const newEcuadorStock = Math.max(0, inventoryItem.ecuadorStock - quantityToDeliver);
            await updateInventoryItem(inventoryItem.id, {
              ecuadorStock: newEcuadorStock
            });
          }
        }
      }

      alert('Partial delivery registered successfully');
      closeDeliveryModal();
      loadInvoices();
    } catch (error) {
      console.error('Error updating delivery:', error);
      alert('Error updating delivery status');
    }
  };

  const handleUpdateDelivery = async (invoice: SalesInvoice, status: 'Pending' | 'Partially Delivered' | 'Delivered' | 'Canceled') => {
    // Open modal for partial delivery
    if (status === 'Partially Delivered' && invoice.deliveryStatus === 'Pending') {
      openDeliveryModal(invoice);
      return;
    }

    // Check if we're reversing a delivery (from Delivered/Partially Delivered to Canceled/Pending)
    const isReversingDelivery = (invoice.deliveryStatus === 'Delivered' || invoice.deliveryStatus === 'Partially Delivered') 
      && (status === 'Canceled' || status === 'Pending');
    
    // Check if we're marking as delivered (from Pending/Partially Delivered to Delivered)
    const isMarkingDelivered = status === 'Delivered' && (invoice.deliveryStatus === 'Pending' || invoice.deliveryStatus === 'Partially Delivered');
    
    if (isReversingDelivery) {
      // Calculate items to return to inventory
      const itemsToReturn: Array<{description: string, sku: string, quantity: number, currentStock: number, newStock: number}> = [];
      
      invoice.items.forEach(item => {
        const inventoryItem = inventory.find(inv => inv.sku === item.sku);
        if (inventoryItem) {
          const currentStock = inventoryItem.ecuadorStock;
          // For full delivery reversal, return full quantity. For partial, we'd need to track what was delivered
          // For now, we'll return the full invoice quantity since we don't track partial deliveries per item
          const quantityToReturn = item.quantity;
          const newStock = currentStock + quantityToReturn;
          
          itemsToReturn.push({
            description: item.description,
            sku: item.sku,
            quantity: quantityToReturn,
            currentStock,
            newStock
          });
        }
      });
      
      if (itemsToReturn.length > 0) {
        setItemsReturningToStock(itemsToReturn);
        setWarningMessage(t('invoiceTracking.itemsReturningToStockMessage'));
        setWarningCallback(() => async () => {
          setShowWarningModal(false);
          await processDeliveryUpdateWithReturns(invoice, status, itemsToReturn);
        });
        setShowWarningModal(true);
        return;
      }
    } else if (isMarkingDelivered) {
      // Create warning message with stock information
      const itemsList = invoice.items.map(item => {
        const inventoryItem = inventory.find(inv => inv.sku === item.sku);
        const currentStock = inventoryItem?.ecuadorStock || 0;
        const remainingStock = Math.max(0, currentStock - item.quantity);
        return {
          description: item.description,
          quantity: item.quantity,
          currentStock,
          remainingStock
        };
      });
      
      setWarningItems(itemsList);
      setWarningMessage(t('invoiceTracking.changingStatusWillAffect'));
      setWarningCallback(() => async () => {
        setShowWarningModal(false);
        await processDeliveryUpdate(invoice, status);
      });
      setShowWarningModal(true);
      return;
    } else {
      // For other status changes, use simple confirmation
      const confirmed = confirm(`${t('invoiceTracking.changeDeliveryStatus')} ${status}?`);
      if (!confirmed) return;
    }
    
    await processDeliveryUpdate(invoice, status);
  };

  const processDeliveryUpdate = async (invoice: SalesInvoice, status: string) => {
    try {
      const updateData: Partial<SalesInvoice> = {
        deliveryStatus: status as SalesInvoice['deliveryStatus'],
      };
      
      if (status === 'Delivered') {
        updateData.deliveryDate = new Date();
      }

      await updateInvoice(invoice.id, updateData);

      // Update inventory if delivered (full delivery)
      if (status === 'Delivered') {
        for (const item of invoice.items) {
          const inventoryItem = inventory.find(inv => inv.sku === item.sku);
          if (inventoryItem) {
            const newEcuadorStock = Math.max(0, inventoryItem.ecuadorStock - item.quantity);
            await updateInventoryItem(inventoryItem.id, {
              ecuadorStock: newEcuadorStock
            });
          }
        }
      }

      alert(t('invoiceTracking.deliveryStatusUpdated'));
      loadInvoices();
    } catch (error) {
      console.error('Error updating delivery:', error);
      alert(t('invoiceTracking.errorUpdatingDeliveryStatus'));
    }
  };

  const processDeliveryUpdateWithReturns = async (invoice: SalesInvoice, status: string, itemsToReturn: Array<{description: string, sku: string, quantity: number, currentStock: number, newStock: number}>) => {
    try {
      // Return items to inventory first
      for (const itemReturn of itemsToReturn) {
        const inventoryItem = inventory.find(inv => inv.sku === itemReturn.sku);
        if (inventoryItem) {
          await updateInventoryItem(inventoryItem.id, {
            ecuadorStock: itemReturn.newStock
          });
        }
      }

      const updateData: Partial<SalesInvoice> = {
        deliveryStatus: status as SalesInvoice['deliveryStatus'],
      };
      
      // Clear delivery date if canceling
      if (status === 'Canceled' || status === 'Pending') {
        updateData.deliveryDate = undefined;
      }

      await updateInvoice(invoice.id, updateData);

      alert(t('invoiceTracking.deliveryStatusUpdated') + `\n${itemsToReturn.length} item(s) returned to inventory.`);
      loadInvoices();
    } catch (error) {
      console.error('Error updating delivery:', error);
      alert(t('invoiceTracking.errorUpdatingDeliveryStatus'));
    }
  };

  const openPaymentModal = (invoice: SalesInvoice) => {
    setPaymentInvoice(invoice);
    setShowPaymentModal(true);
    setPaymentAmount('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
  };

  const addPayment = async () => {
    if (!paymentInvoice || !paymentAmount) return;

    const payment = parseFloat(paymentAmount);
    if (isNaN(payment) || payment <= 0) {
      alert(t('invoiceTracking.pleaseEnterValidPayment'));
      return;
    }

    // Allow payment slightly over remaining balance (tolerance for rounding)
    if (payment > paymentInvoice.remainingBalance + 0.01) {
      alert(`${t('invoiceTracking.paymentCannotExceed')} $${paymentInvoice.remainingBalance.toFixed(2)}`);
      return;
    }

    try {
      const newPaymentHistory = paymentInvoice.paymentHistory || [];
      const newPayment: PaymentRecord = {
        date: new Date(paymentDate),
        amount: payment,
      };

      const totalPaid = paymentInvoice.amountPaid + payment;
      const remainingBalance = paymentInvoice.grandTotal - totalPaid;
      
      // Determine status based on payment - automatically change to Paid when fully covered
      // Use a tolerance of 0.01 for floating point precision issues
      let newStatus: 'Unpaid' | 'Partially Paid' | 'Paid' = 'Partially Paid';
      if (totalPaid >= paymentInvoice.grandTotal - 0.01 || remainingBalance <= 0.01) {
        newStatus = 'Paid';
      }

      // Round to 2 decimal places to avoid floating point issues
      const updateData: Partial<SalesInvoice> = {
        paymentStatus: newStatus,
        amountPaid: Math.round(totalPaid * 100) / 100,
        remainingBalance: Math.max(0, Math.round(remainingBalance * 100) / 100),
        paymentHistory: [...newPaymentHistory, newPayment]
      };

      if (newStatus === 'Paid') {
        updateData.paymentDate = new Date();
      }

      await updateInvoice(paymentInvoice.id, updateData);
      alert(t('invoiceTracking.paymentAdded'));
      setShowPaymentModal(false);
      loadInvoices();
    } catch (error) {
      console.error('Error adding payment:', error);
      alert(t('invoiceTracking.errorAddingPayment'));
    }
  };

  const handleUpdatePayment = async (invoice: SalesInvoice, status: 'Unpaid' | 'Partially Paid' | 'Paid') => {
    // Only allow status changes via payment addition
    if (status === 'Partially Paid' && invoice.paymentStatus === 'Unpaid') {
      openPaymentModal(invoice);
      return;
    }
    
    if (status === invoice.paymentStatus) return;

    // Allow changing back to Unpaid only
    if (status === 'Unpaid') {
      try {
        const updateData: Partial<SalesInvoice> = {
          paymentStatus: 'Unpaid',
          amountPaid: 0,
          remainingBalance: invoice.grandTotal,
          paymentHistory: []
        };
        await updateInvoice(invoice.id, updateData);
        loadInvoices();
      } catch (error) {
        console.error('Error updating payment:', error);
        alert(t('invoiceTracking.errorUpdatingDeliveryStatus'));
      }
    }
  };

  const calculateMetrics = () => {
    return {
      totalInvoices: invoices.length,
      unpaidInvoices: invoices.filter(inv => inv.paymentStatus === 'Unpaid').length,
      partiallyPaidInvoices: invoices.filter(inv => inv.paymentStatus === 'Partially Paid').length,
      totalCollected: invoices.reduce((sum, inv) => sum + inv.amountPaid, 0),
      totalPending: invoices.reduce((sum, inv) => sum + inv.remainingBalance, 0)
    };
  };

  const handleGeneratePDFClick = (invoice: SalesInvoice) => {
    setPdfInvoice(invoice);
    setShowPdfLanguageModal(true);
  };

  const generatePDF = async (invoice: SalesInvoice, locale: 'en' | 'es' = 'en') => {
    try {
      // Convert logo image for PDF - use full URL for public assets
      const { convertImageForPDF } = await import('../utils/imageConverter');
      const logoUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}/sasa.png` 
        : '/sasa.png';
      const logoBase64 = await convertImageForPDF(logoUrl);
      
      // Dynamically import PDF components
      const [{ pdf }, { default: InvoicePDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./InvoicePDF')
      ]);

      // Create PDF document with converted logo and locale
      const pdfDocument = <InvoicePDF invoice={invoice} logoSrc={logoBase64 || logoUrl} locale={locale} />;

      // Generate blob
      const instance = pdf(pdfDocument);
      const blob = await instance.toBlob();

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${invoice.invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      // Close modal
      setShowPdfLanguageModal(false);
      setPdfInvoice(null);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
      setShowPdfLanguageModal(false);
      setPdfInvoice(null);
    }
  };

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const sortedInvoices = [...invoices].sort((a, b) => {
    const aValue = a[sortConfig.key as keyof SalesInvoice];
    const bValue = b[sortConfig.key as keyof SalesInvoice];
    // Exclude array properties from direct comparison
    if (sortConfig.key === 'items' || sortConfig.key === 'paymentHistory') {
      return 0;
    }
    let aVal: string | number | Date | undefined = aValue as string | number | Date | undefined;
    let bVal: string | number | Date | undefined = bValue as string | number | Date | undefined;

    // Handle cell sorting
    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = (bVal as string).toLowerCase();
    }

    // Handle date sorting
    if (aVal instanceof Date) {
      aVal = aVal.getTime();
      bVal = (bVal as Date).getTime();
    }

    // Handle undefined/null values
    if (aVal === undefined || aVal === null) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (bVal === undefined || bVal === null) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }

    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig.key !== columnKey) return <span className="text-gray-400">↕</span>;
    return sortConfig.direction === 'asc' ? <span>↑</span> : <span>↓</span>;
  };

  const handleDeleteInvoice = (invoice: SalesInvoice) => {
    // Always calculate items that could be returned (if invoice was delivered)
    const wasDelivered = invoice.deliveryStatus === 'Delivered' || invoice.deliveryStatus === 'Partially Delivered';
    const itemsToReturn: Array<{description: string, sku: string, quantity: number, currentStock: number, newStock: number}> = [];
    
    if (wasDelivered) {
      invoice.items.forEach(item => {
        const inventoryItem = inventory.find(inv => inv.sku === item.sku);
        if (inventoryItem) {
          const currentStock = inventoryItem.ecuadorStock;
          const newStock = currentStock + item.quantity;
          
          itemsToReturn.push({
            description: item.description,
            sku: item.sku,
            quantity: item.quantity,
            currentStock,
            newStock
          });
        }
      });
    }
    
    // Always show modal with both options
    setItemsReturningToStock(itemsToReturn);
    setInvoiceToDelete(invoice);
    setShowDeleteModal(true);
  };

  const deleteInvoiceAndReturnItems = async (invoice: SalesInvoice, itemsToReturn: Array<{description: string, sku: string, quantity: number, currentStock: number, newStock: number}>) => {
    try {
      // Return items to inventory first
      for (const itemReturn of itemsToReturn) {
        const inventoryItem = inventory.find(inv => inv.sku === itemReturn.sku);
        if (inventoryItem) {
          await updateInventoryItem(inventoryItem.id, {
            ecuadorStock: itemReturn.newStock
          });
        }
      }
      
      // Delete the invoice
      await deleteInvoice(invoice.id);
      alert(t('invoiceTracking.invoiceDeleted'));
      loadInvoices();
    } catch (error) {
      console.error('Error deleting invoice:', error);
      alert(t('invoiceTracking.errorDeletingInvoice'));
    }
  };

  const metrics = calculateMetrics();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">{t('invoiceTracking.title')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('invoiceTracking.subtitle')}</p>
        </div>
      </div>

      {/* Summary Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('invoiceTracking.totalInvoices')}</div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{metrics.totalInvoices}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('invoiceTracking.unpaidInvoices')}</div>
          <div className="text-2xl font-bold text-red-600 mt-2">{metrics.unpaidInvoices}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('invoiceTracking.partiallyPaid')}</div>
          <div className="text-2xl font-bold text-yellow-600 mt-2">{metrics.partiallyPaidInvoices}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('invoiceTracking.totalCollected')}</div>
          <div className="text-2xl font-bold text-green-600 mt-2">${metrics.totalCollected.toFixed(2)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('invoiceTracking.pendingCollection')}</div>
          <div className="text-2xl font-bold text-amber-600 mt-2">${metrics.totalPending.toFixed(2)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('invoiceTracking.filter')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('invoiceTracking.customer')}</label>
            <select
              value={filters.clientId}
              onChange={(e) => setFilters({ ...filters, clientId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">{t('invoiceTracking.allCustomers')}</option>
              {uniqueClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('invoiceTracking.paymentStatus')}</label>
            <select
              value={filters.paymentStatus}
              onChange={(e) => setFilters({ ...filters, paymentStatus: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">{t('invoiceTracking.all')}</option>
              <option value="Unpaid">{t('invoiceTracking.unpaid')}</option>
              <option value="Partially Paid">{t('invoiceTracking.partial')}</option>
              <option value="Paid">{t('invoiceTracking.paid')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('invoiceTracking.deliveryStatus')}</label>
            <select
              value={filters.deliveryStatus}
              onChange={(e) => setFilters({ ...filters, deliveryStatus: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">{t('invoiceTracking.all')}</option>
              <option value="Pending">{t('invoiceTracking.pending')}</option>
              <option value="Partially Delivered">{t('invoiceTracking.partiallyDelivered')}</option>
              <option value="Delivered">{t('invoiceTracking.delivered')}</option>
              <option value="Canceled">{t('invoiceTracking.canceled')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('invoiceTracking.dateFrom')}</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('invoiceTracking.dateTo')}</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Invoices List */}
      {loading ? (
        <div className="text-center py-12">{t('invoiceTracking.loadingInvoices')}</div>
      ) : invoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">{t('invoiceTracking.noInvoices')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-max">
            <thead className="bg-gray-50 border-b-2 border-gray-200">
              <tr>
                <th 
                  className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('invoiceNumber')}
                >
                  <div className="flex items-center gap-2">
                    {t('invoiceTracking.facNumber')}
                    <SortIcon columnKey="invoiceNumber" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('clientName')}
                >
                  <div className="flex items-center gap-2">
                    {t('invoiceTracking.customer')}
                    <SortIcon columnKey="clientName" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center gap-2">
                    {t('invoiceTracking.invoiceDate')}
                    <SortIcon columnKey="date" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-right text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('grandTotal')}
                >
                  <div className="flex items-center justify-end gap-2">
                    {t('invoiceTracking.total')}
                    <SortIcon columnKey="grandTotal" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('paymentStatus')}
                >
                  <div className="flex items-center gap-2">
                    {t('invoiceTracking.paymentStatus')}
                    <SortIcon columnKey="paymentStatus" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('deliveryStatus')}
                >
                  <div className="flex items-center gap-2">
                    {t('invoiceTracking.deliveryStatus')}
                    <SortIcon columnKey="deliveryStatus" />
                  </div>
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-700 uppercase">
                  <div className="flex items-center justify-end gap-2">
                    {t('invoiceTracking.totalPaid')}
                    <SortIcon columnKey="amountPaid" />
                  </div>
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-700 uppercase">
                  <div className="flex items-center justify-end gap-2">
                    {t('invoiceTracking.pending')}
                    <SortIcon columnKey="remainingBalance" />
                  </div>
                </th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase">{t('invoiceTracking.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div 
                      className="text-xl font-bold text-[#4f0c1b] cursor-pointer hover:text-[#6b1824] transition-colors" 
                      onClick={() => {
                        setDetailsInvoice(invoice);
                        setShowInvoiceDetailsModal(true);
                      }}
                      title={t('invoiceTracking.clickToViewDetails')}
                    >
                      {invoice.invoiceNumber}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{invoice.clientName}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-700">{new Date(invoice.date).toLocaleDateString()}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-lg font-bold text-[#4f0c1b]">${invoice.grandTotal.toFixed(2)}</div>
                    <div className="text-xs text-gray-500">{invoice.currency}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={invoice.paymentStatus}
                      onChange={(e) => handleUpdatePayment(invoice, e.target.value as SalesInvoice['paymentStatus'])}
                      className="px-3 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="Unpaid">🔴 {t('invoiceTracking.unpaid')}</option>
                      <option value="Partially Paid">🟡 {t('invoiceTracking.partial')}</option>
                      <option value="Paid">🟢 {t('invoiceTracking.paid')}</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={invoice.deliveryStatus}
                      onChange={(e) => handleUpdateDelivery(invoice, e.target.value as SalesInvoice['deliveryStatus'])}
                      className="px-3 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="Pending">⏳ {t('invoiceTracking.pending')}</option>
                      <option value="Partially Delivered">📦 {t('invoiceTracking.partiallyDelivered')}</option>
                      <option value="Delivered">✅ {t('invoiceTracking.delivered')}</option>
                      <option value="Canceled">❌ {t('invoiceTracking.canceled')}</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium text-green-600">${invoice.amountPaid.toFixed(2)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium text-red-600">${invoice.remainingBalance.toFixed(2)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => openPaymentModal(invoice)}
                        className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                        title={t('invoiceTracking.addPayment')}
                      >
                        💰
                      </button>
                      <button
                        onClick={() => openEditModal(invoice)}
                        className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs hover:bg-orange-200"
                        title={t('invoiceTracking.editInvoice')}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleGeneratePDFClick(invoice)}
                        className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200"
                        title={t('invoiceTracking.generatePdf')}
                      >
                        📄
                      </button>
                      <button
                        onClick={() => handleDeleteInvoice(invoice)}
                        className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
                        title={t('invoiceTracking.deleteInvoice')}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">{t('invoiceTracking.editInvoiceTitle')} - {editingInvoice.invoiceNumber}</h3>
            
            {/* Items Table */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-semibold">{t('invoiceTracking.items')}</h4>
              </div>
              
              {/* Inventory Search */}
              <div className="mb-4 relative" ref={editDropdownRef}>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('invoiceTracking.addProductFromInventory')}</label>
                <input
                  type="text"
                  placeholder={t('invoiceTracking.searchBySkuPlaceholder')}
                  value={editSearchTerm}
                  onChange={(e) => {
                    setEditSearchTerm(e.target.value);
                    setEditShowDropdown(true);
                  }}
                  onFocus={() => setEditShowDropdown(true)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                />
                
                {editShowDropdown && getFilteredEditInventory().length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {getFilteredEditInventory().map((product) => (
                      <div
                        key={product.id}
                        onClick={() => addProductToEditItems(product)}
                        className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <div className="font-mono text-sm font-semibold text-[#4f0c1b]">{product.sku}</div>
                        <div className="text-sm text-gray-600">{product.name}</div>
                        <div className="text-xs text-gray-500">{t('invoiceTracking.stock')}: {product.ecuadorStock} | {product.category} - {product.line}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left">{t('invoiceTracking.sku')}</th>
                      <th className="px-2 py-2 text-left">{t('invoiceTracking.description')}</th>
                      <th className="px-2 py-2 text-center">{t('invoiceTracking.qty')}</th>
                      <th className="px-2 py-2 text-right">{t('invoiceTracking.unitPrice')}</th>
                      <th className="px-2 py-2 text-right">{t('invoiceTracking.total')}</th>
                      <th className="px-2 py-2 text-center">{t('invoiceTracking.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editItems.map((item, index) => (
                      <tr key={index} className="border-t">
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={item.sku}
                            onChange={(e) => handleEditItem(index, 'sku', e.target.value)}
                            className="w-full px-2 py-1 border rounded"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => handleEditItem(index, 'description', e.target.value)}
                            className="w-full px-2 py-1 border rounded"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-col items-center gap-1">
                            <input
                              type="number"
                              min="1"
                              max={(item as SalesInvoiceLine & { maxQuantity?: number }).maxQuantity || undefined}
                              value={item.quantity}
                              onChange={(e) => handleEditItem(index, 'quantity', e.target.value)}
                              className="w-20 px-2 py-1 border rounded text-center"
                            />
                            {(item as SalesInvoiceLine & { maxQuantity?: number }).maxQuantity && (
                              <div className="text-xs text-gray-500">
                                {t('invoiceTracking.max')}: {(item as SalesInvoiceLine & { maxQuantity?: number }).maxQuantity}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => handleEditItem(index, 'unitPrice', e.target.value)}
                            className="w-24 px-2 py-1 border rounded text-right"
                          />
                        </td>
                        <td className="px-2 py-2 text-right font-semibold">
                          ${item.totalPrice.toFixed(2)}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            onClick={() => removeEditItem(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            {t('invoiceTracking.remove')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Discount */}
            <div className="mb-6 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t('invoiceTracking.discountType')}</label>
                <select
                  value={editDiscountType}
                  onChange={(e) => setEditDiscountType(e.target.value as 'percentage' | 'flat')}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                >
                  <option value="percentage">{t('invoiceTracking.percentage')} (%)</option>
                  <option value="flat">{t('invoiceTracking.flatAmount')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('invoiceTracking.discountValue')}</label>
                <input
                  type="number"
                  value={editDiscountValue}
                  onChange={(e) => setEditDiscountValue(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                />
              </div>
            </div>

            {/* Payment Method */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">{t('invoiceTracking.paymentMethod')}</label>
              <select
                value={editPaymentMethod}
                onChange={(e) => setEditPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              >
                <option value="">{t('invoiceTracking.selectPaymentMethod')}</option>
                <option value="card">{t('invoiceTracking.card')}</option>
                <option value="cash">{t('invoiceTracking.cash')}</option>
                <option value="transfer">{t('invoiceTracking.transfer')}</option>
              </select>
            </div>

            {/* Payment Comment */}
            {editPaymentMethod && (
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">{t('invoiceTracking.paymentNotes')}</label>
                <textarea
                  value={editPaymentComment}
                  onChange={(e) => setEditPaymentComment(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                />
              </div>
            )}

            {/* Totals */}
            <div className="border-t pt-4 mb-6">
              <div className="flex justify-between mb-2">
                <span>{t('invoiceTracking.subtotal')}:</span>
                <span className="font-semibold">${calculateEditSubtotal().toFixed(2)}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span>{t('invoiceTracking.discount')}:</span>
                <span className="font-semibold">${calculateEditDiscount().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold text-[#4f0c1b] pt-2 border-t">
                <span>{t('invoiceTracking.grandTotal')}:</span>
                <span>${calculateEditGrandTotal().toFixed(2)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={saveInvoiceEdit}
                className="flex-1 px-4 py-2 bg-[#4f0c1b] text-white rounded-lg hover:bg-[#5c1327]"
              >
                {t('invoiceTracking.saveChanges')}
              </button>
              <button
                onClick={closeEditModal}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                {t('invoiceTracking.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && paymentInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">{t('invoiceTracking.addPaymentTitle')} - {paymentInvoice.invoiceNumber}</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('invoiceTracking.paymentAmount')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder={`${t('invoiceTracking.max')}: $${paymentInvoice.remainingBalance.toFixed(2)}`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setPaymentAmount(paymentInvoice.remainingBalance.toFixed(2))}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  {t('invoiceTracking.payFullBalance')} (${paymentInvoice.remainingBalance.toFixed(2)})
                </button>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('invoiceTracking.paymentDate')}</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                />
              </div>

              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{t('invoiceTracking.invoiceTotal')}:</span>
                  <span className="font-semibold">${paymentInvoice.grandTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{t('invoiceTracking.totalPaid')}:</span>
                  <span className="font-semibold text-green-600">${paymentInvoice.amountPaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{t('invoiceTracking.remaining')}:</span>
                  <span className="font-semibold text-red-600">${paymentInvoice.remainingBalance.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={addPayment}
                className="flex-1 px-4 py-2 bg-[#4f0c1b] text-white rounded-lg hover:bg-[#5c1327]"
              >
                {t('invoiceTracking.addPayment')}
              </button>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setPaymentInvoice(null);
                  setPaymentAmount('');
                }}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                {t('invoiceTracking.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Modal */}
      {showDeliveryModal && deliveryInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">{t('invoiceTracking.partialDeliveryTitle')} - {deliveryInvoice.invoiceNumber}</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('invoiceTracking.deliveryDate')}</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('invoiceTracking.deliveryNotesOptional')}</label>
                <textarea
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  rows={3}
                  placeholder={t('invoiceTracking.deliveryNotesPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('invoiceTracking.itemsToDeliver')}</label>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">{t('invoiceTracking.sku')}</th>
                        <th className="px-3 py-2 text-left">{t('invoiceTracking.description')}</th>
                        <th className="px-3 py-2 text-center">{t('invoiceTracking.ordered')}</th>
                        <th className="px-3 py-2 text-center">{t('invoiceTracking.delivering')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {deliveryInvoice.items.map((item, index) => (
                        <tr key={index}>
                          <td className="px-3 py-2 font-mono text-xs">{item.sku}</td>
                          <td className="px-3 py-2">{item.description}</td>
                          <td className="px-3 py-2 text-center">{item.quantity}</td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="number"
                              min="0"
                              max={item.quantity}
                              value={deliveryItems[index] || 0}
                              onChange={(e) => handleUpdateDeliveryQuantity(index, e.target.value)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm text-blue-800">
                  <strong>{t('invoiceTracking.note')}</strong> {t('invoiceTracking.noteOnlyQuantities')}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={savePartialDelivery}
                className="flex-1 px-4 py-2 bg-[#4f0c1b] text-white rounded-lg hover:bg-[#5c1327]"
              >
                {t('invoiceTracking.registerPartialDelivery')}
              </button>
              <button
                onClick={closeDeliveryModal}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                {t('invoiceTracking.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Details Modal */}
      {showInvoiceDetailsModal && detailsInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-2xl font-bold text-[#4f0c1b]">{detailsInvoice.invoiceNumber}</h3>
              <button
                onClick={() => {
                  setShowInvoiceDetailsModal(false);
                  setDetailsInvoice(null);
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-6">
              {/* Client Information */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">{t('invoiceTracking.clientInformation')}</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">{t('invoiceTracking.clientName')}:</span>
                    <span className="ml-2 font-medium">{detailsInvoice.clientName}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">{t('invoiceTracking.address')}:</span>
                    <span className="ml-2 font-medium">{detailsInvoice.clientAddress}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">{t('invoiceTracking.date')}:</span>
                    <span className="ml-2 font-medium">{new Date(detailsInvoice.date).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">{t('invoiceTracking.currency')}:</span>
                    <span className="ml-2 font-medium">{detailsInvoice.currency}</span>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">{t('invoiceTracking.items')}</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">{t('invoiceTracking.sku')}</th>
                        <th className="px-3 py-2 text-left">{t('invoiceTracking.description')}</th>
                        <th className="px-3 py-2 text-center">{t('invoiceTracking.qty')}</th>
                        <th className="px-3 py-2 text-right">{t('invoiceTracking.unitPrice')}</th>
                        <th className="px-3 py-2 text-right">{t('invoiceTracking.total')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {detailsInvoice.items.map((item, index) => (
                        <tr key={index}>
                          <td className="px-3 py-2 font-mono text-xs">{item.sku}</td>
                          <td className="px-3 py-2">{item.description}</td>
                          <td className="px-3 py-2 text-center">{item.quantity}</td>
                          <td className="px-3 py-2 text-right">${item.unitPrice.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">${item.totalPrice.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>{t('invoiceTracking.subtotal')}:</span>
                    <span className="font-medium">${detailsInvoice.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('invoiceTracking.discount')} {detailsInvoice.discountType === 'percentage' ? `(${detailsInvoice.discountValue}%)` : ''}:</span>
                    <span className="font-medium text-red-600">-${detailsInvoice.discountTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-[#4f0c1b] pt-2 border-t border-gray-300">
                    <span>{t('invoiceTracking.grandTotal')}:</span>
                    <span>${detailsInvoice.grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Information */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">{t('invoiceTracking.paymentStatus')}</h4>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <div className="text-xs text-gray-600 uppercase">{t('invoiceTracking.status')}</div>
                    <div className="font-semibold text-blue-700">
                      {detailsInvoice.paymentStatus === 'Unpaid' && `🔴 ${t('invoiceTracking.unpaid')}`}
                      {detailsInvoice.paymentStatus === 'Partially Paid' && `🟡 ${t('invoiceTracking.partial')}`}
                      {detailsInvoice.paymentStatus === 'Paid' && `🟢 ${t('invoiceTracking.paid')}`}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 uppercase">{t('invoiceTracking.amountPaid')}</div>
                    <div className="font-semibold text-green-600">${detailsInvoice.amountPaid.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 uppercase">{t('invoiceTracking.remaining')}</div>
                    <div className="font-semibold text-red-600">${detailsInvoice.remainingBalance.toFixed(2)}</div>
                  </div>
                </div>

                {detailsInvoice.paymentHistory && detailsInvoice.paymentHistory.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-gray-700 uppercase mb-2">{t('invoiceTracking.paymentHistory')}</div>
                    <div className="space-y-2">
                      {detailsInvoice.paymentHistory.map((payment, index) => (
                        <div key={index} className="flex justify-between text-sm bg-white p-2 rounded">
                          <span className="text-gray-600">
                            {new Date(payment.date).toLocaleDateString()}
                            {payment.method && ` (${payment.method})`}
                          </span>
                          <span className="font-semibold text-green-600">${payment.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Delivery Information */}
              <div className="bg-purple-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">{t('invoiceTracking.deliveryStatus')}</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-gray-600 uppercase">{t('invoiceTracking.status')}</div>
                    <div className="font-semibold text-purple-700">
                      {detailsInvoice.deliveryStatus === 'Pending' && `⏳ ${t('invoiceTracking.pending')}`}
                      {detailsInvoice.deliveryStatus === 'Partially Delivered' && `📦 ${t('invoiceTracking.partiallyDelivered')}`}
                      {detailsInvoice.deliveryStatus === 'Delivered' && `✅ ${t('invoiceTracking.delivered')}`}
                      {detailsInvoice.deliveryStatus === 'Canceled' && `❌ ${t('invoiceTracking.canceled')}`}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 uppercase">{t('invoiceTracking.deliveryDate')}</div>
                    <div className="font-medium">
                      {detailsInvoice.deliveryDate 
                        ? new Date(detailsInvoice.deliveryDate).toLocaleDateString()
                        : t('invoiceTracking.na')}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 uppercase">{t('invoiceTracking.salesAgent')}</div>
                    <div className="font-medium">{detailsInvoice.salesAgent || t('invoiceTracking.na')}</div>
                  </div>
                </div>
                {detailsInvoice.deliveryNotes && (
                  <div className="mt-4">
                    <div className="text-xs text-gray-600 uppercase mb-1">{t('invoiceTracking.deliveryNotes')}</div>
                    <div className="text-sm bg-white p-2 rounded">{detailsInvoice.deliveryNotes}</div>
                  </div>
                )}
              </div>

              {/* Payment Method (if exists) */}
              {detailsInvoice.paymentMethod && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">{t('invoiceTracking.paymentMethod')}</h4>
                  <div className="text-sm">
                    <span className="font-medium">{detailsInvoice.paymentMethod.charAt(0).toUpperCase() + detailsInvoice.paymentMethod.slice(1)}</span>
                    {detailsInvoice.paymentComment && (
                      <div className="mt-2 text-gray-600">{detailsInvoice.paymentComment}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => handleGeneratePDFClick(detailsInvoice)}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                {t('invoiceTracking.generatePdf')}
              </button>
              <button
                onClick={() => {
                  setShowInvoiceDetailsModal(false);
                  setDetailsInvoice(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                {t('invoiceTracking.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warning Modal */}
      {showWarningModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="text-4xl">⚠️</div>
              <h3 className="text-xl font-bold text-orange-600">{t('invoiceTracking.inventoryImpactWarning')}</h3>
            </div>
            
            <p className="text-gray-700 mb-4">
              {warningMessage}
            </p>
            
            {warningItems.length > 0 && (
              <div className="bg-orange-50 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-gray-900 mb-3">{t('invoiceTracking.ecuadorStockImpact')}</h4>
                <div className="space-y-2">
                  {warningItems.map((item, index) => (
                    <div key={index} className="flex justify-between items-center bg-white rounded p-2">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{item.description}</div>
                        <div className="text-sm text-gray-600">{t('invoiceTracking.delivering')}: {item.quantity} {t('invoiceTracking.units')}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-600">{t('invoiceTracking.ecuadorStock')}</div>
                        <div className="font-semibold text-orange-600">
                          {item.currentStock} → {item.remainingStock}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {itemsReturningToStock.length > 0 && (
              <div className="bg-green-50 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-gray-900 mb-3">{t('invoiceTracking.itemsReturningToStock')}</h4>
                <div className="space-y-2">
                  {itemsReturningToStock.map((item, index) => (
                    <div key={index} className="flex justify-between items-center bg-white rounded p-2">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{item.description}</div>
                        <div className="text-sm text-gray-600">{t('invoiceTracking.quantityReturning')}: {item.quantity} {t('invoiceTracking.units')}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-600">{t('invoiceTracking.ecuadorStock')}</div>
                        <div className="font-semibold text-green-600">
                          {item.currentStock} → {item.newStock}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="bg-blue-50 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>{t('invoiceTracking.note')}</strong> {itemsReturningToStock.length > 0 ? t('invoiceTracking.returningToStock') : t('invoiceTracking.stockLevelsWillBeReduced')}
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowWarningModal(false);
                  setWarningItems([]);
                  setItemsReturningToStock([]);
                  setWarningCallback(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
              >
                {t('invoiceTracking.cancel')}
              </button>
              <button
                onClick={() => {
                  if (warningCallback) {
                    warningCallback();
                  }
                }}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium"
              >
                {t('invoiceTracking.confirmAndUpdate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && invoiceToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="text-4xl">🗑️</div>
              <h3 className="text-xl font-bold text-red-600">{t('invoiceTracking.deleteInvoice')}</h3>
            </div>
            
            <p className="text-gray-700 mb-6 font-medium">
              {t('invoiceTracking.deleteInvoiceOptions')}
            </p>
            
            {itemsReturningToStock.length > 0 && (
              <div className="bg-blue-50 rounded-lg p-4 mb-6">
                <h4 className="font-semibold text-gray-900 mb-3">{t('invoiceTracking.itemsReturningToStock')}</h4>
                <p className="text-sm text-gray-700 mb-3">{t('invoiceTracking.itemsReturningToStockMessage')}</p>
                <div className="space-y-2">
                  {itemsReturningToStock.map((item, index) => (
                    <div key={index} className="flex justify-between items-center bg-white rounded p-2">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{item.description}</div>
                        <div className="text-sm text-gray-600">{t('invoiceTracking.quantityReturning')}: {item.quantity} {t('invoiceTracking.units')}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-600">{t('invoiceTracking.ecuadorStock')}</div>
                        <div className="font-semibold text-green-600">
                          {item.currentStock} → {item.newStock}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Two Options */}
            <div className="space-y-3 mb-6">
              {/* Option 1: Reverse and Return */}
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  if (invoiceToDelete) {
                    deleteInvoiceAndReturnItems(invoiceToDelete, itemsReturningToStock);
                  }
                  setInvoiceToDelete(null);
                  setItemsReturningToStock([]);
                }}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-left transition-colors"
              >
                <div className="font-semibold mb-1">{t('invoiceTracking.reverseAndReturn')}</div>
                <div className="text-sm opacity-90">{t('invoiceTracking.reverseAndReturnDescription')}</div>
              </button>
              
              {/* Option 2: Cancel without affecting */}
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  if (invoiceToDelete) {
                    deleteInvoiceAndReturnItems(invoiceToDelete, []);
                  }
                  setInvoiceToDelete(null);
                  setItemsReturningToStock([]);
                }}
                className="w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-left transition-colors"
              >
                <div className="font-semibold mb-1">{t('invoiceTracking.cancelWithoutAffecting')}</div>
                <div className="text-sm opacity-90">{t('invoiceTracking.cancelWithoutAffectingDescription')}</div>
              </button>
            </div>
            
            {/* Cancel Button */}
            <button
              onClick={() => {
                setShowDeleteModal(false);
                setInvoiceToDelete(null);
                setItemsReturningToStock([]);
              }}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
            >
              {t('invoiceTracking.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* PDF Language Selection Modal */}
      {showPdfLanguageModal && pdfInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">{t('pdf.selectLanguage')}</h3>
            <p className="text-sm text-gray-600 mb-6">{t('pdf.selectLanguageForPdf')}</p>
            
            <div className="space-y-3 mb-6">
              <button
                onClick={() => generatePDF(pdfInvoice, 'en')}
                className="w-full px-4 py-3 bg-[#4f0c1b] text-white rounded-lg hover:bg-[#5c1327] transition-colors font-medium text-left flex items-center justify-between"
              >
                <span>{t('language.english')}</span>
                <span>🇺🇸</span>
              </button>
              <button
                onClick={() => generatePDF(pdfInvoice, 'es')}
                className="w-full px-4 py-3 bg-[#4f0c1b] text-white rounded-lg hover:bg-[#5c1327] transition-colors font-medium text-left flex items-center justify-between"
              >
                <span>{t('language.spanish')}</span>
                <span>🇪🇸</span>
              </button>
            </div>

            <button
              onClick={() => {
                setShowPdfLanguageModal(false);
                setPdfInvoice(null);
              }}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              {t('invoiceTracking.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
