'use client';

import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from 'react';
import {
  Consignment,
  ConsignmentItem,
  ConsignmentReturnIssueRef,
  ConsignmentStatus,
  Client,
  InventoryItem,
  PaymentRecord,
  SalesInvoice,
  SalesInvoiceLine,
} from '../types';
import { getAllConsignments, createConsignment, updateConsignment, deleteConsignment } from '../services/consignmentsService';
import { formatClientAddress, getAllClients, getClient, ensureClientDocumentLinks } from '../services/clientsService';
import { createInvoice, getAllInvoices } from '../services/invoicesService';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import ConfirmDialog from './ui/ConfirmDialog';
import TableSortIcon from './ui/TableSortIcon';
import {
  tableTheadClass,
  tableThAlignClass,
  tableThBaseClass,
  tableThLabelFlexClass,
  tableThSortableClass,
} from './ui/tableHeaderClass';
import { tableRowActionButtonClass } from './ui/tableRowActionClass';
import AlertDialog from './ui/AlertDialog';
import ModalPortal from './ui/ModalPortal';
import MonthYearSelectEs from './ui/MonthYearSelectEs';
import DateInput from './ui/DateInput';
import { isInsideDatePickerPortal } from '../utils/calendarUtils';
import { usePersistedFilterState } from '../hooks/usePersistedFilterState';
import ConsignmentReturnModal from './ConsignmentReturnModal';
import { HUB_GROUP_STACK_ICON_PATH } from '../constants/businessHubUi';
import { formatDateDMY } from '../utils/formatDate';
import { filterSellableInventory, hasSellableStock } from '../utils/inventoryStock';
import {
  getAvailableStock,
  getConsignmentStock,
  getOpenConsignmentsForSku,
  getOpenReservationNotesForSku,
  getReservedStock,
} from '../utils/stockReservation';
import { findInventoryItemByBarcodeScan } from '../utils/barcodeGenerator';
import { downloadConsignmentPrepLabelPdf } from '../utils/salesPrepLabelPdf';
import { formatSalePriceDisplay, normalizeSalePrice, parseSalePriceInput } from '../utils/salePrice';
import { useDarkMode } from '../hooks/useDarkMode';

type View = 'list' | 'create' | 'details';

type DraftConsignmentItem = {
  sku: string;
  description: string;
  quantity: number;
  line?: string;
  category?: string;
  /** Editable USD price; empty string = no price on PDF */
  unitPriceInput: string;
  imageUrl?: string;
};

function ConsignmentProductThumb({
  imageUrl,
  alt,
}: {
  imageUrl?: string;
  alt: string;
}) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(imageUrl) && !broken;

  return showImage ? (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
      <img
        src={imageUrl}
        alt={alt}
        className="h-full w-full object-cover object-center"
        onError={() => setBroken(true)}
      />
    </div>
  ) : (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100"
      title="Sin foto"
      aria-label="Sin foto"
    >
      <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </div>
  );
}

