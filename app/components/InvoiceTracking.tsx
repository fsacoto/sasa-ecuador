'use client';

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { SalesInvoice, Client, PaymentRecord } from '../types';
import { getAllInvoices, updateInvoice } from '../services/invoicesService';
import { getAllClients } from '../services/clientsService';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';
import { useTranslation } from '../context/TranslationContext';
import { downloadSalesInvoicePdf } from '../utils/salesInvoicePdf';
import AlertDialog from './ui/AlertDialog';
import ConfirmDialog from './ui/ConfirmDialog';
import InvoiceEditModal from './InvoiceEditModal';
import SalesInvoiceDeleteModal from './SalesInvoiceDeleteModal';
import { type InvoiceDeleteReturnItem } from '../utils/salesInvoiceDelete';
import MonthYearSelectEs from './ui/MonthYearSelectEs';
import TableSortIcon from './ui/TableSortIcon';
import {
  tableTheadClass,
  tableThAlignClass,
  tableThBaseClass,
  tableThLabelFlexClass,
  tableThSortableClass,
} from './ui/tableHeaderClass';
import { formatDateDMY, formatMonthYearLong } from '../utils/formatDate';
import {
  deliveryStatusBadgeClass,
  deliveryStatusSelectClass,
  paymentStatusBadgeClass,
  paymentStatusSelectClass,
} from '../utils/invoiceStatusStyles';
import { tableRowActionButtonClass } from './ui/tableRowActionClass';
import { useDarkMode } from '../hooks/useDarkMode';
import ModalPortal from './ui/ModalPortal';

/** Cantidad ya descontada de inventario Ecuador para esta línea (antes de editar en el modal). */
function getPreviouslyDeliveredQty(invoice: SalesInvoice, index: number): number {
  const item = invoice.items[index];
  if (typeof item.quantityDelivered === 'number') {
    return Math.min(item.quantity, Math.max(0, item.quantityDelivered));
  }
  if (invoice.deliveryStatus === 'Delivered') {
    return item.quantity;
  }
  return 0;
}

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

type InvoiceMetricTone = 'neutral' | 'danger' | 'warning' | 'success' | 'pending';

const invoiceMetricIconStroke = { strokeWidth: 1.5 };

