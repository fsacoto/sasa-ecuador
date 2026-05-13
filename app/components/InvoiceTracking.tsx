'use client';

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { SalesInvoice, Client, PaymentRecord } from '../types';
import { getAllInvoices, updateInvoice, deleteInvoice } from '../services/invoicesService';
import { getAllClients } from '../services/clientsService';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';
import { useTranslation } from '../context/TranslationContext';
import { downloadSalesInvoicePdf } from '../utils/salesInvoicePdf';
import AlertDialog from './ui/AlertDialog';
import ConfirmDialog from './ui/ConfirmDialog';
import InvoiceEditModal from './InvoiceEditModal';
import MonthYearSelectEs from './ui/MonthYearSelectEs';
import { formatDateDMY, formatMonthYearLong } from '../utils/formatDate';

function GroupByLayersIcon({ className = 'h-4 w-4 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  );
}

function formatTrackingMonthGroupLabel(ymKey: string): string {
  const parts = ymKey.split('-');
  if (parts.length !== 2) return ymKey;
  const y = parseInt(parts[0], 10);
  const mo = parseInt(parts[1], 10);
  if (Number.isNaN(y) || Number.isNaN(mo) || mo < 1 || mo > 12) return ymKey;
  const raw = formatMonthYearLong(new Date(y, mo - 1, 1));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default function InvoiceTracking() {
  const { user } = useAuth();
  const { inventory, updateInventoryItem } = useInventory();
  const { t } = useTranslation();
  const [allInvoices, setAllInvoices] = useState<SalesInvoice[]>([]);
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [uniqueClients, setUniqueClients] = useState<{id: string, name: string}[]>([]);
  const [filters, setFilters] = useState({
    clientId: '',
    paymentStatus: '',
    deliveryStatus: '',
    filterMonth: '',
    dateFrom: '',
    dateTo: ''
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [groupByField, setGroupByField] = useState<string>('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [showGroupByPanel, setShowGroupByPanel] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'}>({key: 'date', direction: 'desc'});
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [showModal, setShowModal] = useState(false);
  
  // Edit modal (shared component)
  const [editingInvoice, setEditingInvoice] = useState<SalesInvoice | null>(null);
  
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

  /** Which invoice row has the actions dropdown open (one at a time) */
  const [invoiceActionsMenuId, setInvoiceActionsMenuId] = useState<string | null>(null);
  const [actionsMenuPos, setActionsMenuPos] = useState<{ top: number; left: number } | null>(null);
  const invoiceActionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const highlightFocusTimeoutRef = useRef<number | null>(null);
  const focusScrollTimeoutRef = useRef<number | null>(null);

  /** Fila resaltada al llegar desde Notas de ventas → Ver en seguimiento */
  const [highlightFocusRowId, setHighlightFocusRowId] = useState<string | null>(null);

  const MENU_MIN_WIDTH = 192; // matches min-w-[12rem]

  const syncActionsMenuPosition = useCallback(() => {
    const btn = invoiceActionsButtonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const pad = 8;
    let left = r.right - MENU_MIN_WIDTH;
    left = Math.max(pad, Math.min(left, window.innerWidth - MENU_MIN_WIDTH - pad));
    setActionsMenuPos({ top: r.bottom + 4, left });
  }, []);

  const closeInvoiceActionsMenu = useCallback(() => {
    setInvoiceActionsMenuId(null);
    setActionsMenuPos(null);
    invoiceActionsButtonRef.current = null;
  }, []);

  // Alert and Confirm dialog state
  const [alertDialog, setAlertDialog] = useState<{open: boolean, title?: string, message: string}>({open: false, message: ''});
  const [confirmDialog, setConfirmDialog] = useState<{open: boolean, title?: string, message: string, onConfirm: () => void}>({open: false, message: '', onConfirm: () => {}});

  // Helper functions for styled alerts and confirms
  const showAlert = (message: string, title?: string) => {
    setAlertDialog({ open: true, message, title });
  };

  const showConfirm = (message: string, onConfirm: () => void, title?: string) => {
    setConfirmDialog({ open: true, message, onConfirm, title });
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!toolbarRef.current?.contains(e.target as Node)) {
        setShowFiltersPanel(false);
        setShowGroupByPanel(false);
        setShowSearchPanel(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  useEffect(() => {
    const closeOnOutside = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('[data-invoice-actions-root]');
      if (!el) closeInvoiceActionsMenu();
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [closeInvoiceActionsMenu]);

  useLayoutEffect(() => {
    if (!invoiceActionsMenuId) {
      setActionsMenuPos(null);
      return;
    }
    syncActionsMenuPosition();
  }, [invoiceActionsMenuId, syncActionsMenuPosition]);

  useEffect(() => {
    if (!invoiceActionsMenuId) return;
    const onScrollOrResize = () => syncActionsMenuPosition();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [invoiceActionsMenuId, syncActionsMenuPosition]);

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

  const openEditModal = (inv: SalesInvoice) => setEditingInvoice(inv);
  const closeEditModal = () => setEditingInvoice(null);

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

      if (filters.filterMonth) {
        const parts = filters.filterMonth.split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (!Number.isNaN(y) && !Number.isNaN(m)) {
          filteredData = filteredData.filter((inv) => {
            const d = new Date(inv.date);
            return d.getFullYear() === y && d.getMonth() === m;
          });
        }
      }
      
      if (filters.dateFrom) {
        const fromDate = new Date(filters.dateFrom);
        filteredData = filteredData.filter(inv => inv.date >= fromDate);
      }
      
      if (filters.dateTo) {
        const toDate = new Date(filters.dateTo);
        toDate.setHours(23, 59, 59, 999);
        filteredData = filteredData.filter(inv => inv.date <= toDate);
      }
      
      // Store all invoices for dropdown population
      setAllInvoices(allInvoicesData);
      // Set invoices to filtered data for display
      setInvoices(filteredData);
    } catch (error) {
      console.error('Error loading invoices:', error);
      showAlert(t('invoiceTracking.errorLoading'), 'Error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [filters]);

  useEffect(() => {
    return () => {
      if (highlightFocusTimeoutRef.current) {
        window.clearTimeout(highlightFocusTimeoutRef.current);
        highlightFocusTimeoutRef.current = null;
      }
      if (focusScrollTimeoutRef.current) {
        window.clearTimeout(focusScrollTimeoutRef.current);
        focusScrollTimeoutRef.current = null;
      }
    };
  }, []);

  /** Abrir fila desde Notas de ventas (misma colección Firestore): scroll + resaltado temporal. */
  useEffect(() => {
    if (loading || invoices.length === 0) return;
    const id = sessionStorage.getItem('sasa_focus_invoice_tracking_id');
    if (!id) return;
    const q = searchQuery.trim().toLowerCase();
    const visible = !q
      ? invoices
      : invoices.filter(
          (inv) =>
            inv.invoiceNumber.toLowerCase().includes(q) ||
            inv.clientName.toLowerCase().includes(q) ||
            inv.items.some(
              (i) => i.sku.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
            )
        );
    if (!visible.some((inv) => inv.id === id)) return;
    sessionStorage.removeItem('sasa_focus_invoice_tracking_id');

    const scrollToRow = () => {
      document.getElementById(`invoice-tracking-row-${id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToRow);
    });
    if (focusScrollTimeoutRef.current) window.clearTimeout(focusScrollTimeoutRef.current);
    focusScrollTimeoutRef.current = window.setTimeout(scrollToRow, 200);

    setHighlightFocusRowId(id);
    if (highlightFocusTimeoutRef.current) {
      window.clearTimeout(highlightFocusTimeoutRef.current);
    }
    highlightFocusTimeoutRef.current = window.setTimeout(() => {
      highlightFocusTimeoutRef.current = null;
      setHighlightFocusRowId(null);
    }, 4000);
  }, [loading, invoices, searchQuery]);

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
      showAlert(`${t('invoiceTracking.cannotDeliverMore')} ${invoice.items[index].quantity} ${t('invoiceTracking.units')}`, 'Validation Error');
      return;
    }
    
    setDeliveryItems({ ...deliveryItems, [index]: quantity });
  };

  const savePartialDelivery = async () => {
    if (!deliveryInvoice) return;

    // Check if at least one item has quantity > 0
    const totalDelivered = Object.values(deliveryItems).reduce((sum, qty) => sum + qty, 0);
    if (totalDelivered === 0) {
      showAlert(t('invoiceTracking.pleaseSpecifyQuantities'), 'Validation Error');
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

    showConfirm(
      warningMessage,
      () => {
        processPartialDeliveryConfirmed();
      },
      t('invoiceTracking.confirmDelivery') || 'Confirm Delivery'
    );
  };

  const processPartialDeliveryConfirmed = async () => {
    if (!deliveryInvoice) return;

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

      showAlert(t('invoiceTracking.partialDeliveryRegistered') || 'Partial delivery registered successfully', 'Success');
      closeDeliveryModal();
      loadInvoices();
    } catch (error) {
      console.error('Error updating delivery:', error);
      showAlert(t('invoiceTracking.errorUpdatingDeliveryStatus'), 'Error');
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
      showConfirm(
        `${t('invoiceTracking.changeDeliveryStatus')} ${status}?`,
        () => {
          processDeliveryUpdate(invoice, status);
        },
        t('invoiceTracking.confirmStatusChange') || 'Confirm Status Change'
      );
      return;
    }
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

      showAlert(t('invoiceTracking.deliveryStatusUpdated'), 'Success');
      loadInvoices();
    } catch (error) {
      console.error('Error updating delivery:', error);
      showAlert(t('invoiceTracking.errorUpdatingDeliveryStatus'), 'Error');
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

      showAlert(t('invoiceTracking.deliveryStatusUpdated') + `\n${itemsToReturn.length} ${t('invoiceTracking.itemsReturned') || 'item(s) returned to inventory'}.`, 'Success');
      loadInvoices();
    } catch (error) {
      console.error('Error updating delivery:', error);
      showAlert(t('invoiceTracking.errorUpdatingDeliveryStatus'), 'Error');
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
      showAlert(t('invoiceTracking.pleaseEnterValidPayment'), 'Validation Error');
      return;
    }

    // Allow payment slightly over remaining balance (tolerance for rounding)
    if (payment > paymentInvoice.remainingBalance + 0.01) {
      showAlert(`${t('invoiceTracking.paymentCannotExceed')} $${paymentInvoice.remainingBalance.toFixed(2)}`, 'Validation Error');
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
      showAlert(t('invoiceTracking.paymentAdded'), 'Success');
      setShowPaymentModal(false);
      loadInvoices();
    } catch (error) {
      console.error('Error adding payment:', error);
      showAlert(t('invoiceTracking.errorAddingPayment'), 'Error');
    }
  };

  const handleUpdatePayment = async (invoice: SalesInvoice, status: 'Unpaid' | 'Partially Paid' | 'Paid') => {
    // Don't do anything if status hasn't changed
    if (status === invoice.paymentStatus) return;

    // Handle transition to Unpaid (reset all payments)
    if (status === 'Unpaid') {
      try {
        const updateData: Partial<SalesInvoice> = {
          paymentStatus: 'Unpaid',
          amountPaid: 0,
          remainingBalance: invoice.grandTotal,
          paymentHistory: [],
          paymentDate: undefined
        };
        await updateInvoice(invoice.id, updateData);
        loadInvoices();
      } catch (error) {
        console.error('Error updating payment:', error);
        showAlert(t('invoiceTracking.errorUpdatingDeliveryStatus'), 'Error');
      }
      return;
    }

    // Handle transitions that require adding payment
    if (status === 'Partially Paid') {
      // If moving from Unpaid to Partially Paid, open payment modal
      if (invoice.paymentStatus === 'Unpaid') {
        openPaymentModal(invoice);
        return;
      }
      // If moving from Paid to Partially Paid, allow direct change
      // Status will be recalculated based on amountPaid vs grandTotal
      if (invoice.paymentStatus === 'Paid') {
        try {
          // Recalculate status based on current amountPaid
          const remainingBalance = Math.max(0, invoice.grandTotal - invoice.amountPaid);
          let newStatus: 'Unpaid' | 'Partially Paid' | 'Paid' = 'Partially Paid';
          if (invoice.amountPaid === 0) {
            newStatus = 'Unpaid';
          } else if (remainingBalance <= 0.01) {
            newStatus = 'Paid';
          }
          
          const updateData: Partial<SalesInvoice> = {
            paymentStatus: newStatus,
            remainingBalance: Math.round(remainingBalance * 100) / 100
          };
          await updateInvoice(invoice.id, updateData);
          loadInvoices();
        } catch (error) {
          console.error('Error updating payment:', error);
          showAlert(t('invoiceTracking.errorUpdatingDeliveryStatus'), 'Error');
        }
        return;
      }
    }

    // Handle transition to Paid
    if (status === 'Paid') {
      // If already fully paid or very close, just update status
      if (invoice.amountPaid >= invoice.grandTotal - 0.01) {
        try {
          const updateData: Partial<SalesInvoice> = {
            paymentStatus: 'Paid',
            remainingBalance: 0,
            paymentDate: invoice.paymentDate || new Date()
          };
          await updateInvoice(invoice.id, updateData);
          loadInvoices();
        } catch (error) {
          console.error('Error updating payment:', error);
          showAlert(t('invoiceTracking.errorUpdatingDeliveryStatus'), 'Error');
        }
        return;
      }
      // If not fully paid, open payment modal to add remaining payment
      openPaymentModal(invoice);
      return;
    }
  };

  const invoicesSearchFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.clientName.toLowerCase().includes(q) ||
        inv.items.some(
          (i) => i.sku.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
        )
    );
  }, [invoices, searchQuery]);

  const metrics = useMemo(
    () => ({
      totalInvoices: invoicesSearchFiltered.length,
      unpaidInvoices: invoicesSearchFiltered.filter((inv) => inv.paymentStatus === 'Unpaid').length,
      partiallyPaidInvoices: invoicesSearchFiltered.filter((inv) => inv.paymentStatus === 'Partially Paid').length,
      totalCollected: invoicesSearchFiltered.reduce((sum, inv) => sum + inv.amountPaid, 0),
      totalPending: invoicesSearchFiltered.reduce((sum, inv) => sum + inv.remainingBalance, 0),
    }),
    [invoicesSearchFiltered]
  );

  const sortedInvoices = useMemo(() => {
    return [...invoicesSearchFiltered].sort((a, b) => {
      const aValue = a[sortConfig.key as keyof SalesInvoice];
      const bValue = b[sortConfig.key as keyof SalesInvoice];
      if (sortConfig.key === 'items' || sortConfig.key === 'paymentHistory') {
        return 0;
      }
      let aVal: string | number | Date | undefined = aValue as string | number | Date | undefined;
      let bVal: string | number | Date | undefined = bValue as string | number | Date | undefined;

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
      }

      if (aVal instanceof Date) {
        aVal = aVal.getTime();
        bVal = (bVal as Date).getTime();
      }

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
  }, [invoicesSearchFiltered, sortConfig]);

  const groupedInvoiceMap = useMemo(() => {
    if (!groupByField) return null;
    const groups: Record<string, SalesInvoice[]> = {};
    for (const inv of sortedInvoices) {
      let key = '';
      if (groupByField === 'clientName') key = inv.clientName || '—';
      else if (groupByField === 'paymentStatus') key = inv.paymentStatus;
      else if (groupByField === 'deliveryStatus') key = inv.deliveryStatus;
      else if (groupByField === 'month') {
        const d = new Date(inv.date);
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(inv);
    }
    return groups;
  }, [sortedInvoices, groupByField]);

  const sortedGroupEntries = useMemo(() => {
    if (!groupedInvoiceMap) return [] as [string, SalesInvoice[]][];
    const entries = Object.entries(groupedInvoiceMap);
    const paymentOrder: Record<string, number> = {
      Unpaid: 0,
      'Partially Paid': 1,
      Paid: 2,
    };
    const deliveryOrder: Record<string, number> = {
      Pending: 0,
      'Partially Delivered': 1,
      Delivered: 2,
      Canceled: 3,
    };
    if (groupByField === 'month') entries.sort(([a], [b]) => a.localeCompare(b));
    else if (groupByField === 'clientName')
      entries.sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    else if (groupByField === 'paymentStatus')
      entries.sort(([a], [b]) => (paymentOrder[a] ?? 99) - (paymentOrder[b] ?? 99));
    else if (groupByField === 'deliveryStatus')
      entries.sort(([a], [b]) => (deliveryOrder[a] ?? 99) - (deliveryOrder[b] ?? 99));
    return entries;
  }, [groupedInvoiceMap, groupByField]);

  useEffect(() => {
    if (!groupByField || !groupedInvoiceMap) {
      setExpandedGroups(new Set());
      return;
    }
    setExpandedGroups(new Set(Object.keys(groupedInvoiceMap)));
  }, [groupByField, groupedInvoiceMap]);

  const handleGeneratePDFClick = (invoice: SalesInvoice) => {
    void downloadSalesInvoicePdf(invoice).catch((error) => {
      console.error('Error generating PDF:', error);
      showAlert(
        t('invoiceTracking.pdfGenerationFailed') || 'Failed to generate PDF. Please try again.',
        'Error'
      );
    });
  };

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

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
      showAlert(t('invoiceTracking.invoiceDeleted'), 'Success');
      loadInvoices();
    } catch (error) {
      console.error('Error deleting invoice:', error);
      showAlert(t('invoiceTracking.errorDeletingInvoice'), 'Error');
    }
  };

  const activeFiltersCount = [
    filters.clientId,
    filters.paymentStatus,
    filters.deliveryStatus,
    filters.filterMonth,
    filters.dateFrom,
    filters.dateTo,
  ].filter(Boolean).length;

  const groupDisplayLabel = (groupKey: string) => {
    if (groupByField === 'month') {
      return `${t('salesNotes.monthLabel')}: ${formatTrackingMonthGroupLabel(groupKey)}`;
    }
    if (groupByField === 'clientName') return groupKey;
    if (groupByField === 'paymentStatus') {
      if (groupKey === 'Paid') return t('invoiceTracking.paid');
      if (groupKey === 'Partially Paid') return t('invoiceTracking.partial');
      return t('invoiceTracking.unpaid');
    }
    if (groupByField === 'deliveryStatus') {
      if (groupKey === 'Delivered') return t('invoiceTracking.delivered');
      if (groupKey === 'Partially Delivered') return t('invoiceTracking.partiallyDelivered');
      if (groupKey === 'Canceled') return t('invoiceTracking.canceled');
      return t('invoiceTracking.pending');
    }
    return groupKey;
  };

  const renderInvoiceRow = (invoice: SalesInvoice) => (
    <tr
      key={invoice.id}
      id={`invoice-tracking-row-${invoice.id}`}
      className={`transition-[background-color,box-shadow] duration-500 ${
        highlightFocusRowId === invoice.id
          ? 'bg-gray-100 shadow-[inset_0_0_0_2px_rgba(107,114,128,0.55)] hover:bg-gray-100'
          : 'hover:bg-gray-50'
      }`}
    >
      <td className="px-6 py-4 whitespace-nowrap">
        <div
          className="text-xl font-bold text-[#515151] cursor-pointer hover:text-[#000000] transition-colors"
          onClick={() => {
            setDetailsInvoice(invoice);
            setShowInvoiceDetailsModal(true);
          }}
          title={t('invoiceTracking.clickToViewDetails')}
        >
          {invoice.invoiceNumber}
        </div>
        {invoice.sourceConsignmentId && (
          <div className="mt-1 text-xs font-medium text-amber-800">
            {t('consignments.sourceConsignmentTag') || 'Consignación'}: {invoice.sourceConsignmentId}
          </div>
        )}
      </td>
      <td className="px-6 py-4">
        <div className="text-sm font-medium text-gray-900">{invoice.clientName}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-700">{formatDateDMY(invoice.date)}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right">
        <div className="text-lg font-bold text-[#515151]">${invoice.grandTotal.toFixed(2)}</div>
        <div className="text-xs text-gray-500">{invoice.currency}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <select
          value={invoice.paymentStatus}
          onChange={(e) => handleUpdatePayment(invoice, e.target.value as SalesInvoice['paymentStatus'])}
          className="rounded border border-gray-300 px-3 py-1 text-sm"
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
          className="rounded border border-gray-300 px-3 py-1 text-sm"
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
        <div className="inline-flex justify-center" data-invoice-actions-root>
          <button
            type="button"
            onClick={(e) => {
              const opening = invoiceActionsMenuId !== invoice.id;
              if (opening) {
                invoiceActionsButtonRef.current = e.currentTarget;
                setInvoiceActionsMenuId(invoice.id);
              } else {
                closeInvoiceActionsMenu();
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            aria-expanded={invoiceActionsMenuId === invoice.id}
            aria-haspopup="menu"
          >
            {t('invoiceTracking.actions')}
            <svg className="h-3.5 w-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );

  const invoiceForActionsMenu = invoiceActionsMenuId
    ? invoicesSearchFiltered.find((inv) => inv.id === invoiceActionsMenuId)
    : undefined;

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

      <div ref={toolbarRef} className="space-y-4">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowFiltersPanel((v) => !v);
                setShowGroupByPanel(false);
                setShowSearchPanel(false);
              }}
              className={`flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm transition-all duration-200 hover:bg-gray-50 hover:shadow-md ${
                showFiltersPanel ? 'border-[#515151] bg-[#515151] text-white' : ''
              }`}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              <span className="font-medium">{t('inventory.filters')}</span>
              {activeFiltersCount > 0 && (
                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowGroupByPanel((v) => !v);
                setShowFiltersPanel(false);
                setShowSearchPanel(false);
              }}
              className={`flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm transition-all duration-200 hover:bg-gray-50 hover:shadow-md ${
                groupByField ? 'border-[#515151] bg-[#515151] text-white' : ''
              }`}
            >
              <GroupByLayersIcon />
              <span className="font-medium">{t('purchaseOrders.groupBy')}</span>
              {groupByField ? (
                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">1</span>
              ) : null}
            </button>
            {showGroupByPanel && (
              <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-gray-200 bg-white shadow-lg">
                <div className="p-4">
                  <div className="mb-3 text-sm font-medium text-gray-700">{t('purchaseOrders.groupByField')}</div>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setGroupByField('');
                        setShowGroupByPanel(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                        !groupByField ? 'bg-[#515151] text-white' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      {t('purchaseOrders.noGrouping')}
                    </button>
                    {(
                      [
                        ['month', t('salesNotes.groupMonth')] as const,
                        ['clientName', t('salesNotes.groupClient')] as const,
                        ['paymentStatus', t('salesNotes.groupPayment')] as const,
                        ['deliveryStatus', t('salesNotes.groupDelivery')] as const,
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setGroupByField(key);
                          setShowGroupByPanel(false);
                        }}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          groupByField === key ? 'bg-[#515151] text-white' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <GroupByLayersIcon />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowSearchPanel((v) => !v);
                setShowFiltersPanel(false);
                setShowGroupByPanel(false);
              }}
              className={`rounded-lg border border-gray-300 p-2 text-gray-600 transition-all duration-200 hover:bg-gray-50 hover:shadow-md ${
                showSearchPanel ? 'border-[#515151] bg-[#515151] text-white' : ''
              }`}
              aria-label={t('inventory.search')}
              title={t('inventory.search')}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            {showSearchPanel && (
              <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
                <div className="mb-3 text-sm font-medium text-gray-700">{t('inventory.search')}</div>
                <div className="relative">
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('invoiceTracking.searchPlaceholder')}
                    className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-transparent focus:ring-2 focus:ring-[#515151]"
                  />
                  <svg
                    className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            )}
          </div>
        </div>

        {showFiltersPanel && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-t border-gray-200 bg-gray-50 p-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('salesNotes.filterByMonth')}</label>
                  <MonthYearSelectEs
                    value={filters.filterMonth}
                    onChange={(filterMonth) => setFilters({ ...filters, filterMonth })}
                    selectClassName="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#515151]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('invoiceTracking.dateFrom')}</label>
                  <input
                    type="date"
                    lang="es"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('invoiceTracking.dateTo')}</label>
                  <input
                    type="date"
                    lang="es"
                    value={filters.dateTo}
                    onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('invoiceTracking.customer')}</label>
                  <select
                    value={filters.clientId}
                    onChange={(e) => setFilters({ ...filters, clientId: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
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
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('invoiceTracking.paymentStatus')}</label>
                  <select
                    value={filters.paymentStatus}
                    onChange={(e) => setFilters({ ...filters, paymentStatus: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  >
                    <option value="">{t('invoiceTracking.all')}</option>
                    <option value="Unpaid">{t('invoiceTracking.unpaid')}</option>
                    <option value="Partially Paid">{t('invoiceTracking.partial')}</option>
                    <option value="Paid">{t('invoiceTracking.paid')}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('invoiceTracking.deliveryStatus')}</label>
                  <select
                    value={filters.deliveryStatus}
                    onChange={(e) => setFilters({ ...filters, deliveryStatus: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  >
                    <option value="">{t('invoiceTracking.all')}</option>
                    <option value="Pending">{t('invoiceTracking.pending')}</option>
                    <option value="Partially Delivered">{t('invoiceTracking.partiallyDelivered')}</option>
                    <option value="Delivered">{t('invoiceTracking.delivered')}</option>
                    <option value="Canceled">{t('invoiceTracking.canceled')}</option>
                  </select>
                </div>
              </div>
              {activeFiltersCount > 0 && (
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      setFilters({
                        clientId: '',
                        paymentStatus: '',
                        deliveryStatus: '',
                        filterMonth: '',
                        dateFrom: '',
                        dateTo: '',
                      })
                    }
                    className="text-sm font-medium text-[#515151] hover:text-black"
                  >
                    {t('invoiceTracking.clearFilters')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Invoices List */}
      {loading ? (
        <div className="text-center py-12">{t('invoiceTracking.loadingInvoices')}</div>
      ) : sortedInvoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">{t('invoiceTracking.noInvoices')}</p>
        </div>
      ) : (
        <div
          id="invoice-tracking-table"
          className="bg-white rounded-xl border border-gray-200 overflow-x-auto scroll-mt-24"
        >
          <table className="w-full min-w-max">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('invoiceNumber')}
                >
                  <div className="flex items-center gap-1">
                    {t('invoiceTracking.facNumber')}
                    <SortIcon columnKey="invoiceNumber" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('clientName')}
                >
                  <div className="flex items-center gap-1">
                    {t('invoiceTracking.customer')}
                    <SortIcon columnKey="clientName" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center gap-1">
                    {t('invoiceTracking.invoiceDate')}
                    <SortIcon columnKey="date" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('grandTotal')}
                >
                  <div className="flex items-center justify-end gap-1">
                    {t('invoiceTracking.total')}
                    <SortIcon columnKey="grandTotal" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('paymentStatus')}
                >
                  <div className="flex items-center gap-1">
                    {t('invoiceTracking.paymentStatus')}
                    <SortIcon columnKey="paymentStatus" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('deliveryStatus')}
                >
                  <div className="flex items-center gap-1">
                    {t('invoiceTracking.deliveryStatus')}
                    <SortIcon columnKey="deliveryStatus" />
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('amountPaid')}
                >
                  <div className="flex items-center justify-end gap-1">
                    {t('invoiceTracking.totalPaid')}
                    <SortIcon columnKey="amountPaid" />
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('remainingBalance')}
                >
                  <div className="flex items-center justify-end gap-1">
                    {t('invoiceTracking.pending')}
                    <SortIcon columnKey="remainingBalance" />
                  </div>
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('invoiceTracking.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!groupByField
                ? sortedInvoices.map((invoice) => renderInvoiceRow(invoice))
                : sortedGroupEntries.map(([groupKey, items]) => (
                    <Fragment key={groupKey}>
                      <tr
                        className="cursor-pointer bg-gray-50 transition-colors hover:bg-gray-100"
                        onClick={() =>
                          setExpandedGroups((prev) => {
                            const next = new Set(prev);
                            if (next.has(groupKey)) next.delete(groupKey);
                            else next.add(groupKey);
                            return next;
                          })
                        }
                      >
                        <td colSpan={9} className="px-6 py-3 text-sm font-semibold text-gray-800">
                          <span className="mr-2 text-gray-500">{expandedGroups.has(groupKey) ? '▼' : '▶'}</span>
                          {groupDisplayLabel(groupKey)}
                          <span className="ml-2 font-normal text-gray-500">({items.length})</span>
                        </td>
                      </tr>
                      {expandedGroups.has(groupKey) && items.map((invoice) => renderInvoiceRow(invoice))}
                    </Fragment>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {invoiceActionsMenuId &&
        actionsMenuPos &&
        invoiceForActionsMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-invoice-actions-root
            role="menu"
            className="fixed z-[100] min-w-[12rem] rounded-lg border border-gray-200 bg-white py-1 text-left shadow-lg"
            style={{ top: actionsMenuPos.top, left: actionsMenuPos.left }}
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                openPaymentModal(invoiceForActionsMenu);
                closeInvoiceActionsMenu();
              }}
            >
              <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {t('invoiceTracking.addPayment')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                openEditModal(invoiceForActionsMenu);
                closeInvoiceActionsMenu();
              }}
            >
              <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              {t('invoiceTracking.editInvoice')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                handleGeneratePDFClick(invoiceForActionsMenu);
                closeInvoiceActionsMenu();
              }}
            >
              <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {t('invoiceTracking.generatePdf')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              onClick={() => {
                handleDeleteInvoice(invoiceForActionsMenu);
                closeInvoiceActionsMenu();
              }}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {t('invoiceTracking.deleteInvoice')}
            </button>
          </div>,
          document.body
        )}

      <InvoiceEditModal
        invoice={editingInvoice}
        onClose={closeEditModal}
        onSaved={loadInvoices}
      />

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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151] focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151] focus:border-transparent"
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
                className="inline-flex flex-1 items-center justify-center gap-2 px-4 py-2 bg-[#515151] text-white rounded-lg hover:bg-[#000000]"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('invoiceTracking.deliveryNotesOptional')}</label>
                <textarea
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  rows={3}
                  placeholder={t('invoiceTracking.deliveryNotesPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('invoiceTracking.itemsToDeliver')}</label>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('invoiceTracking.sku')}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('invoiceTracking.description')}</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('invoiceTracking.ordered')}</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('invoiceTracking.delivering')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {deliveryInvoice.items.map((item, index) => (
                        <tr key={index} className="transition-colors hover:bg-gray-50">
                          <td className="px-6 py-3 font-mono text-xs text-gray-900">{item.sku}</td>
                          <td className="px-6 py-3 text-gray-700">{item.description}</td>
                          <td className="px-6 py-3 text-center text-gray-700">{item.quantity}</td>
                          <td className="px-6 py-3 text-center">
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
                className="flex-1 px-4 py-2 bg-[#515151] text-white rounded-lg hover:bg-[#000000]"
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
              <h3 className="text-2xl font-bold text-[#515151]">{detailsInvoice.invoiceNumber}</h3>
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
                    <span className="ml-2 font-medium">{formatDateDMY(detailsInvoice.date)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">{t('invoiceTracking.currency')}:</span>
                    <span className="ml-2 font-medium">{detailsInvoice.currency}</span>
                  </div>
                  {detailsInvoice.sourceConsignmentId && (
                    <div className="col-span-2">
                      <span className="text-gray-600">{t('consignments.sourceConsignmentTag') || 'Consignación'}:</span>
                      <span className="ml-2 font-medium text-amber-900">
                        {detailsInvoice.sourceConsignmentId}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">{t('invoiceTracking.items')}</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('invoiceTracking.sku')}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('invoiceTracking.description')}</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('invoiceTracking.qty')}</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('invoiceTracking.unitPrice')}</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('invoiceTracking.total')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {detailsInvoice.items.map((item, index) => (
                        <tr key={index} className="transition-colors hover:bg-gray-50">
                          <td className="px-6 py-3 font-mono text-xs text-gray-900">{item.sku}</td>
                          <td className="px-6 py-3 text-gray-700">{item.description}</td>
                          <td className="px-6 py-3 text-center text-gray-700">{item.quantity}</td>
                          <td className="px-6 py-3 text-right text-gray-700">${item.unitPrice.toFixed(2)}</td>
                          <td className="px-6 py-3 text-right text-gray-900">${item.totalPrice.toFixed(2)}</td>
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
                  <div className="flex justify-between text-lg font-bold text-[#515151] pt-2 border-t border-gray-300">
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
                    <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">{t('invoiceTracking.paymentHistory')}</div>
                    <div className="space-y-2">
                      {detailsInvoice.paymentHistory.map((payment, index) => (
                        <div key={index} className="flex justify-between text-sm bg-white p-2 rounded">
                          <span className="text-gray-600">
                            {formatDateDMY(payment.date)}
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
                        ? formatDateDMY(detailsInvoice.deliveryDate)
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-6 py-5">
              <h3 className="text-xl font-semibold text-gray-900">
                {t('invoiceTracking.deleteInvoice')}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                {t('invoiceTracking.deleteInvoiceOptions')}
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">
              {itemsReturningToStock.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <h4 className="font-semibold text-gray-900 mb-1">
                    {t('invoiceTracking.itemsReturningToStock')}
                  </h4>
                  <p className="text-sm text-gray-600 mb-3">
                    {t('invoiceTracking.itemsReturningToStockMessage')}
                  </p>
                  <div className="space-y-2">
                    {itemsReturningToStock.map((item, index) => (
                      <div
                        key={index}
                        className="flex justify-between items-center rounded-lg border border-gray-200 bg-white px-3 py-2"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{item.description}</div>
                          <div className="text-sm text-gray-600">
                            {t('invoiceTracking.quantityReturning')}: {item.quantity}{' '}
                            {t('invoiceTracking.units')}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs uppercase tracking-wide text-gray-500">
                            {t('invoiceTracking.ecuadorStock')}
                          </div>
                          <div className="font-semibold text-gray-900">
                            {item.currentStock} <span className="text-gray-400">→</span>{' '}
                            <span className="text-emerald-600">{item.newStock}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    if (invoiceToDelete) {
                      deleteInvoiceAndReturnItems(invoiceToDelete, itemsReturningToStock);
                    }
                    setInvoiceToDelete(null);
                    setItemsReturningToStock([]);
                  }}
                  className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left transition-colors hover:bg-emerald-100"
                >
                  <div className="font-semibold text-emerald-800">
                    {t('invoiceTracking.reverseAndReturn')}
                  </div>
                  <div className="text-sm text-emerald-700 mt-1">
                    {t('invoiceTracking.reverseAndReturnDescription')}
                  </div>
                </button>

                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    if (invoiceToDelete) {
                      deleteInvoiceAndReturnItems(invoiceToDelete, []);
                    }
                    setInvoiceToDelete(null);
                    setItemsReturningToStock([]);
                  }}
                  className="w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-left transition-colors hover:bg-rose-100"
                >
                  <div className="font-semibold text-rose-800">
                    {t('invoiceTracking.cancelWithoutAffecting')}
                  </div>
                  <div className="text-sm text-rose-700 mt-1">
                    {t('invoiceTracking.cancelWithoutAffectingDescription')}
                  </div>
                </button>
              </div>
            </div>

            <div className="border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setInvoiceToDelete(null);
                  setItemsReturningToStock([]);
                }}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-gray-700 font-medium transition-colors hover:bg-gray-50"
              >
                {t('invoiceTracking.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Dialog */}
      <AlertDialog
        open={alertDialog.open}
        title={alertDialog.title}
        message={alertDialog.message}
        onClose={() => setAlertDialog({ open: false, message: '' })}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.message}
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog({ open: false, message: '', onConfirm: () => {} });
        }}
        onCancel={() => setConfirmDialog({ open: false, message: '', onConfirm: () => {} })}
      />
    </div>
  );
}