export default function Consignments() {
  const { user } = useAuth();
  const userId = user?.id;
  const { inventory, updateInventoryItem: updateInventory } = useInventory();
  const { t } = useTranslation();
  const darkMode = useDarkMode();
  const [view, setView] = useState<View>('list');
  const [consignments, setConsignments] = useState<Consignment[]>([]);
  const [openInvoices, setOpenInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreatingConsignment, setIsCreatingConsignment] = useState(false);
  const [isRegisteringSales, setIsRegisteringSales] = useState(false);
  const isCreatingConsignmentRef = useRef(false);
  const isRegisteringSalesRef = useRef(false);
  const isGeneratingPdfRef = useRef(false);
  const [selectedConsignment, setSelectedConsignment] = useState<Consignment | null>(null);
  const [sortConfig, setSortConfig] = usePersistedFilterState<{ key: string; direction: 'asc' | 'desc' }>(
    'consignments',
    'sortConfig',
    { key: 'dateCreated', direction: 'desc' },
    userId
  );
  
  // Create consignment state
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [consignmentItems, setConsignmentItems] = useState<DraftConsignmentItem[]>([]);
  const [lastAddedSku, setLastAddedSku] = useState<string | null>(null);
  /** null = user must choose how to add items; keeps gun vs typing unambiguous */
  const [itemEntryMode, setItemEntryMode] = useState<'barcode' | 'manual' | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastAddedRowRef = useRef<HTMLTableRowElement>(null);
  
  // Details view state
  const [salesQuantities, setSalesQuantities] = useState<{[key: number]: number}>({});
  /** Unit sale price (USD) per consignment line index — used when registering sales */
  const [saleUnitPrices, setSaleUnitPrices] = useState<Record<number, string>>({});
  const [salePaymentStatus, setSalePaymentStatus] = useState<'Unpaid' | 'Partially Paid' | 'Paid'>('Unpaid');
  const [saleAmountPaidInput, setSaleAmountPaidInput] = useState('');
  const [salePaymentMethod, setSalePaymentMethod] = useState('');
  const [salePaymentComment, setSalePaymentComment] = useState('');
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const hasLoadedRef = useRef(false);

  // PDF language selection modal state
  
  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [consignmentToDelete, setConsignmentToDelete] = useState<Consignment | null>(null);
  
  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{open: boolean, title?: string, message: string}>({open: false, message: ''});
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const [filterMonth, setFilterMonth] = usePersistedFilterState('consignments', 'filterMonth', '', userId);
  const [dateFrom, setDateFrom] = usePersistedFilterState('consignments', 'dateFrom', '', userId);
  const [dateTo, setDateTo] = usePersistedFilterState('consignments', 'dateTo', '', userId);
  const [filterClientId, setFilterClientId] = usePersistedFilterState('consignments', 'filterClientId', '', userId);
  const [filterStatus, setFilterStatus] = usePersistedFilterState('consignments', 'filterStatus', '', userId);
  const [listSearch, setListSearch] = usePersistedFilterState('consignments', 'listSearch', '', userId);
  const [showFilters, setShowFilters] = useState(false);
  const [showGroupByDropdown, setShowGroupByDropdown] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [groupByField, setGroupByField] = usePersistedFilterState('consignments', 'groupByField', '', userId);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const listToolbarRef = useRef<HTMLDivElement>(null);
  const groupByDropdownRef = useRef<HTMLDivElement>(null);
  
  const formatTemplate = (template: string, vars: Record<string, string>) => {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  };

  const resolveAlertTitle = (title?: string) => {
    if (!title) return t('common.info');
    const englishTitles: Record<string, string> = {
      Success: t('common.success'),
      Error: t('common.error'),
      'Validation Error': t('common.warning'),
      'Stock Error': t('consignments.stock'),
      'Stock Limit': t('consignments.stock'),
      Stock: t('consignments.stock'),
    };
    return englishTitles[title] ?? title;
  };

  // Helper function for styled alerts
  const showAlert = (message: string, title?: string) => {
    setAlertDialog({ open: true, message, title: resolveAlertTitle(title) });
  };

  const alertDialogElement = (
    <AlertDialog
      open={alertDialog.open}
      title={alertDialog.title}
      message={alertDialog.message}
      buttonText={t('common.accept')}
      onClose={() => setAlertDialog({ open: false, message: '', title: undefined })}
    />
  );

  const generatingPdfOverlay = isGeneratingPdf ? (
    <ModalPortal>
      <div
        className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[110] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm`}
        role="alertdialog"
        aria-busy="true"
        aria-live="polite"
        aria-labelledby="consignment-pdf-loading-title"
        aria-describedby="consignment-pdf-loading-message"
      >
        <div className="sasa-modal-panel w-full max-w-sm overflow-hidden rounded-2xl px-6 py-8 text-center shadow-2xl">
          <div
            className={`mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-t-transparent ${
              darkMode ? 'border-gray-300' : 'border-[#515151]'
            }`}
            aria-hidden
          />
          <h3
            id="consignment-pdf-loading-title"
            className="text-lg font-semibold text-gray-900"
          >
            {t('consignments.generatingPdf') || 'Generando PDF…'}
          </h3>
          <p
            id="consignment-pdf-loading-message"
            className="mt-2 text-sm text-gray-600"
          >
            {t('consignments.generatingPdfHint') ||
              'Por favor espere. No haga clic de nuevo.'}
          </p>
        </div>
      </div>
    </ModalPortal>
  ) : null;

  // Create a stable string identifier - always a string, never changes array size
  const userIdString = (user?.id || '') as string;

  useEffect(() => {
    // Only load data once when user becomes available
    if (userIdString && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadConsignments();
      loadClients();
      void loadOpenInvoices();
      void ensureClientDocumentLinks().then((result) => {
        if (result && (result.linkedOrRepaired > 0 || result.refreshed > 0)) {
          loadConsignments();
        }
      });
    }
  }, [userIdString]); // Always a string, array always has 1 element

  useEffect(() => {
    if (view !== 'details' || !selectedConsignment) return;
    setSalesQuantities({});
    const prices: Record<number, string> = {};
    selectedConsignment.items.forEach((item, index) => {
      const p = normalizeSalePrice(item.unitPrice);
      if (p !== undefined) {
        prices[index] = p.toFixed(2);
      }
    });
    setSaleUnitPrices(prices);
    setSalePaymentStatus('Unpaid');
    setSaleAmountPaidInput('');
    setSalePaymentMethod('');
    setSalePaymentComment('');
  }, [view, selectedConsignment?.id]);

  useEffect(() => {
    if (view !== 'list') return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (isInsideDatePickerPortal(e.target)) return;
      if (!listToolbarRef.current?.contains(e.target as Node)) {
        setShowFilters(false);
        setShowGroupByDropdown(false);
        setShowSearchPanel(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [view]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadConsignments = async () => {
    try {
      setLoading(true);
      const data = await getAllConsignments();
      setConsignments(data);
    } catch (error: any) {
      console.error('Error loading consignments:', error);
      const errorMessage = error?.message || 'Unknown error';
      const errorCode = error?.code || 'unknown';
      console.error('Error details:', { errorMessage, errorCode, error });
      showAlert(`Error loading consignments: ${errorMessage} (Code: ${errorCode})\n\nPlease ensure:\n1. You are logged in\n2. Firestore rules have been deployed\n3. Try refreshing the page`, 'Error');
    } finally {
      setLoading(false);
    }
  };

  const loadClients = async () => {
    try {
      const country = user?.role === 'sales' ? 'Ecuador' : undefined;
      const data = await getAllClients(country);
      setClients(data);
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  };

  const loadOpenInvoices = async () => {
    try {
      const all = await getAllInvoices();
      setOpenInvoices(
        all.filter(
          (inv) =>
            !inv.sourceConsignmentFirestoreId &&
            (inv.deliveryStatus === 'Pending' || inv.deliveryStatus === 'Partially Delivered')
        )
      );
    } catch (error) {
      console.error('Error loading open invoices for stock holds:', error);
    }
  };

  const getAvailableInventory = () => filterSellableInventory(inventory);

  // Filter inventory based on search term
  const getFilteredInventory = () => {
    if (!searchTerm.trim()) return [];
    const searchLower = searchTerm.toLowerCase();
    return getAvailableInventory().filter(item =>
      item.sku.toLowerCase().includes(searchLower) ||
      item.name.toLowerCase().includes(searchLower) ||
      item.description?.toLowerCase().includes(searchLower)
    ).slice(0, 10);
  };

  const addProductToConsignment = useCallback(
    (product: InventoryItem) => {
      if (!hasSellableStock(product)) {
        showAlert(t('inventory.noSellableStock'), 'Stock');
        return;
      }

      const maxQuantity = getAvailableStock(product);
      let accepted = false;

      setConsignmentItems((prev) => {
        const idx = prev.findIndex((item) => item.sku === product.sku);
        if (idx >= 0) {
          const row = prev[idx];
          const nextQty = row.quantity + 1;
          if (nextQty > maxQuantity) {
            queueMicrotask(() =>
              showAlert(
                `${t('consignments.cannotExceedStock')} ${maxQuantity}`,
                'Stock Limit'
              )
            );
            return prev;
          }
          accepted = true;
          const without = prev.filter((_, i) => i !== idx);
          return [
            ...without,
            {
              ...row,
              quantity: nextQty,
              imageUrl: row.imageUrl || product.images?.[0],
            },
          ];
        }

        accepted = true;
        const salePrice = normalizeSalePrice(product.salePrice);
        return [
          ...prev,
          {
            sku: product.sku,
            description: product.description || product.name,
            quantity: 1,
            line: product.line,
            category: product.category,
            unitPriceInput: salePrice != null ? salePrice.toFixed(2) : '',
            imageUrl: product.images?.[0],
          },
        ];
      });

      if (accepted) {
        setLastAddedSku(product.sku);
      }
      setSearchTerm('');
      setShowDropdown(false);
    },
    [t]
  );

  const processBarcodeScan = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;

      const matched = findInventoryItemByBarcodeScan(inventory, code);
      if (!matched) {
        showAlert(t('sales.barcodeNotInSystem'), t('sales.barcodeScanTitle'));
        return;
      }

      const product = filterSellableInventory(inventory).find((p) => p.sku === matched.sku);
      if (!product) {
        showAlert(t('sales.barcodeNoStock'), t('sales.barcodeScanTitle'));
        return;
      }

      addProductToConsignment(product);
    },
    [inventory, t, addProductToConsignment]
  );

  useBarcodeScanner({
    enabled:
      view === 'create' &&
      !!selectedClient &&
      itemEntryMode === 'barcode' &&
      !alertDialog.open,
    onScan: processBarcodeScan,
    ignoreFormFields: true,
    minLength: 3,
    shouldIgnore: () =>
      alertDialog.open || !selectedClient || itemEntryMode !== 'barcode',
  });

  useEffect(() => {
    if (!lastAddedSku) return;
    lastAddedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [lastAddedSku, consignmentItems]);

  const handleQuantityChange = (index: number, quantity: number) => {
    const updatedItems = [...consignmentItems];
    const item = updatedItems[index];
    const inventoryItem = inventory.find(inv => inv.sku === item.sku);
    const maxQuantity = inventoryItem ? getAvailableStock(inventoryItem) : 0;
    
    const validQuantity = Math.min(Math.max(1, quantity), maxQuantity);
    updatedItems[index].quantity = validQuantity;
    setConsignmentItems(updatedItems);
    
    if (quantity > maxQuantity) {
      showAlert(`${t('consignments.cannotExceedStock')} ${maxQuantity}`, 'Stock Limit');
    }
  };

  const handleUnitPriceChange = (index: number, raw: string) => {
    setConsignmentItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], unitPriceInput: raw };
      return copy;
    });
  };

  const removeItem = (index: number) => {
    const removed = consignmentItems[index];
    setConsignmentItems(consignmentItems.filter((_, i) => i !== index));
    if (removed && lastAddedSku === removed.sku) {
      setLastAddedSku(null);
    }
  };

  const totalUnitsScanned = useMemo(
    () => consignmentItems.reduce((sum, item) => sum + item.quantity, 0),
    [consignmentItems]
  );

  const calculateTotalItems = (items: ConsignmentItem[]) => {
    return items.reduce((sum, item) => sum + item.quantityDelivered, 0);
  };

  const calculateTotalSold = (items: ConsignmentItem[]) => {
    return items.reduce((sum, item) => sum + item.quantitySold, 0);
  };

  const calculateTotalReturned = (items: ConsignmentItem[]) => {
    return items.reduce((sum, item) => sum + item.quantityReturned, 0);
  };

  const calculateTotalRemaining = (items: ConsignmentItem[]) => {
    return items.reduce(
      (sum, item) => sum + (item.quantityDelivered - item.quantitySold - item.quantityReturned),
      0
    );
  };

  const consignmentStatusBadgeClass = (status: Consignment['status']) => {
    const base = 'rounded-full px-2.5 py-1 text-xs font-medium';
    if (status === 'Open') return `${base} bg-blue-100 text-blue-800 sasa-consignment-status-open`;
    if (status === 'Partially Closed') return `${base} bg-yellow-100 text-yellow-800 sasa-consignment-status-partial`;
    return `${base} bg-green-100 text-green-800 sasa-consignment-status-closed`;
  };

  const consignmentStatusLabel = (status: Consignment['status']) => {
    if (status === 'Open') return t('consignments.statusOpen');
    if (status === 'Partially Closed') return t('consignments.statusPartiallyClosed');
    return t('consignments.statusClosed');
  };

  const calculateStatus = (items: ConsignmentItem[]): ConsignmentStatus => {
    const totalDelivered = calculateTotalItems(items);
    const totalSold = calculateTotalSold(items);
    const totalReturned = calculateTotalReturned(items);
    const totalAccounted = totalSold + totalReturned;
    
    if (totalAccounted >= totalDelivered) {
      return 'Closed';
    } else if (totalAccounted > 0) {
      return 'Partially Closed';
    }
    return 'Open';
  };

  const handleCreateConsignment = async () => {
    if (isCreatingConsignmentRef.current) return;

    if (!selectedClient) {
      showAlert(t('consignments.pleaseSelectClient'), 'Validation Error');
      return;
    }

    if (consignmentItems.length === 0) {
      showAlert(t('consignments.pleaseAddItems'), 'Validation Error');
      return;
    }

    // Check free stock (ecuador − reserved notes). Units already on consignments
    // are out of ecuadorStock and cannot be taken again.
    for (const item of consignmentItems) {
      const inventoryItem = inventory.find(inv => inv.sku === item.sku);
      const available = inventoryItem ? getAvailableStock(inventoryItem) : 0;
      if (!inventoryItem || available < item.quantity) {
        showAlert(
          formatTemplate(t('consignments.insufficientStock'), {
            sku: item.sku,
            available: String(available),
          }),
          'Stock Error'
        );
        return;
      }
    }

    isCreatingConsignmentRef.current = true;
    setIsCreatingConsignment(true);

    try {
      // Create consignment items
      const consignmentItemsData: ConsignmentItem[] = consignmentItems.map(item => {
        const unitPrice = parseSalePriceInput(item.unitPriceInput);
        return {
          sku: item.sku,
          description: item.description,
          quantityDelivered: item.quantity,
          quantitySold: 0,
          quantityReturned: 0,
          line: item.line,
          category: item.category,
          ...(unitPrice !== undefined ? { unitPrice } : {}),
        };
      });

      const clientAddress = formatClientAddress(selectedClient);

      // Create consignment
      const newConsignment = await createConsignment({
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        clientAddress,
        items: consignmentItemsData,
        status: 'Open',
        dateCreated: new Date()
      });

      // Move inventory from free Ecuador stock to consignment stock (never touch reserved note holds).
      for (const item of consignmentItems) {
        const inventoryItem = inventory.find(inv => inv.sku === item.sku);
        if (!inventoryItem) continue;
        const available = getAvailableStock(inventoryItem);
        if (item.quantity > available) {
          throw new Error(
            formatTemplate(t('consignments.insufficientStock'), {
              sku: item.sku,
              available: String(available),
            })
          );
        }
        const reserved = getReservedStock(inventoryItem);
        const newEcuadorStock = inventoryItem.ecuadorStock - item.quantity;
        if (newEcuadorStock < reserved) {
          throw new Error(
            formatTemplate(t('consignments.insufficientStock'), {
              sku: item.sku,
              available: String(available),
            })
          );
        }
        const newConsignmentStock = (inventoryItem.consignmentStock || 0) + item.quantity;
        await updateInventory(inventoryItem.id, {
          ecuadorStock: newEcuadorStock,
          consignmentStock: newConsignmentStock,
        });
      }

      const createdConsignmentId = String(newConsignment.consignmentId ?? '').trim();
      showAlert(
        formatTemplate(t('consignments.consignmentCreated'), {
          consignmentId: createdConsignmentId || '—',
        }),
        t('consignments.consignmentCreatedTitle')
      );
      setView('list');
      setSelectedClient(null);
      setConsignmentItems([]);
      setLastAddedSku(null);
      setItemEntryMode(null);
      loadConsignments();
    } catch (error) {
      console.error('Error creating consignment:', error);
      showAlert(t('consignments.errorCreating'), t('common.error'));
    } finally {
      isCreatingConsignmentRef.current = false;
      setIsCreatingConsignment(false);
    }
  };

  const roundMoney2 = (n: number) => Math.round(n * 100) / 100;

  const handleRegisterSales = async () => {
    if (isRegisteringSalesRef.current) return;
    if (!selectedConsignment) return;

    const hasSales = Object.values(salesQuantities).some(qty => qty > 0);
    if (!hasSales) {
      showAlert(t('consignments.pleaseEnterQuantitiesToSell'), 'Validation Error');
      return;
    }

    isRegisteringSalesRef.current = true;
    setIsRegisteringSales(true);

    try {
      // Validate quantities + unit prices for lines being sold
      const updatedItems = selectedConsignment.items.map((item, index) => {
        const salesQty = salesQuantities[index] || 0;
        const availableQty = item.quantityDelivered - item.quantitySold - item.quantityReturned;
        
        if (salesQty > availableQty) {
          throw new Error(`Cannot sell more than available for ${item.sku}. Available: ${availableQty}`);
        }
        if (salesQty > 0) {
          const raw = (saleUnitPrices[index] ?? '').trim();
          const unitPrice = parseFloat(raw.replace(',', '.'));
          if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
            throw new Error(
              t('consignments.saleUnitPriceRequired') ||
                `Indique un precio unitario válido (> 0) para ${item.sku}.`
            );
          }
        }
        return { ...item, quantitySold: item.quantitySold + salesQty };
      });

      const salesItems: SalesInvoiceLine[] = selectedConsignment.items
        .map((item, index) => {
          const salesQty = salesQuantities[index] || 0;
          if (salesQty <= 0) return null;
          const unitPrice = roundMoney2(
            parseFloat((saleUnitPrices[index] ?? '').trim().replace(',', '.'))
          );
          const totalPrice = roundMoney2(unitPrice * salesQty);
          return {
            sku: item.sku,
            description: item.description,
            quantity: salesQty,
            unitPrice,
            totalPrice,
            line: item.line,
            category: item.category,
          } as SalesInvoiceLine;
        })
        .filter((item): item is SalesInvoiceLine => item !== null);

      const subtotal = roundMoney2(salesItems.reduce((sum, line) => sum + line.totalPrice, 0));
      const grandTotal = subtotal;

      let amountPaid = 0;
      let remainingBalance = grandTotal;
      let paymentStatus: 'Unpaid' | 'Partially Paid' | 'Paid' = 'Unpaid';
      let paymentDate: Date | undefined;

      if (salePaymentStatus === 'Paid') {
        amountPaid = grandTotal;
        remainingBalance = 0;
        paymentStatus = 'Paid';
        paymentDate = new Date();
      } else if (salePaymentStatus === 'Partially Paid') {
        const paid = roundMoney2(parseFloat(saleAmountPaidInput.trim().replace(',', '.')));
        if (!Number.isFinite(paid) || paid <= 0) {
          throw new Error(
            t('consignments.salePartialAmountRequired') ||
              'Indique el monto cobrado para un pago parcial (mayor que 0).'
          );
        }
        if (paid >= grandTotal - 0.005) {
          throw new Error(
            t('consignments.salePartialMustBeLessThanTotal') ||
              'Para marcar como pago total use "Pagado". El monto parcial debe ser menor al total.'
          );
        }
        amountPaid = paid;
        remainingBalance = roundMoney2(grandTotal - paid);
        paymentStatus = 'Partially Paid';
        paymentDate = new Date();
      } else {
        amountPaid = 0;
        remainingBalance = grandTotal;
        paymentStatus = 'Unpaid';
      }

      const paymentMethodTrim = salePaymentMethod.trim();
      const paymentCommentTrim = salePaymentComment.trim();

      let paymentHistory: PaymentRecord[] | undefined;
      if (amountPaid > 0) {
        const rec: PaymentRecord = {
          date: new Date(),
          amount: amountPaid,
        };
        if (paymentMethodTrim) rec.method = paymentMethodTrim;
        if (paymentCommentTrim) rec.comment = paymentCommentTrim;
        paymentHistory = [rec];
      }

      const notesBase =
        t('consignments.saleNoteConsignmentPrefix')?.replace(
          '{id}',
          selectedConsignment.consignmentId
        ) || `Venta consignación ${selectedConsignment.consignmentId}`;
      const notes = notesBase;

      // Update consignment
      const newStatus = calculateStatus(updatedItems);
      await updateConsignment(selectedConsignment.id, {
        items: updatedItems,
        status: newStatus
      });

      // Move from consignment stock to sold inventory (Ecuador stock)
      // As per requirement: Move quantity sold from "Inventory on Consignment" → "Sold Inventory (Ecuador)"
      for (let i = 0; i < selectedConsignment.items.length; i++) {
        const salesQty = salesQuantities[i] || 0;
        if (salesQty > 0) {
          const item = selectedConsignment.items[i];
          const inventoryItem = inventory.find(inv => inv.sku === item.sku);
          if (inventoryItem) {
            const newConsignmentStock = (inventoryItem.consignmentStock || 0) - salesQty;
            await updateInventory(inventoryItem.id, {
              consignmentStock: Math.max(0, newConsignmentStock),
            });
          }
        }
      }

      if (salesItems.length > 0) {
        // Prefer live client data so the nota reflects current name/address
        const liveClient =
          clients.find((c) => c.id === selectedConsignment.clientId) ||
          (selectedConsignment.clientId
            ? await getClient(selectedConsignment.clientId)
            : null);
        const clientName = liveClient?.name ?? selectedConsignment.clientName;
        const clientAddress = liveClient
          ? formatClientAddress(liveClient)
          : selectedConsignment.clientAddress || '';

        await createInvoice({
          invoiceNumber: 'TEMP',
          clientId: selectedConsignment.clientId,
          clientName,
          clientAddress,
          items: salesItems,
          subtotal,
          discountType: 'percentage',
          discountValue: 0,
          discountTotal: 0,
          grandTotal,
          date: new Date(),
          notes,
          salesAgent: user?.name || user?.email || '',
          currency: 'USD',
          deliveryStatus: 'Delivered',
          paymentStatus,
          amountPaid,
          remainingBalance,
          paymentDate,
          ...(paymentMethodTrim ? { paymentMethod: paymentMethodTrim } : {}),
          ...(paymentCommentTrim ? { paymentComment: paymentCommentTrim } : {}),
          ...(paymentHistory ? { paymentHistory } : {}),
          sourceConsignmentId: selectedConsignment.consignmentId,
          sourceConsignmentFirestoreId: selectedConsignment.id,
        });
      }

      showAlert(t('consignments.salesRegistered'), t('common.success'));
      setSalesQuantities({});
      loadConsignments();
      // Reload selected consignment
      const updated = await getAllConsignments();
      const updatedConsignment = updated.find(c => c.id === selectedConsignment.id);
      if (updatedConsignment) {
        setSelectedConsignment(updatedConsignment);
      }
    } catch (error: any) {
      console.error('Error registering sales:', error);
      showAlert(error.message || t('consignments.errorRegisteringSales'), t('common.error'));
    } finally {
      isRegisteringSalesRef.current = false;
      setIsRegisteringSales(false);
    }
  };

  const handleReturnModalSubmit = async ({
    updatedItems,
    inventoryPatches,
  }: {
    updatedItems: ConsignmentItem[];
    inventoryPatches: Array<{
      inventoryId: string;
      ecuadorDelta: number;
      consignmentDelta: number;
      newIssueRefs: ConsignmentReturnIssueRef[];
    }>;
  }) => {
    if (!selectedConsignment) return;

    const newStatus = calculateStatus(updatedItems);
    await updateConsignment(selectedConsignment.id, {
      items: updatedItems,
      status: newStatus,
    });

    for (const patch of inventoryPatches) {
      const inv = inventory.find((i) => i.id === patch.inventoryId);
      if (!inv) continue;
      const nextEcuador = inv.ecuadorStock + patch.ecuadorDelta;
      const nextConsignment = Math.max(0, (inv.consignmentStock || 0) - patch.consignmentDelta);
      await updateInventory(patch.inventoryId, {
        ecuadorStock: nextEcuador,
        consignmentStock: nextConsignment,
        ...(patch.newIssueRefs.length > 0
          ? {
              consignmentReturnIssues: [
                ...(inv.consignmentReturnIssues ?? []),
                ...patch.newIssueRefs,
              ],
            }
          : {}),
      });
    }

    showAlert(t('consignments.returnsRegistered'), t('common.success'));
    await loadConsignments();
    const updated = await getAllConsignments();
    const refreshed = updated.find((c) => c.id === selectedConsignment.id);
    if (refreshed) setSelectedConsignment(refreshed);
  };

  const handleViewDetails = (consignment: Consignment) => {
    setSelectedConsignment(consignment);
    setView('details');
    setSalesQuantities({});
  };

  const handleDeleteClick = (consignment: Consignment) => {
    setConsignmentToDelete(consignment);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!consignmentToDelete) return;

    try {
      // Return all consignment stock back to Ecuador stock
      for (const item of consignmentToDelete.items) {
        const inventoryItem = inventory.find(inv => inv.sku === item.sku);
        if (inventoryItem) {
          // Calculate how much is still in consignment (not sold or returned)
          const stillInConsignment = item.quantityDelivered - item.quantitySold - item.quantityReturned;
          
          if (stillInConsignment > 0) {
            const newConsignmentStock = Math.max(0, (inventoryItem.consignmentStock || 0) - stillInConsignment);
            const newEcuadorStock = inventoryItem.ecuadorStock + stillInConsignment;
            
            await updateInventory(inventoryItem.id, {
              consignmentStock: newConsignmentStock,
              ecuadorStock: newEcuadorStock
            });
          }
        }
      }

      // Delete the consignment
      await deleteConsignment(consignmentToDelete.id);
      
      showAlert(t('consignments.consignmentDeleted'), t('common.success'));
      setDeleteConfirmOpen(false);
      setConsignmentToDelete(null);
      loadConsignments();
    } catch (error: any) {
      console.error('Error deleting consignment:', error);
      showAlert(error.message || t('consignments.errorDeleting'), t('common.error'));
      setDeleteConfirmOpen(false);
      setConsignmentToDelete(null);
    }
  };

  const handleGeneratePDFClick = (consignment: Consignment) => {
    if (isGeneratingPdfRef.current) return;
    void generatePDF(consignment);
  };

  const handlePrintPrepLabelClick = (consignment: Consignment) => {
    void downloadConsignmentPrepLabelPdf(consignment).catch((error) => {
      console.error('Error generating prep label:', error);
      showAlert(
        t('consignments.prepLabelFailed') || 'No se pudo generar la etiqueta de preparación',
        t('common.error')
      );
    });
  };

  const generatePDF = async (consignment: Consignment) => {
    if (isGeneratingPdfRef.current) return;
    isGeneratingPdfRef.current = true;
    setIsGeneratingPdf(true);

    try {
      const { convertImageForPDF } = await import('../utils/imageConverter');
      const { buildPdfProductImagesBySku } = await import('../utils/pdfProductImages');
      const { normalizePdfLogoSrc } = await import('../utils/pdfRenderHelpers');
      const logoUrl =
        typeof window !== 'undefined' ? `${window.location.origin}/sasa.png` : '/sasa.png';

      const [logoBase64, productImagesBySku, React, pdfBundle] = await Promise.all([
        convertImageForPDF(logoUrl),
        buildPdfProductImagesBySku(
          consignment.items.map((item) => item.sku),
          inventory
        ),
        import('react'),
        Promise.all([import('@react-pdf/renderer'), import('./ConsignmentPDF')]),
      ]);

      const logoSrc = normalizePdfLogoSrc(logoBase64, logoUrl);
      const [{ pdf }, { default: ConsignmentPDF }] = pdfBundle;

      const pdfDocument = React.createElement(ConsignmentPDF, {
        consignment,
        logoSrc,
        productImagesBySku,
      });

      const blob = await pdf(pdfDocument as never).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `consignment-${consignment.consignmentId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating PDF:', error);
      showAlert(t('consignments.errorGeneratingPdf'), t('common.error'));
    } finally {
      isGeneratingPdfRef.current = false;
      setIsGeneratingPdf(false);
    }
  };

  const filteredInventory = getFilteredInventory();

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const consignmentsFiltered = useMemo(() => {
    return consignments.filter((c) => {
      const raw = c.dateCreated as Date | string;
      const d = raw instanceof Date ? raw : new Date(raw);
      if (filterMonth) {
        const [ys, ms] = filterMonth.split('-');
        const y = parseInt(ys, 10);
        const m = parseInt(ms, 10) - 1;
        if (!Number.isNaN(y) && !Number.isNaN(m) && (d.getFullYear() !== y || d.getMonth() !== m)) {
          return false;
        }
      }
      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        if (d < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (d > to) return false;
      }
      if (filterClientId && c.clientId !== filterClientId) return false;
      if (filterStatus && c.status !== filterStatus) return false;
      const q = listSearch.trim().toLowerCase();
      if (q && !c.consignmentId.toLowerCase().includes(q) && !c.clientName.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [consignments, filterMonth, dateFrom, dateTo, filterClientId, filterStatus, listSearch]);

  const sortedConsignments = useMemo(() => {
    return [...consignmentsFiltered].sort((a, b) => {
      let aVal: string | number | Date | undefined;
      let bVal: string | number | Date | undefined;

      if (sortConfig.key === 'totalItemsDelivered') {
        aVal = calculateTotalItems(a.items);
        bVal = calculateTotalItems(b.items);
      } else if (sortConfig.key === 'totalSold') {
        aVal = calculateTotalSold(a.items);
        bVal = calculateTotalSold(b.items);
      } else if (sortConfig.key === 'totalReturned') {
        aVal = calculateTotalReturned(a.items);
        bVal = calculateTotalReturned(b.items);
      } else {
        const aValue = a[sortConfig.key as keyof Consignment];
        const bValue = b[sortConfig.key as keyof Consignment];
        if (sortConfig.key === 'items') {
          aVal = 0;
          bVal = 0;
        } else {
          aVal = aValue as string | number | Date | undefined;
          bVal = bValue as string | number | Date | undefined;
        }
      }

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
      }

      if (aVal instanceof Date) {
        aVal = aVal.getTime();
        bVal = (bVal as Date).getTime();
      }

      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [consignmentsFiltered, sortConfig]);

  const groupedConsignments = useMemo(() => {
    if (!groupByField) return {} as Record<string, Consignment[]>;
    const groups: Record<string, Consignment[]> = {};
    const statusLabel = (s: Consignment['status']) =>
      s === 'Open'
        ? t('consignments.statusOpen')
        : s === 'Partially Closed'
          ? t('consignments.statusPartiallyClosed')
          : t('consignments.statusClosed');
    sortedConsignments.forEach((c) => {
      let key: string;
      if (groupByField === 'clientName') key = c.clientName || '—';
      else if (groupByField === 'status') key = statusLabel(c.status);
      else if (groupByField === 'month') {
        const raw = c.dateCreated as Date | string;
        const d = raw instanceof Date ? raw : new Date(raw);
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else key = '—';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return groups;
  }, [sortedConsignments, groupByField, t]);

  useEffect(() => {
    setExpandedGroups(new Set());
  }, [groupByField]);

  const activeListFiltersCount = [
    filterMonth,
    dateFrom,
    dateTo,
    filterClientId,
    filterStatus,
    listSearch.trim(),
  ].filter(Boolean).length;

  const clearListFilters = () => {
    setFilterMonth('');
    setDateFrom('');
    setDateTo('');
    setFilterClientId('');
    setFilterStatus('');
    setListSearch('');
  };

  const renderConsignmentTableRow = (consignment: Consignment) => (
    <tr key={consignment.id} className="transition-colors hover:bg-gray-50">
      <td className="whitespace-nowrap px-6 py-4">
        <div className="font-mono text-sm font-medium text-[#515151]">{consignment.consignmentId}</div>
      </td>
      <td className="px-6 py-4">
        <div className="text-sm font-medium text-gray-900">{consignment.clientName}</div>
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <div className="text-sm text-gray-700">{formatDateDMY(consignment.dateCreated)}</div>
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <span className={consignmentStatusBadgeClass(consignment.status)}>
          {consignmentStatusLabel(consignment.status)}
        </span>
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-center">
        <div className="text-sm text-gray-900">{calculateTotalItems(consignment.items)}</div>
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-center">
        <div className="text-sm text-gray-900">{calculateTotalSold(consignment.items)}</div>
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-center">
        <div className="text-sm text-gray-900">{calculateTotalReturned(consignment.items)}</div>
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-center">
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => handleViewDetails(consignment)}
            className={tableRowActionButtonClass}
          >
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {t('consignments.viewDetails')}
          </button>
          <button
            type="button"
            onClick={() => handleDeleteClick(consignment)}
            className={tableRowActionButtonClass}
          >
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            {t('consignments.delete') || t('common.delete')}
          </button>
        </div>
      </td>
    </tr>
  );

  // List View
  if (view === 'list') {
    return (
      <>
        <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">{t('consignments.title')}</h2>
            <p className="text-sm text-gray-500 mt-1">{t('consignments.subtitle')}</p>
          </div>
          <button
            onClick={() => setView('create')}
            className="px-4 py-2 bg-[#515151] text-white rounded-lg hover:bg-[#000000] transition-colors"
          >
            {t('consignments.createNew')}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">{t('consignments.loading')}</div>
        ) : consignments.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500">{t('consignments.noConsignments')}</p>
          </div>
        ) : (
          <>
            <div ref={listToolbarRef} className="space-y-4">
              <div className="flex flex-wrap items-center justify-end gap-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowFilters((v) => !v);
                      setShowGroupByDropdown(false);
                      setShowSearchPanel(false);
                    }}
                    className={`flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm transition-all duration-200 hover:bg-gray-50 hover:shadow-md ${
                      showFilters ? 'border-[#515151] bg-[#515151] text-white' : ''
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
                    {activeListFiltersCount > 0 && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">
                        {activeListFiltersCount}
                      </span>
                    )}
                  </button>
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowGroupByDropdown((v) => !v);
                      setShowFilters(false);
                      setShowSearchPanel(false);
                    }}
                    className={`flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm transition-all duration-200 hover:bg-gray-50 hover:shadow-md ${
                      groupByField ? 'border-[#515151] bg-[#515151] text-white' : ''
                    }`}
                  >
                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={HUB_GROUP_STACK_ICON_PATH} />
                    </svg>
                    <span className="font-medium">{t('purchaseOrders.groupBy')}</span>
                    {groupByField ? (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">1</span>
                    ) : null}
                  </button>
                  {showGroupByDropdown && (
                    <div
                      ref={groupByDropdownRef}
                      className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-gray-200 bg-white shadow-lg"
                    >
                      <div className="p-4">
                        <div className="mb-3 text-sm font-medium text-gray-700">{t('purchaseOrders.groupByField')}</div>
                        {groupByField && Object.keys(groupedConsignments).length > 0 && (
                          <div className="mb-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedGroups(new Set(Object.keys(groupedConsignments)));
                                setShowGroupByDropdown(false);
                              }}
                              className="flex-1 rounded-lg bg-green-50 px-3 py-1.5 text-xs text-green-700 transition-colors hover:bg-green-100"
                            >
                              {t('purchaseOrders.expandAll') || 'Expand All'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedGroups(new Set());
                                setShowGroupByDropdown(false);
                              }}
                              className="flex-1 rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-100"
                            >
                              {t('purchaseOrders.collapseAll') || 'Collapse All'}
                            </button>
                          </div>
                        )}
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              setGroupByField('');
                              setShowGroupByDropdown(false);
                              setExpandedGroups(new Set());
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
                              { key: 'clientName', label: t('consignments.clientName') },
                              { key: 'status', label: t('consignments.status') },
                              { key: 'month', label: t('salesNotes.groupMonth') },
                            ] as const
                          ).map((field) => (
                            <button
                              key={field.key}
                              type="button"
                              onClick={() => {
                                setGroupByField(field.key);
                                setShowGroupByDropdown(false);
                                setExpandedGroups(new Set());
                              }}
                              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                                groupByField === field.key ? 'bg-[#515151] text-white' : 'text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={HUB_GROUP_STACK_ICON_PATH} />
                              </svg>
                              {field.label}
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
                      setShowFilters(false);
                      setShowGroupByDropdown(false);
                    }}
                    className={`flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm transition-all duration-200 hover:bg-gray-50 hover:shadow-md ${
                      showSearchPanel ? 'border-[#515151] bg-[#515151] text-white' : ''
                    }`}
                    aria-label={t('inventory.search')}
                  >
                    <svg className="h-4 w-4 shrink-0 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                  {showSearchPanel && (
                    <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
                      <div className="mb-3 text-sm font-medium text-gray-700">{t('inventory.search')}</div>
                      <div className="relative">
                        <input
                          type="search"
                          value={listSearch}
                          onChange={(e) => setListSearch(e.target.value)}
                          placeholder={t('consignments.searchListPlaceholder')}
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

              {showFilters && (
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <div className="border-t border-gray-200 bg-gray-50 p-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">{t('salesNotes.filterByMonth')}</label>
                        <MonthYearSelectEs value={filterMonth} onChange={setFilterMonth} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">{t('salesNotes.dateFrom')}</label>
                        <DateInput
                          value={dateFrom}
                          onChange={setDateFrom}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">{t('salesNotes.dateTo')}</label>
                        <DateInput
                          value={dateTo}
                          onChange={setDateTo}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">{t('consignments.client')}</label>
                        <select
                          value={filterClientId}
                          onChange={(e) => setFilterClientId(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-[#515151]"
                        >
                          <option value="">{t('salesNotes.allClients')}</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">{t('consignments.status')}</label>
                        <select
                          value={filterStatus}
                          onChange={(e) => setFilterStatus(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-[#515151]"
                        >
                          <option value="">{t('salesNotes.all')}</option>
                          <option value="Open">{t('consignments.statusOpen')}</option>
                          <option value="Partially Closed">{t('consignments.statusPartiallyClosed')}</option>
                          <option value="Closed">{t('consignments.statusClosed')}</option>
                        </select>
                      </div>
                    </div>
                    {activeListFiltersCount > 0 && (
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={clearListFilters}
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

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full min-w-max">
              <thead className={tableTheadClass}>
                <tr>
                  <th
                    className={`${tableThSortableClass} ${tableThAlignClass('left')}`}
                    onClick={() => handleSort('consignmentId')}
                  >
                    <div className={tableThLabelFlexClass('left')}>
                      {t('consignments.consignmentId')}
                      <TableSortIcon
                        columnKey="consignmentId"
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
                      {t('consignments.clientName')}
                      <TableSortIcon columnKey="clientName" activeKey={sortConfig.key} direction={sortConfig.direction} />
                    </div>
                  </th>
                  <th
                    className={`${tableThSortableClass} ${tableThAlignClass('left')}`}
                    onClick={() => handleSort('dateCreated')}
                  >
                    <div className={tableThLabelFlexClass('left')}>
                      {t('consignments.dateCreated')}
                      <TableSortIcon columnKey="dateCreated" activeKey={sortConfig.key} direction={sortConfig.direction} />
                    </div>
                  </th>
                  <th
                    className={`${tableThSortableClass} ${tableThAlignClass('left')}`}
                    onClick={() => handleSort('status')}
                  >
                    <div className={tableThLabelFlexClass('left')}>
                      {t('consignments.status')}
                      <TableSortIcon columnKey="status" activeKey={sortConfig.key} direction={sortConfig.direction} />
                    </div>
                  </th>
                  <th
                    className={`${tableThSortableClass} ${tableThAlignClass('center')}`}
                    onClick={() => handleSort('totalItemsDelivered')}
                  >
                    <div className={tableThLabelFlexClass('center')}>
                      {t('consignments.totalItemsDelivered')}
                      <TableSortIcon
                        columnKey="totalItemsDelivered"
                        activeKey={sortConfig.key}
                        direction={sortConfig.direction}
                      />
                    </div>
                  </th>
                  <th
                    className={`${tableThSortableClass} ${tableThAlignClass('center')}`}
                    onClick={() => handleSort('totalSold')}
                  >
                    <div className={tableThLabelFlexClass('center')}>
                      {t('consignments.totalSold')}
                      <TableSortIcon columnKey="totalSold" activeKey={sortConfig.key} direction={sortConfig.direction} />
                    </div>
                  </th>
                  <th
                    className={`${tableThSortableClass} ${tableThAlignClass('center')}`}
                    onClick={() => handleSort('totalReturned')}
                  >
                    <div className={tableThLabelFlexClass('center')}>
                      {t('consignments.totalReturned')}
                      <TableSortIcon
                        columnKey="totalReturned"
                        activeKey={sortConfig.key}
                        direction={sortConfig.direction}
                      />
                    </div>
                  </th>
                  <th className={`${tableThBaseClass} ${tableThAlignClass('center')}`}>{t('consignments.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedConsignments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-sm text-gray-500">
                      {activeListFiltersCount > 0 ? t('consignments.noMatchFilters') : t('consignments.noConsignments')}
                    </td>
                  </tr>
                ) : !groupByField ? (
                  sortedConsignments.map((c) => renderConsignmentTableRow(c))
                ) : (
                  Object.entries(groupedConsignments).map(([groupKey, items]) => {
                    const isExpanded = expandedGroups.has(groupKey);
                    const toggleGroup = () => {
                      setExpandedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(groupKey)) next.delete(groupKey);
                        else next.add(groupKey);
                        return next;
                      });
                    };
                    return (
                      <Fragment key={groupKey}>
                        <tr className="border-t border-gray-200 bg-gray-50">
                          <td colSpan={8} className="px-6 py-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={toggleGroup}
                                  className="flex items-center gap-2 text-left transition-opacity hover:opacity-80"
                                  title={
                                    isExpanded
                                      ? t('purchaseOrders.collapseGroup') || 'Collapse'
                                      : t('purchaseOrders.expandGroup') || 'Expand'
                                  }
                                >
                                  <svg
                                    className={`h-5 w-5 text-gray-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                  <span className="text-lg font-semibold text-gray-900">{groupKey}</span>
                                </button>
                                <span className="rounded-full bg-[#515151] px-2 py-1 text-xs font-medium text-white">
                                  {items.length}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && items.map((c) => renderConsignmentTableRow(c))}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          open={deleteConfirmOpen}
          title={t('consignments.deleteConsignment') || 'Delete Consignment'}
          description={t('consignments.deleteConfirm') || `Are you sure you want to delete consignment ${consignmentToDelete?.consignmentId}? This will return all unsold items to inventory.`}
          confirmText={t('common.delete') || 'Delete'}
          cancelText={t('common.cancel') || 'Cancel'}
          onConfirm={handleDeleteConfirm}
          onCancel={() => {
            setDeleteConfirmOpen(false);
            setConsignmentToDelete(null);
          }}
        />
        {/* Alert Dialog */}
        {alertDialogElement}
        {generatingPdfOverlay}
      </>
    );
  }

  // Create View
  if (view === 'create') {
    return (
      <>
        <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">{t('consignments.createTitle')}</h2>
            <p className="text-sm text-gray-500 mt-1">{t('consignments.createSubtitle')}</p>
          </div>
          <button
            onClick={() => {
              setView('list');
              setSelectedClient(null);
              setConsignmentItems([]);
              setLastAddedSku(null);
              setItemEntryMode(null);
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {t('consignments.cancel')}
          </button>
        </div>

        {/* Client Selection */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('consignments.clientInformation')}</h3>
          {selectedClient ? (
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('consignments.clientNameLabel')}</div>
                    <div className="font-semibold text-gray-900">{selectedClient.name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('consignments.country')}</div>
                    <div className="font-medium text-gray-900">{selectedClient.country === 'Ecuador' ? 'Ecuador' : 'USA'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('consignments.address')}</div>
                    <div className="text-gray-700">{selectedClient.address}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('consignments.city')}</div>
                    <div className="text-gray-700">{selectedClient.city}</div>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => {
                      setSelectedClient(null);
                      setItemEntryMode(null);
                      setSearchTerm('');
                      setShowDropdown(false);
                    }}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    {t('consignments.changeClient')}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {clients.map((client) => (
                <div
                  key={client.id}
                  onClick={() => setSelectedClient(client)}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="font-semibold text-gray-900">{client.name}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {client.address}, {client.city}, {client.country}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Items Selection */}
        {selectedClient && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('consignments.itemsToDeliver')}</h3>

            {/* Entry mode: choose once so gun vs typing never conflict */}
            <div className="mb-5">
              <p className="mb-2 text-sm font-medium text-gray-700">
                {t('consignments.entryModeLabel')}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setItemEntryMode('barcode');
                    setSearchTerm('');
                    setShowDropdown(false);
                    searchInputRef.current?.blur();
                  }}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    itemEntryMode === 'barcode'
                      ? 'border-[#515151] bg-[#515151]/5 ring-1 ring-[#515151]/25'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-sm font-semibold text-gray-900">
                    {t('consignments.entryModeBarcode')}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {t('consignments.entryModeBarcodeDesc')}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setItemEntryMode('manual')}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    itemEntryMode === 'manual'
                      ? 'border-[#515151] bg-[#515151]/5 ring-1 ring-[#515151]/25'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-sm font-semibold text-gray-900">
                    {t('consignments.entryModeManual')}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {t('consignments.entryModeManualDesc')}
                  </div>
                </button>
              </div>
            </div>

            {itemEntryMode === 'barcode' && (
              <div className="mb-4 rounded-lg border border-dashed border-[#515151]/30 bg-[#515151]/[0.04] px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                    aria-hidden
                  />
                  {t('consignments.scannerActive')}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {t('consignments.scannerActiveHint')}
                </p>
              </div>
            )}

            {itemEntryMode === 'manual' && (
            <div className="mb-4 relative" ref={dropdownRef}>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                {t('consignments.searchSku')}
              </label>
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t('consignments.searchSkuPlaceholder')}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                autoComplete="off"
              />
              
              {showDropdown && filteredInventory.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredInventory.map((product) => {
                    const available = getAvailableStock(product);
                    const reserved = getReservedStock(product);
                    const onConsignment = getConsignmentStock(product);
                    const notes = getOpenReservationNotesForSku(openInvoices, product.sku);
                    const noteLabels = notes
                      .map((n) => `${n.invoiceNumber} (${n.quantity})`)
                      .join(', ');
                    const otherConsignments = getOpenConsignmentsForSku(consignments, product.sku);
                    const consignmentLabels = otherConsignments
                      .map((c) => `${c.consignmentId} (${c.quantity})`)
                      .join(', ');
                    return (
                    <div
                      key={product.id}
                      onClick={() => addProductToConsignment(product)}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-mono text-sm font-semibold text-[#515151]">{product.sku}</div>
                      <div className="text-sm text-gray-600">{product.name}</div>
                      <div className="text-xs text-gray-500">
                        {t('consignments.available')}: {available}
                        {reserved > 0
                          ? ` · ${t('consignments.reservedInNotes')}: ${reserved}${noteLabels ? ` — ${noteLabels}` : ''}`
                          : ''}
                        {onConsignment > 0
                          ? ` · ${t('consignments.onConsignment')}: ${onConsignment}${consignmentLabels ? ` — ${consignmentLabels}` : ''}`
                          : ''}
                        {' | '}{product.category} - {product.line}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {!itemEntryMode && (
              <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                {t('consignments.entryModeChooseFirst')}
              </div>
            )}

            {itemEntryMode &&
              (consignmentItems.length > 0 ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5">
                  <span className="text-sm text-gray-600">{t('consignments.unitsScanned')}</span>
                  <span className="text-sm font-semibold tabular-nums text-gray-900">
                    {formatTemplate(t('consignments.unitsScannedCount'), {
                      count: String(totalUnitsScanned),
                    })}
                    <span className="ml-2 font-normal text-gray-500">
                      ({consignmentItems.length}{' '}
                      {consignmentItems.length === 1
                        ? t('consignments.skuSingular')
                        : t('consignments.skuPlural')}
                      )
                    </span>
                  </span>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('consignments.photo')}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('consignments.sku')}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('consignments.description')}</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('consignments.quantity')}</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('consignments.unitPrice')}</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('consignments.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {consignmentItems.map((item, index) => {
                      const inventoryItem = inventory.find(inv => inv.sku === item.sku);
                      const maxQuantity = inventoryItem ? getAvailableStock(inventoryItem) : 0;
                      const isLastAdded = lastAddedSku === item.sku;
                      const imageUrl = item.imageUrl || inventoryItem?.images?.[0];
                      return (
                        <tr
                          key={item.sku}
                          ref={isLastAdded ? lastAddedRowRef : undefined}
                          className={`transition-colors ${
                            isLastAdded
                              ? 'bg-[#515151]/[0.06] ring-1 ring-inset ring-[#515151]/20'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="whitespace-nowrap px-4 py-3">
                            <ConsignmentProductThumb
                              imageUrl={imageUrl}
                              alt={item.description || item.sku}
                            />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="font-mono text-sm font-medium text-gray-900">{item.sku}</div>
                              {isLastAdded && (
                                <span className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#515151]/80 bg-[#515151]/10">
                                  {t('consignments.lastAdded')}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-900">{item.description}</div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <input
                                type="number"
                                min="1"
                                max={maxQuantity}
                                value={item.quantity}
                                onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 1)}
                                className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                              />
                              <div className="text-xs text-gray-500">{t('consignments.max')}: {maxQuantity}</div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <div className="relative">
                                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                                  $
                                </span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={item.unitPriceInput}
                                  onChange={(e) => handleUnitPriceChange(index, e.target.value)}
                                  placeholder="—"
                                  className="w-24 rounded border border-gray-300 py-1 pl-5 pr-2 text-center tabular-nums"
                                  aria-label={t('consignments.unitPrice')}
                                />
                              </div>
                              <div className="text-[10px] text-gray-400">
                                {t('consignments.unitPriceHint')}
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className={tableRowActionButtonClass}
                              aria-label={t('consignments.remove')}
                            >
                              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              {t('consignments.remove')}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                {itemEntryMode === 'barcode'
                  ? t('consignments.noItemsScannedYet')
                  : t('consignments.noItemsAdded')}
              </div>
            ))}

            {consignmentItems.length > 0 && (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleCreateConsignment}
                  disabled={isCreatingConsignment}
                  className="inline-flex w-full items-center justify-center gap-2 px-6 py-3 bg-[#515151] text-white rounded-lg hover:bg-[#000000] transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#515151]"
                >
                  {isCreatingConsignment ? (
                    <>
                      <svg className="h-5 w-5 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {t('consignments.creatingConsignment')}
                    </>
                  ) : (
                    t('consignments.createConsignment')
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
        {/* Alert Dialog */}
        {alertDialogElement}
        {generatingPdfOverlay}
      </>
    );
  }

  // Details View
  if (view === 'details' && selectedConsignment) {
    const detailItems = selectedConsignment.items;
    const detailDelivered = calculateTotalItems(detailItems);
    const detailSold = calculateTotalSold(detailItems);
    const detailReturned = calculateTotalReturned(detailItems);
    const detailRemaining = calculateTotalRemaining(detailItems);
    const estimatedSaleTotal = detailItems.reduce((sum, item, index) => {
      const qty = salesQuantities[index] || 0;
      const unitRaw = (saleUnitPrices[index] ?? '').trim().replace(',', '.');
      const unit = parseFloat(unitRaw);
      if (qty > 0 && Number.isFinite(unit) && unit > 0) {
        return sum + roundMoney2(qty * unit);
      }
      return sum;
    }, 0);

    return (
      <>
        <div className="space-y-6">
          {/* Encabezado */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold text-gray-900">{selectedConsignment.consignmentId}</h2>
                <span className={consignmentStatusBadgeClass(selectedConsignment.status)}>
                  {consignmentStatusLabel(selectedConsignment.status)}
                </span>
              </div>
              <p className="text-sm text-gray-500">
                {t('consignments.client')}:{' '}
                <span className="font-medium text-gray-900">{selectedConsignment.clientName}</span>
              </p>
              {selectedConsignment.clientAddress ? (
                <p className="text-sm text-gray-500">{selectedConsignment.clientAddress}</p>
              ) : null}
              <p className="text-sm text-gray-500">
                {t('consignments.dateCreated')}: {formatDateDMY(selectedConsignment.dateCreated)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleGeneratePDFClick(selectedConsignment)}
                disabled={isGeneratingPdf}
                className={`${tableRowActionButtonClass} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {isGeneratingPdf
                  ? t('consignments.generatingPdf') || 'Generando PDF…'
                  : t('consignments.generatePdf')}
              </button>
              <button
                type="button"
                onClick={() => handlePrintPrepLabelClick(selectedConsignment)}
                className={tableRowActionButtonClass}
              >
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                  />
                </svg>
                {t('consignments.printPrepLabel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setView('list');
                  setSelectedConsignment(null);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                {t('consignments.backToList')}
              </button>
            </div>
          </div>

          {/* Resumen */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: t('consignments.totalItemsDelivered'), value: detailDelivered },
              { label: t('consignments.totalSold'), value: detailSold },
              { label: t('consignments.totalReturned'), value: detailReturned },
              { label: t('consignments.remaining'), value: detailRemaining },
            ].map((stat) => (
              <div key={stat.label} className="sasa-consignment-stat rounded-xl px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{stat.label}</div>
                <div className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Artículos entregados */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">{t('consignments.itemsDelivered')}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={tableTheadClass}>
                  <tr>
                    <th className={`${tableThBaseClass} text-left`}>{t('consignments.photo')}</th>
                    <th className={`${tableThBaseClass} text-left`}>{t('consignments.sku')}</th>
                    <th className={`${tableThBaseClass} text-left`}>{t('consignments.description')}</th>
                    <th className={`${tableThBaseClass} text-right`}>{t('consignments.unitPrice')}</th>
                    <th className={`${tableThBaseClass} text-center`}>{t('consignments.qtyDelivered')}</th>
                    <th className={`${tableThBaseClass} text-center`}>{t('consignments.qtySold')}</th>
                    <th className={`${tableThBaseClass} text-center`}>{t('consignments.qtyReturned')}</th>
                    <th className={`${tableThBaseClass} text-center`}>{t('consignments.remaining')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detailItems.map((item, index) => {
                    const remaining = item.quantityDelivered - item.quantitySold - item.quantityReturned;
                    const inventoryItem = inventory.find((inv) => inv.sku === item.sku);
                    return (
                      <tr key={index} className="transition-colors hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3">
                          <ConsignmentProductThumb
                            imageUrl={inventoryItem?.images?.[0]}
                            alt={item.description || item.sku}
                          />
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="font-mono text-sm font-medium text-gray-900">{item.sku}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">{item.description}</div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right tabular-nums text-gray-900">
                          {formatSalePriceDisplay(normalizeSalePrice(item.unitPrice))}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-center text-gray-900 tabular-nums">
                          {item.quantityDelivered}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-center text-gray-900 tabular-nums">
                          {item.quantitySold}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-center text-gray-900 tabular-nums">
                          {item.quantityReturned}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-center font-medium text-gray-900 tabular-nums">
                          {remaining}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Registrar ventas */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">{t('consignments.registerSales')}</h3>
              <p className="mt-1 text-sm text-gray-500">{t('consignments.registerSalesIntro')}</p>
            </div>
            <div className="p-6">
              <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] xl:gap-8">
                <div className="min-w-0 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className={tableTheadClass}>
                      <tr>
                        <th className={`${tableThBaseClass} text-left`}>{t('consignments.sku')}</th>
                        <th className={`${tableThBaseClass} text-left`}>{t('consignments.description')}</th>
                        <th className={`${tableThBaseClass} text-center`}>{t('consignments.available')}</th>
                        <th className={`${tableThBaseClass} text-center`}>{t('consignments.qtySold')}</th>
                        <th className={`${tableThBaseClass} text-center`}>{t('consignments.saleUnitPriceUsd')}</th>
                        <th className={`${tableThBaseClass} text-right`}>{t('consignments.saleLineTotalUsd')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {detailItems.map((item, index) => {
                        const available = item.quantityDelivered - item.quantitySold - item.quantityReturned;
                        const qty = salesQuantities[index] || 0;
                        const unitRaw = (saleUnitPrices[index] ?? '').trim().replace(',', '.');
                        const unit = parseFloat(unitRaw);
                        const lineTotal =
                          qty > 0 && Number.isFinite(unit) && unit > 0
                            ? roundMoney2(qty * unit)
                            : null;
                        return (
                          <tr key={index} className="transition-colors hover:bg-gray-50">
                            <td className="px-6 py-3 font-mono text-xs text-gray-900">{item.sku}</td>
                            <td className="px-6 py-3 text-gray-700">{item.description}</td>
                            <td className="px-6 py-3 text-center text-gray-700 tabular-nums">{available}</td>
                            <td className="px-6 py-3 text-center">
                              <input
                                type="number"
                                min="0"
                                max={available}
                                value={salesQuantities[index] ?? ''}
                                onChange={(e) =>
                                  setSalesQuantities({
                                    ...salesQuantities,
                                    [index]: parseInt(e.target.value, 10) || 0,
                                  })
                                }
                                className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                                disabled={available === 0}
                              />
                            </td>
                            <td className="px-6 py-3 text-center">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={saleUnitPrices[index] ?? ''}
                                onChange={(e) =>
                                  setSaleUnitPrices({ ...saleUnitPrices, [index]: e.target.value })
                                }
                                className="w-24 px-2 py-1 border border-gray-300 rounded text-center"
                                disabled={available === 0}
                              />
                            </td>
                            <td className="px-6 py-3 text-right font-medium text-gray-800 tabular-nums">
                              {lineTotal != null ? `$${lineTotal.toFixed(2)}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <aside className="mt-8 space-y-4 border-t border-gray-200 pt-8 xl:mt-0 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0">
                  <h4 className="text-sm font-semibold text-gray-900">
                    {t('consignments.salePaymentSection')}
                  </h4>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {t('consignments.salePaymentStatus')}
                      </label>
                      <select
                        value={salePaymentStatus}
                        onChange={(e) =>
                          setSalePaymentStatus(e.target.value as 'Unpaid' | 'Partially Paid' | 'Paid')
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="Unpaid">{t('invoiceTracking.unpaid')}</option>
                        <option value="Paid">{t('invoiceTracking.paid')}</option>
                        <option value="Partially Paid">{t('invoiceTracking.partial')}</option>
                      </select>
                    </div>
                    {salePaymentStatus === 'Partially Paid' && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                          {t('consignments.saleAmountReceived')}
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={saleAmountPaidInput}
                          onChange={(e) => setSaleAmountPaidInput(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          placeholder="0.00"
                        />
                      </div>
                    )}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {t('consignments.salePaymentMethod')}
                      </label>
                      <input
                        type="text"
                        value={salePaymentMethod}
                        onChange={(e) => setSalePaymentMethod(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder={t('consignments.salePaymentMethodPh')}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {t('consignments.salePaymentComment')}
                      </label>
                      <textarea
                        value={salePaymentComment}
                        onChange={(e) => setSalePaymentComment(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder={t('consignments.salePaymentCommentPh')}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">{t('consignments.salePaymentHint')}</p>
                </aside>
              </div>

              <div className="mt-8 flex flex-col gap-4 border-t border-gray-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-gray-600">
                  {estimatedSaleTotal > 0 ? (
                    <>
                      <span className="text-gray-500">{t('common.total')}: </span>
                      <span className="text-lg font-semibold text-gray-900 tabular-nums">
                        ${estimatedSaleTotal.toFixed(2)}
                      </span>
                    </>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleRegisterSales}
                  disabled={isRegisteringSales}
                  className="sasa-btn-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRegisteringSales ? (
                    <>
                      <svg className="h-4 w-4 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {t('consignments.registeringSales')}
                    </>
                  ) : (
                    t('consignments.registerSalesButton')
                  )}
                </button>
              </div>
            </div>
          </section>

          {/* Registrar devoluciones */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900">{t('consignments.registerReturns')}</h3>
                <p className="mt-1 text-sm text-gray-500">{t('consignments.registerReturnsIntro')}</p>
              </div>
              <button
                type="button"
                onClick={() => setReturnModalOpen(true)}
                className={`${tableRowActionButtonClass} shrink-0`}
              >
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                {t('consignments.openReturnModal')}
              </button>
            </div>
          </section>
        </div>
        <ConsignmentReturnModal
          open={returnModalOpen}
          consignment={selectedConsignment}
          inventory={inventory}
          onClose={() => setReturnModalOpen(false)}
          onSubmit={handleReturnModalSubmit}
        />
        {/* Alert Dialog */}
        {alertDialogElement}
        {generatingPdfOverlay}
      </>
    );
  }

  return null;
}