function InvoiceMetricIcon({
  tone,
  className = 'sasa-invoice-metric-icon-line h-5 w-5 text-gray-500',
}: {
  tone: InvoiceMetricTone;
  className?: string;
}) {
  const stroke = { strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (tone === 'neutral') {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...invoiceMetricIconStroke}>
        <path
          {...stroke}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    );
  }
  if (tone === 'danger') {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...invoiceMetricIconStroke}>
        <path
          {...stroke}
          d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );
  }
  if (tone === 'warning') {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...invoiceMetricIconStroke}>
        <path {...stroke} d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
        <path {...stroke} d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
      </svg>
    );
  }
  if (tone === 'success') {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...invoiceMetricIconStroke}>
        <path
          {...stroke}
          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );
  }
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden {...invoiceMetricIconStroke}>
      <path
        {...stroke}
        d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function StatusSelectChevron() {
  return (
    <span
      className="sasa-invoice-status-chevron pointer-events-none absolute opacity-60"
      aria-hidden
    >
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </span>
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

  const [invoiceToDelete, setInvoiceToDelete] = useState<SalesInvoice | null>(null);
  const [itemsReturningToStock, setItemsReturningToStock] = useState<InvoiceDeleteReturnItem[]>([]);
  const darkMode = useDarkMode();

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
      const allInvoicesData = await getAllInvoices();
      setAllInvoices(allInvoicesData);
    } catch (error) {
      console.error('Error loading invoices:', error);
      showAlert(t('invoiceTracking.errorLoading'), 'Error');
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = useMemo(() => {
    let list = [...allInvoices];

    if (filters.clientId) {
      if (filters.clientId === 'walk-in') {
        list = list.filter((inv) => !inv.clientId || inv.clientId === '');
      } else {
        list = list.filter((inv) => inv.clientId === filters.clientId);
      }
    }

    if (filters.paymentStatus) {
      list = list.filter((inv) => inv.paymentStatus === filters.paymentStatus);
    }

    if (filters.deliveryStatus) {
      list = list.filter((inv) => inv.deliveryStatus === filters.deliveryStatus);
    }

    if (filters.filterMonth) {
      const parts = filters.filterMonth.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      if (!Number.isNaN(y) && !Number.isNaN(m)) {
        list = list.filter((inv) => {
          const d = new Date(inv.date);
          return d.getFullYear() === y && d.getMonth() === m;
        });
      }
    }

    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      list = list.filter((inv) => inv.date >= fromDate);
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      list = list.filter((inv) => inv.date <= toDate);
    }

    return list;
  }, [allInvoices, filters]);

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

  const openDeliveryModal = (invoice: SalesInvoice) => {
    setDeliveryInvoice(invoice);
    setDeliveryNotes(invoice.deliveryNotes || '');
    const initialItems: { [key: number]: number } = {};
    invoice.items.forEach((_, index) => {
      initialItems[index] = getPreviouslyDeliveredQty(invoice, index);
    });
    setDeliveryItems(initialItems);
    if (invoice.deliveryDate) {
      const d = invoice.deliveryDate;
      setDeliveryDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      );
    } else {
      setDeliveryDate(new Date().toISOString().split('T')[0]);
    }
    setShowDeliveryModal(true);
  };

  const deliveryStockPreview = useMemo(() => {
    if (!deliveryInvoice) return [];
    return deliveryInvoice.items.map((item, index) => {
      const prev = getPreviouslyDeliveredQty(deliveryInvoice, index);
      const next = Math.min(
        item.quantity,
        Math.max(0, deliveryItems[index] ?? prev)
      );
      const delta = next - prev;
      const inventoryItem = inventory.find((inv) => inv.sku === item.sku);
      const currentStock = inventoryItem?.ecuadorStock ?? 0;
      return {
        description: item.description,
        sku: item.sku,
        ordered: item.quantity,
        prev,
        next,
        delta,
        currentStock,
        newStock: currentStock - delta,
      };
    });
  }, [deliveryInvoice, deliveryItems, inventory]);

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
      showAlert(`${t('invoiceTracking.cannotDeliverMore')} ${invoice.items[index].quantity} ${t('invoiceTracking.units')}`, t('common.error'));
      return;
    }
    
    setDeliveryItems({ ...deliveryItems, [index]: quantity });
  };

  const savePartialDelivery = async () => {
    if (!deliveryInvoice) return;

    const totalDelivered = deliveryStockPreview.reduce((sum, row) => sum + row.next, 0);
    if (totalDelivered === 0) {
      showAlert(t('invoiceTracking.pleaseSpecifyQuantities'), t('common.error'));
      return;
    }

    await processPartialDeliveryConfirmed();
  };

  const processPartialDeliveryConfirmed = async () => {
    if (!deliveryInvoice) return;

    try {
      const updatedItems = deliveryInvoice.items.map((item, index) => ({
        ...item,
        quantityDelivered: deliveryStockPreview[index]?.next ?? 0,
      }));

      const updateData: Partial<SalesInvoice> = {
        deliveryStatus: 'Partially Delivered',
        deliveryDate: new Date(deliveryDate),
        deliveryNotes: deliveryNotes,
        items: updatedItems,
      };

      for (const row of deliveryStockPreview) {
        if (row.delta === 0) continue;
        const inventoryItem = inventory.find((inv) => inv.sku === row.sku);
        if (inventoryItem) {
          await updateInventoryItem(inventoryItem.id, {
            ecuadorStock: Math.max(0, row.newStock),
          });
        }
      }

      await updateInvoice(deliveryInvoice.id, updateData);

      showAlert(t('invoiceTracking.partialDeliveryRegistered'), t('common.success'));
      closeDeliveryModal();
      loadInvoices();
    } catch (error) {
      console.error('Error updating delivery:', error);
      showAlert(t('invoiceTracking.errorUpdatingDeliveryStatus'), t('common.error'));
    }
  };

  const handleUpdateDelivery = async (invoice: SalesInvoice, status: 'Pending' | 'Partially Delivered' | 'Delivered' | 'Canceled') => {
    if (status === 'Partially Delivered') {
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
      const itemsToReturn: InvoiceDeleteReturnItem[] = [];
      
      invoice.items.forEach((item, index) => {
        const quantityToReturn = getPreviouslyDeliveredQty(invoice, index);
        if (quantityToReturn <= 0) return;
        const inventoryItem = inventory.find((inv) => inv.sku === item.sku);
        if (inventoryItem) {
          const currentStock = inventoryItem.ecuadorStock;
          const newStock = currentStock + quantityToReturn;
          itemsToReturn.push({
            description: item.description,
            sku: item.sku,
            quantity: quantityToReturn,
            currentStock,
            newStock,
            kind: 'ecuador',
          });
        }
      });
      
      if (itemsToReturn.length > 0) {
        setItemsReturningToStock(itemsToReturn);
        setWarningMessage(t('invoiceTracking.itemsReturningToStockMessage'));
        setWarningCallback(() => async () => {
          setShowWarningModal(false);
          setWarningItems([]);
          setItemsReturningToStock([]);
          setWarningCallback(null);
          await processDeliveryUpdateWithReturns(invoice, status, itemsToReturn);
        });
        setShowWarningModal(true);
        return;
      }
    } else if (isMarkingDelivered) {
      // Create warning message with stock information
      const itemsList = invoice.items
        .map((item, index) => {
          const inventoryItem = inventory.find((inv) => inv.sku === item.sku);
          const currentStock = inventoryItem?.ecuadorStock || 0;
          const prev = getPreviouslyDeliveredQty(invoice, index);
          const qtyToDeliver = item.quantity - prev;
          const remainingStock = Math.max(0, currentStock - qtyToDeliver);
          return {
            description: item.description,
            quantity: qtyToDeliver,
            currentStock,
            remainingStock,
          };
        })
        .filter((row) => row.quantity > 0);
      
      setWarningItems(itemsList);
      setWarningMessage(t('invoiceTracking.changingStatusWillAffect'));
      setWarningCallback(() => async () => {
        setShowWarningModal(false);
        setWarningItems([]);
        setItemsReturningToStock([]);
        setWarningCallback(null);
        await processDeliveryUpdate(invoice, status);
      });
      setShowWarningModal(true);
      return;
    } else {
      // For other status changes, use simple confirmation
      showConfirm(
        t('invoiceTracking.changeDeliveryStatusTo').replace('{status}', deliveryStatusLabel(status)),
        () => {
          processDeliveryUpdate(invoice, status);
        },
        t('invoiceTracking.confirmStatusChange')
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
        updateData.items = invoice.items.map((item) => ({
          ...item,
          quantityDelivered: item.quantity,
        }));
      }

      await updateInvoice(invoice.id, updateData);

      if (status === 'Delivered') {
        for (let i = 0; i < invoice.items.length; i++) {
          const item = invoice.items[i];
          const prev = getPreviouslyDeliveredQty(invoice, i);
          const add = item.quantity - prev;
          if (add <= 0) continue;
          const inventoryItem = inventory.find((inv) => inv.sku === item.sku);
          if (inventoryItem) {
            const newEcuadorStock = Math.max(0, inventoryItem.ecuadorStock - add);
            await updateInventoryItem(inventoryItem.id, {
              ecuadorStock: newEcuadorStock,
            });
          }
        }
      }

      showAlert(t('invoiceTracking.deliveryStatusUpdated'), t('common.success'));
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
      
      if (status === 'Canceled' || status === 'Pending') {
        updateData.deliveryDate = undefined;
        updateData.items = invoice.items.map((item) => ({
          ...item,
          quantityDelivered: 0,
        }));
      }

      await updateInvoice(invoice.id, updateData);

      showAlert(t('invoiceTracking.deliveryStatusUpdated'), t('common.success'));
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
    if (!q) return filteredInvoices;
    return filteredInvoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.clientName.toLowerCase().includes(q) ||
        inv.items.some(
          (i) => i.sku.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
        )
    );
  }, [filteredInvoices, searchQuery]);

  /** Abrir fila desde Notas de ventas (misma colección Firestore): scroll + resaltado temporal. */
  useEffect(() => {
    if (loading || invoicesSearchFiltered.length === 0) return;
    const id = sessionStorage.getItem('sasa_focus_invoice_tracking_id');
    if (!id) return;
    if (!invoicesSearchFiltered.some((inv) => inv.id === id)) return;
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
  }, [loading, invoicesSearchFiltered]);

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

  const summaryMetrics = useMemo(
    () => [
      {
        key: 'total',
        label: t('invoiceTracking.totalInvoices'),
        value: String(metrics.totalInvoices),
        tone: 'neutral' as InvoiceMetricTone,
      },
      {
        key: 'unpaid',
        label: t('invoiceTracking.unpaidInvoices'),
        value: String(metrics.unpaidInvoices),
        tone: 'danger' as InvoiceMetricTone,
      },
      {
        key: 'partial',
        label: t('invoiceTracking.partiallyPaid'),
        value: String(metrics.partiallyPaidInvoices),
        tone: 'warning' as InvoiceMetricTone,
      },
      {
        key: 'collected',
        label: t('invoiceTracking.totalCollected'),
        value: `$${metrics.totalCollected.toFixed(2)}`,
        tone: 'success' as InvoiceMetricTone,
      },
      {
        key: 'pending',
        label: t('invoiceTracking.pendingCollection'),
        value: `$${metrics.totalPending.toFixed(2)}`,
        tone: 'pending' as InvoiceMetricTone,
      },
    ],
    [metrics, t]
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

  const handleDeleteInvoice = (invoice: SalesInvoice) => {
    setInvoiceToDelete(invoice);
  };

  const closeDeleteModal = () => {
    setInvoiceToDelete(null);
  };

  const closeWarningModal = () => {
    setShowWarningModal(false);
    setWarningItems([]);
    setItemsReturningToStock([]);
    setWarningCallback(null);
  };

  const activeFiltersCount = [
    filters.clientId,
    filters.paymentStatus,
    filters.deliveryStatus,
    filters.filterMonth,
    filters.dateFrom,
    filters.dateTo,
  ].filter(Boolean).length;

  const deliveryStatusLabel = (status: SalesInvoice['deliveryStatus']) => {
    if (status === 'Delivered') return t('invoiceTracking.delivered');
    if (status === 'Partially Delivered') return t('invoiceTracking.partiallyDelivered');
    if (status === 'Canceled') return t('invoiceTracking.canceled');
    return t('invoiceTracking.pending');
  };

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
      <td className="px-3 py-3 text-center align-middle">
        <div className="flex justify-center">
          <div className="sasa-invoice-status-select-wrap">
            <select
              value={invoice.paymentStatus}
              onChange={(e) => handleUpdatePayment(invoice, e.target.value as SalesInvoice['paymentStatus'])}
              className={paymentStatusSelectClass(invoice.paymentStatus)}
              aria-label={t('invoiceTracking.paymentStatus')}
            >
              <option value="Unpaid">{t('invoiceTracking.unpaid')}</option>
              <option value="Partially Paid">{t('invoiceTracking.partial')}</option>
              <option value="Paid">{t('invoiceTracking.paid')}</option>
            </select>
            <StatusSelectChevron />
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-center align-middle">
        <div className="flex justify-center">
          <div className="sasa-invoice-status-select-wrap">
            <select
              value={invoice.deliveryStatus}
              onChange={(e) => handleUpdateDelivery(invoice, e.target.value as SalesInvoice['deliveryStatus'])}
              className={deliveryStatusSelectClass(invoice.deliveryStatus)}
              aria-label={t('invoiceTracking.deliveryStatus')}
            >
              <option value="Pending">{t('invoiceTracking.pending')}</option>
              <option value="Partially Delivered">{t('invoiceTracking.partiallyDeliveredShort')}</option>
              <option value="Delivered">{t('invoiceTracking.delivered')}</option>
              <option value="Canceled">{t('invoiceTracking.canceled')}</option>
            </select>
            <StatusSelectChevron />
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center">
        <div className="text-sm font-medium text-gray-900 tabular-nums">${invoice.amountPaid.toFixed(2)}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center">
        <div className="text-sm font-medium text-gray-900 tabular-nums">${invoice.remainingBalance.toFixed(2)}</div>
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
            className={tableRowActionButtonClass}
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {summaryMetrics.map((stat) => (
          <div
            key={stat.key}
            className="sasa-invoice-metric rounded-lg border border-gray-200 p-4 text-left shadow-sm"
          >
            <div className="mb-3" aria-hidden>
              <InvoiceMetricIcon tone={stat.tone} />
            </div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              {stat.label}
            </p>
            <p
              className={`sasa-invoice-metric-value sasa-invoice-metric-value--${stat.tone} text-2xl font-semibold tabular-nums tracking-tight`}
            >
              {stat.value}
            </p>
          </div>
        ))}
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
            <thead className={tableTheadClass}>
              <tr>
                <th
                  className={`${tableThSortableClass} ${tableThAlignClass('left')}`}
                  onClick={() => handleSort('invoiceNumber')}
                >
                  <div className={tableThLabelFlexClass('left')}>
                    {t('invoiceTracking.facNumber')}
                    <TableSortIcon
                      columnKey="invoiceNumber"
                      activeKey={sortConfig.key}
                      direction={sortConfig.direction}
                    />
                  </div>
                </th>
                <th
                  className={`${tableThSortableClass} ${tableThAlignClass('left')}`}
                  onClick={() => handleSort('clientName')}
                >
                  <div className={tableThLabelFlexClass('left')}>
                    {t('invoiceTracking.customer')}
                    <TableSortIcon columnKey="clientName" activeKey={sortConfig.key} direction={sortConfig.direction} />
                  </div>
                </th>
                <th
                  className={`${tableThSortableClass} ${tableThAlignClass('left')}`}
                  onClick={() => handleSort('date')}
                >
                  <div className={tableThLabelFlexClass('left')}>
                    {t('invoiceTracking.invoiceDate')}
                    <TableSortIcon columnKey="date" activeKey={sortConfig.key} direction={sortConfig.direction} />
                  </div>
                </th>
                <th
                  className={`${tableThSortableClass} ${tableThAlignClass('right')}`}
                  onClick={() => handleSort('grandTotal')}
                >
                  <div className={tableThLabelFlexClass('right')}>
                    {t('invoiceTracking.total')}
                    <TableSortIcon columnKey="grandTotal" activeKey={sortConfig.key} direction={sortConfig.direction} />
                  </div>
                </th>
                <th
                  className={`${tableThSortableClass} ${tableThAlignClass('center')}`}
                  onClick={() => handleSort('paymentStatus')}
                >
                  <div className={tableThLabelFlexClass('center')}>
                    {t('invoiceTracking.paymentStatus')}
                    <TableSortIcon columnKey="paymentStatus" activeKey={sortConfig.key} direction={sortConfig.direction} />
                  </div>
                </th>
                <th
                  className={`${tableThSortableClass} ${tableThAlignClass('center')}`}
                  onClick={() => handleSort('deliveryStatus')}
                >
                  <div className={tableThLabelFlexClass('center')}>
                    {t('invoiceTracking.deliveryStatus')}
                    <TableSortIcon columnKey="deliveryStatus" activeKey={sortConfig.key} direction={sortConfig.direction} />
                  </div>
                </th>
                <th
                  className={`${tableThSortableClass} ${tableThAlignClass('center')}`}
                  onClick={() => handleSort('amountPaid')}
                >
                  <div className={tableThLabelFlexClass('center')}>
                    {t('invoiceTracking.totalPaid')}
                    <TableSortIcon columnKey="amountPaid" activeKey={sortConfig.key} direction={sortConfig.direction} />
                  </div>
                </th>
                <th
                  className={`${tableThSortableClass} ${tableThAlignClass('center')}`}
                  onClick={() => handleSort('remainingBalance')}
                >
                  <div className={tableThLabelFlexClass('center')}>
                    {t('invoiceTracking.pending')}
                    <TableSortIcon
                      columnKey="remainingBalance"
                      activeKey={sortConfig.key}
                      direction={sortConfig.direction}
                    />
                  </div>
                </th>
                <th className={`${tableThBaseClass} ${tableThAlignClass('center')}`}>{t('invoiceTracking.actions')}</th>
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

      {/* Modal entrega parcial — cantidades e inventario */}
      {showDeliveryModal && deliveryInvoice && (
        <ModalPortal>
          <div
            className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[90] flex items-center justify-center p-4 backdrop-blur-sm`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="partial-delivery-title"
            onClick={closeDeliveryModal}
          >
            <div
              className="sasa-modal-panel w-full max-w-2xl overflow-hidden rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-gray-200 px-6 py-5">
                <h3 id="partial-delivery-title" className="text-xl font-semibold text-gray-900">
                  {t('invoiceTracking.partialDeliveryTitle')} — {deliveryInvoice.invoiceNumber}
                </h3>
                <p className="mt-2 text-sm text-gray-500">{t('invoiceTracking.partialDeliveryIntro')}</p>
                {deliveryInvoice.deliveryStatus === 'Delivered' && (
                  <p className="mt-1 text-sm text-gray-500">
                    {t('invoiceTracking.partialDeliveryFromDeliveredHint')}
                  </p>
                )}
              </div>

              <div className="max-h-[min(70vh,520px)] overflow-y-auto px-6 py-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      {t('invoiceTracking.deliveryDate')}
                    </label>
                    <input
                      type="date"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#515151]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      {t('invoiceTracking.deliveryNotesOptional')}
                    </label>
                    <textarea
                      value={deliveryNotes}
                      onChange={(e) => setDeliveryNotes(e.target.value)}
                      rows={2}
                      placeholder={t('invoiceTracking.deliveryNotesPlaceholder')}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#515151]"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-200 bg-gray-50">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                          {t('invoiceTracking.sku')}
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                          {t('invoiceTracking.description')}
                        </th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-gray-500">
                          {t('invoiceTracking.ordered')}
                        </th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-gray-500">
                          {t('invoiceTracking.qtyPreviouslyDelivered')}
                        </th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-gray-500">
                          {t('invoiceTracking.qtyDelivered')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {deliveryInvoice.items.map((item, index) => (
                        <tr key={`${item.sku}-${index}`}>
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-900">{item.sku}</td>
                          <td className="px-4 py-2.5 text-gray-700">{item.description}</td>
                          <td className="px-4 py-2.5 text-center tabular-nums text-gray-700">{item.quantity}</td>
                          <td className="px-4 py-2.5 text-center tabular-nums text-gray-500">
                            {deliveryStockPreview[index]?.prev ?? 0}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <input
                              type="number"
                              min={0}
                              max={item.quantity}
                              value={deliveryItems[index] ?? 0}
                              onChange={(e) => handleUpdateDeliveryQuantity(index, e.target.value)}
                              className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-center text-sm tabular-nums focus:border-transparent focus:ring-2 focus:ring-[#515151]"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="sasa-delete-preview rounded-xl border border-gray-200 p-4">
                  <h4 className="mb-1 font-semibold text-gray-900">
                    {t('invoiceTracking.stockAdjustment')}
                  </h4>
                  {deliveryStockPreview.some((row) => row.delta !== 0) ? (
                    <div className="mt-3 space-y-2">
                      {deliveryStockPreview
                        .filter((row) => row.delta !== 0)
                        .map((row) => (
                          <div
                            key={row.sku}
                            className="sasa-delete-preview-row flex flex-col gap-2 rounded-lg border border-gray-200 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-gray-900">{row.description}</div>
                              <div className="text-sm text-gray-500">
                                {t('invoiceTracking.qtyDelivered')}: {row.prev}{' '}
                                <span className="text-gray-400">→</span> {row.next}{' '}
                                {t('invoiceTracking.units')}
                                {row.delta !== 0 && (
                                  <span className="ml-1 text-gray-600">
                                    ({row.delta > 0 ? '−' : '+'}
                                    {Math.abs(row.delta)} {t('invoiceTracking.units')})
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-left sm:text-right">
                              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                {t('invoiceTracking.ecuadorStock')}
                              </div>
                              <div className="font-semibold tabular-nums text-gray-900">
                                {row.currentStock}{' '}
                                <span className="font-normal text-gray-400">→</span> {row.newStock}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500">{t('invoiceTracking.noStockChange')}</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
                <button
                  type="button"
                  onClick={closeDeliveryModal}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                    darkMode
                      ? 'border-white/20 bg-transparent text-gray-200 hover:bg-white/10'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={savePartialDelivery}
                  className="sasa-btn-primary rounded-xl px-5 py-2 text-sm font-medium transition-colors"
                >
                  {t('invoiceTracking.registerPartialDelivery')}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
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
                    <span className={paymentStatusBadgeClass(detailsInvoice.paymentStatus)}>
                      {detailsInvoice.paymentStatus === 'Unpaid' && t('invoiceTracking.unpaid')}
                      {detailsInvoice.paymentStatus === 'Partially Paid' && t('invoiceTracking.partial')}
                      {detailsInvoice.paymentStatus === 'Paid' && t('invoiceTracking.paid')}
                    </span>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 uppercase">{t('invoiceTracking.amountPaid')}</div>
                    <div className="font-semibold text-gray-900 tabular-nums">${detailsInvoice.amountPaid.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 uppercase">{t('invoiceTracking.remaining')}</div>
                    <div className="font-semibold text-gray-900 tabular-nums">${detailsInvoice.remainingBalance.toFixed(2)}</div>
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
                    <span className={deliveryStatusBadgeClass(detailsInvoice.deliveryStatus)}>
                      {detailsInvoice.deliveryStatus === 'Pending' && t('invoiceTracking.pending')}
                      {detailsInvoice.deliveryStatus === 'Partially Delivered' && t('invoiceTracking.partiallyDelivered')}
                      {detailsInvoice.deliveryStatus === 'Delivered' && t('invoiceTracking.delivered')}
                      {detailsInvoice.deliveryStatus === 'Canceled' && t('invoiceTracking.canceled')}
                    </span>
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

      {/* Warning Modal — impacto en inventario al cambiar entrega */}
      {showWarningModal && (
        <ModalPortal>
          <div
            className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[90] flex items-center justify-center p-4 backdrop-blur-sm`}
            role="dialog"
            aria-modal="true"
            onClick={closeWarningModal}
          >
            <div
              className="sasa-modal-panel w-full max-w-2xl overflow-hidden rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-gray-200 px-6 py-5">
                <h3 className="text-xl font-semibold text-gray-900">
                  {t('invoiceTracking.inventoryImpactWarning')}
                </h3>
                <p className="mt-2 text-sm text-gray-500">{warningMessage}</p>
              </div>

              <div className="max-h-[min(70vh,480px)] overflow-y-auto px-6 py-5 space-y-4">
                {warningItems.length > 0 && (
                  <div className="sasa-delete-preview rounded-xl border border-gray-200 p-4">
                    <h4 className="mb-1 font-semibold text-gray-900">
                      {t('invoiceTracking.ecuadorStockImpact')}
                    </h4>
                    <p className="mb-3 text-sm text-gray-500">
                      {t('invoiceTracking.changingStatusWillAffect')}
                    </p>
                    <div className="space-y-2">
                      {warningItems.map((item, index) => (
                        <div
                          key={`warn-${index}`}
                          className="sasa-delete-preview-row flex flex-col gap-2 rounded-lg border border-gray-200 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-gray-900">{item.description}</div>
                            <div className="text-sm text-gray-500">
                              {t('invoiceTracking.delivering')}: {item.quantity}{' '}
                              {t('invoiceTracking.units')}
                            </div>
                          </div>
                          <div className="shrink-0 text-left sm:text-right">
                            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                              {t('invoiceTracking.ecuadorStock')}
                            </div>
                            <div className="font-semibold text-gray-900 tabular-nums">
                              {item.currentStock}{' '}
                              <span className="font-normal text-gray-400">→</span> {item.remainingStock}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {itemsReturningToStock.length > 0 && (
                  <div className="sasa-delete-preview rounded-xl border border-gray-200 p-4">
                    <h4 className="mb-1 font-semibold text-gray-900">
                      {t('invoiceTracking.itemsReturningToStock')}
                    </h4>
                    <p className="mb-3 text-sm text-gray-500">
                      {t('invoiceTracking.itemsReturningToStockMessage')}
                    </p>
                    <div className="space-y-2">
                      {itemsReturningToStock.map((item, index) => (
                        <div
                          key={`ret-${item.sku}-${index}`}
                          className="sasa-delete-preview-row flex flex-col gap-2 rounded-lg border border-gray-200 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-gray-900">{item.description}</div>
                            <div className="text-sm text-gray-500">
                              {t('invoiceTracking.quantityReturning')}: {item.quantity}{' '}
                              {t('invoiceTracking.units')}
                            </div>
                          </div>
                          <div className="shrink-0 text-left sm:text-right">
                            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                              {item.kind === 'consignment'
                                ? t('invoiceTracking.consignmentStockLabel')
                                : t('invoiceTracking.ecuadorStock')}
                            </div>
                            <div className="font-semibold text-gray-900 tabular-nums">
                              {item.currentStock}{' '}
                              <span className="font-normal text-gray-400">→</span> {item.newStock}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-sm text-gray-500">
                  {itemsReturningToStock.length > 0
                    ? t('invoiceTracking.returningToStock')
                    : t('invoiceTracking.stockLevelsWillBeReduced')}
                </p>
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
                <button
                  type="button"
                  onClick={closeWarningModal}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                    darkMode
                      ? 'border-white/20 bg-transparent text-gray-200 hover:bg-white/10'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {t('invoiceTracking.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (warningCallback) warningCallback();
                  }}
                  className="sasa-btn-primary rounded-xl px-5 py-2 text-sm font-medium transition-colors"
                >
                  {t('invoiceTracking.confirmAndUpdate')}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      <SalesInvoiceDeleteModal
        open={!!invoiceToDelete}
        invoice={invoiceToDelete}
        onClose={closeDeleteModal}
        onDeleted={() => {
          showAlert(t('invoiceTracking.invoiceDeleted'), t('common.success'));
          loadInvoices();
        }}
        onError={(message) => showAlert(message, t('common.error'))}
      />

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
        cancelText={t('common.cancel')}
        confirmText={t('common.accept')}
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog({ open: false, message: '', onConfirm: () => {} });
        }}
        onCancel={() => setConfirmDialog({ open: false, message: '', onConfirm: () => {} })}
      />
    </div>
  );
}
