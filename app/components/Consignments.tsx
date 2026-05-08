'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Consignment, ConsignmentItem, ConsignmentStatus, Client, InventoryItem, SalesInvoiceLine } from '../types';
import { getAllConsignments, createConsignment, updateConsignment, deleteConsignment } from '../services/consignmentsService';
import { getAllClients } from '../services/clientsService';
import { createInvoice } from '../services/invoicesService';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';
import ConfirmDialog from './ui/ConfirmDialog';
import AlertDialog from './ui/AlertDialog';

type View = 'list' | 'create' | 'details';

export default function Consignments() {
  const { user } = useAuth();
  const { inventory, updateInventoryItem: updateInventory } = useInventory();
  const { t } = useTranslation();
  const [view, setView] = useState<View>('list');
  const [consignments, setConsignments] = useState<Consignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConsignment, setSelectedConsignment] = useState<Consignment | null>(null);
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'}>({key: 'dateCreated', direction: 'desc'});
  
  // Create consignment state
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [consignmentItems, setConsignmentItems] = useState<Array<{sku: string; description: string; quantity: number; line?: string; category?: string}>>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Details view state
  const [salesQuantities, setSalesQuantities] = useState<{[key: number]: number}>({});
  const [returnQuantities, setReturnQuantities] = useState<{[key: number]: number}>({});
  const hasLoadedRef = useRef(false);

  // PDF language selection modal state
  const [showPdfLanguageModal, setShowPdfLanguageModal] = useState(false);
  const [pdfConsignment, setPdfConsignment] = useState<Consignment | null>(null);
  
  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [consignmentToDelete, setConsignmentToDelete] = useState<Consignment | null>(null);
  
  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{open: boolean, title?: string, message: string}>({open: false, message: ''});
  
  // Helper function for styled alerts
  const showAlert = (message: string, title?: string) => {
    setAlertDialog({ open: true, message, title });
  };

  // Create a stable string identifier - always a string, never changes array size
  const userIdString = (user?.id || '') as string;

  useEffect(() => {
    // Only load data once when user becomes available
    if (userIdString && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadConsignments();
      loadClients();
    }
  }, [userIdString]); // Always a string, array always has 1 element

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          searchInputRef.current && !searchInputRef.current.contains(event.target as Node)) {
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

  // Get Ecuador inventory only for sales role
  const getAvailableInventory = () => {
    if (user?.role === 'sales') {
      return inventory.filter(item => item.ecuadorStock > 0);
    }
    return inventory.filter(item => item.ecuadorStock > 0);
  };

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

  const addProductToConsignment = (product: InventoryItem) => {
    const newItem = {
      sku: product.sku,
      description: product.description || product.name,
      quantity: 1,
      line: product.line,
      category: product.category
    };

    setConsignmentItems([...consignmentItems, newItem]);
    setSearchTerm('');
    setShowDropdown(false);
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    const updatedItems = [...consignmentItems];
    const item = updatedItems[index];
    const inventoryItem = inventory.find(inv => inv.sku === item.sku);
    const maxQuantity = inventoryItem?.ecuadorStock || 0;
    
    const validQuantity = Math.min(Math.max(1, quantity), maxQuantity);
    updatedItems[index].quantity = validQuantity;
    setConsignmentItems(updatedItems);
    
    if (quantity > maxQuantity) {
      showAlert(`Cannot exceed available stock: ${maxQuantity}`, 'Stock Limit');
    }
  };

  const removeItem = (index: number) => {
    setConsignmentItems(consignmentItems.filter((_, i) => i !== index));
  };

  const calculateTotalItems = (items: ConsignmentItem[]) => {
    return items.reduce((sum, item) => sum + item.quantityDelivered, 0);
  };

  const calculateTotalSold = (items: ConsignmentItem[]) => {
    return items.reduce((sum, item) => sum + item.quantitySold, 0);
  };

  const calculateTotalReturned = (items: ConsignmentItem[]) => {
    return items.reduce((sum, item) => sum + item.quantityReturned, 0);
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
    if (!selectedClient) {
      showAlert(t('consignments.pleaseSelectClient'), 'Validation Error');
      return;
    }

    if (consignmentItems.length === 0) {
      showAlert(t('consignments.pleaseAddItems'), 'Validation Error');
      return;
    }

    try {
      // Check if we have enough stock
      for (const item of consignmentItems) {
        const inventoryItem = inventory.find(inv => inv.sku === item.sku);
        if (!inventoryItem || inventoryItem.ecuadorStock < item.quantity) {
          showAlert(`Insufficient stock for ${item.sku}. Available: ${inventoryItem?.ecuadorStock || 0}`, 'Stock Error');
          return;
        }
      }

      // Create consignment items
      const consignmentItemsData: ConsignmentItem[] = consignmentItems.map(item => ({
        sku: item.sku,
        description: item.description,
        quantityDelivered: item.quantity,
        quantitySold: 0,
        quantityReturned: 0,
        line: item.line,
        category: item.category
      }));

      // Get client address
      const clientAddress = selectedClient.address 
        ? `${selectedClient.address}, ${selectedClient.city}, ${selectedClient.country}`
        : '';

      // Create consignment
      const newConsignment = await createConsignment({
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        clientAddress,
        items: consignmentItemsData,
        status: 'Open',
        dateCreated: new Date()
      });

      // Move inventory from Ecuador stock to consignment stock
      for (const item of consignmentItems) {
        const inventoryItem = inventory.find(inv => inv.sku === item.sku);
        if (inventoryItem) {
          const newEcuadorStock = inventoryItem.ecuadorStock - item.quantity;
          const newConsignmentStock = (inventoryItem.consignmentStock || 0) + item.quantity;
          
          await updateInventory(inventoryItem.id, {
            ecuadorStock: newEcuadorStock,
            consignmentStock: newConsignmentStock
          });
        }
      }

      showAlert(t('consignments.consignmentCreated'), 'Success');
      setView('list');
      setSelectedClient(null);
      setConsignmentItems([]);
      loadConsignments();
    } catch (error) {
      console.error('Error creating consignment:', error);
      showAlert(t('consignments.errorCreating'), 'Error');
    }
  };

  const handleRegisterSales = async () => {
    if (!selectedConsignment) return;

    const hasSales = Object.values(salesQuantities).some(qty => qty > 0);
    if (!hasSales) {
      showAlert(t('consignments.pleaseEnterQuantitiesToSell'), 'Validation Error');
      return;
    }

    try {
      // Validate quantities
      const updatedItems = selectedConsignment.items.map((item, index) => {
        const salesQty = salesQuantities[index] || 0;
        const availableQty = item.quantityDelivered - item.quantitySold - item.quantityReturned;
        
        if (salesQty > availableQty) {
          throw new Error(`Cannot sell more than available for ${item.sku}. Available: ${availableQty}`);
        }
        return { ...item, quantitySold: item.quantitySold + salesQty };
      });

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
            const newEcuadorStock = inventoryItem.ecuadorStock + salesQty;
            
            await updateInventory(inventoryItem.id, {
              consignmentStock: Math.max(0, newConsignmentStock),
              ecuadorStock: newEcuadorStock
            });
          }
        }
      }

      // Create invoice for sales
      const salesItems: SalesInvoiceLine[] = selectedConsignment.items
        .map((item, index) => {
          const salesQty = salesQuantities[index] || 0;
          if (salesQty > 0) {
            // Calculate unit price from landed cost (with markup)
            let unitPrice = 25; // Default price
            const inventoryItem = inventory.find(inv => inv.sku === item.sku);
            if (inventoryItem && inventoryItem.linkedPurchaseOrders.length > 0) {
              // Try to get average landed cost
              const linkedOrders = inventory.filter(inv => 
                inventoryItem.linkedPurchaseOrders.includes(inv.id)
              );
              // For now, use default price
            }
            
            return {
              sku: item.sku,
              description: item.description,
              quantity: salesQty,
              unitPrice,
              totalPrice: unitPrice * salesQty,
              line: item.line,
              category: item.category
            } as SalesInvoiceLine;
          }
          return null;
        })
        .filter((item): item is SalesInvoiceLine => item !== null) as SalesInvoiceLine[];

      if (salesItems.length > 0) {
        const subtotal = salesItems.reduce((sum, item) => sum + item.totalPrice, 0);
        await createInvoice({
          invoiceNumber: 'TEMP',
          clientId: selectedConsignment.clientId,
          clientName: selectedConsignment.clientName,
          clientAddress: selectedConsignment.clientAddress || '',
          items: salesItems,
          subtotal,
          discountType: 'percentage',
          discountValue: 0,
          discountTotal: 0,
          grandTotal: subtotal,
          date: new Date(),
          notes: `Consignment sale from ${selectedConsignment.consignmentId}`,
          salesAgent: user?.name || user?.email || '',
          currency: 'USD',
          deliveryStatus: 'Delivered',
          paymentStatus: 'Unpaid',
          amountPaid: 0,
          remainingBalance: subtotal
        });
      }

      showAlert(t('consignments.salesRegistered'), 'Success');
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
      showAlert(error.message || t('consignments.errorRegisteringSales'), 'Error');
    }
  };

  const handleRegisterReturns = async () => {
    if (!selectedConsignment) return;

    const hasReturns = Object.values(returnQuantities).some(qty => qty > 0);
    if (!hasReturns) {
      showAlert(t('consignments.pleaseEnterQuantitiesToReturn'), 'Validation Error');
      return;
    }

    try {
      // Validate quantities
      const updatedItems = selectedConsignment.items.map((item, index) => {
        const returnQty = returnQuantities[index] || 0;
        const availableQty = item.quantityDelivered - item.quantitySold - item.quantityReturned;
        
        if (returnQty > availableQty) {
          throw new Error(`Cannot return more than available for ${item.sku}. Available: ${availableQty}`);
        }
        return { ...item, quantityReturned: item.quantityReturned + returnQty };
      });

      // Update consignment
      const newStatus = calculateStatus(updatedItems);
      await updateConsignment(selectedConsignment.id, {
        items: updatedItems,
        status: newStatus
      });

      // Move from consignment stock back to Ecuador stock
      for (let i = 0; i < selectedConsignment.items.length; i++) {
        const returnQty = returnQuantities[i] || 0;
        if (returnQty > 0) {
          const item = selectedConsignment.items[i];
          const inventoryItem = inventory.find(inv => inv.sku === item.sku);
          if (inventoryItem) {
            const newConsignmentStock = (inventoryItem.consignmentStock || 0) - returnQty;
            const newEcuadorStock = inventoryItem.ecuadorStock + returnQty;
            
            await updateInventory(inventoryItem.id, {
              consignmentStock: Math.max(0, newConsignmentStock),
              ecuadorStock: newEcuadorStock
            });
          }
        }
      }

      showAlert(t('consignments.returnsRegistered'), 'Success');
      setReturnQuantities({});
      loadConsignments();
      // Reload selected consignment
      const updated = await getAllConsignments();
      const updatedConsignment = updated.find(c => c.id === selectedConsignment.id);
      if (updatedConsignment) {
        setSelectedConsignment(updatedConsignment);
      }
    } catch (error: any) {
      console.error('Error registering returns:', error);
      showAlert(error.message || t('consignments.errorRegisteringReturns'), 'Error');
    }
  };

  const handleViewDetails = (consignment: Consignment) => {
    setSelectedConsignment(consignment);
    setView('details');
    setSalesQuantities({});
    setReturnQuantities({});
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
      
      showAlert(t('consignments.consignmentDeleted') || 'Consignment deleted successfully', 'Success');
      setDeleteConfirmOpen(false);
      setConsignmentToDelete(null);
      loadConsignments();
    } catch (error: any) {
      console.error('Error deleting consignment:', error);
      showAlert(error.message || t('consignments.errorDeleting') || 'Error deleting consignment', 'Error');
      setDeleteConfirmOpen(false);
      setConsignmentToDelete(null);
    }
  };

  const handleGeneratePDFClick = (consignment: Consignment) => {
    setPdfConsignment(consignment);
    setShowPdfLanguageModal(true);
  };

  const generatePDF = async (consignment: Consignment, locale: 'en' | 'es' = 'en') => {
    try {
      const { convertImageForPDF } = await import('../utils/imageConverter');
      const logoUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}/sasa.png` 
        : '/sasa.png';
      const logoBase64 = await convertImageForPDF(logoUrl);
      
      const [{ pdf }, { default: ConsignmentPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./ConsignmentPDF')
      ]);

      const pdfDocument = <ConsignmentPDF consignment={consignment} logoSrc={logoBase64 || logoUrl} locale={locale} />;

      const instance = pdf(pdfDocument);
      const blob = await instance.toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `consignment-${consignment.consignmentId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      // Close modal
      setShowPdfLanguageModal(false);
      setPdfConsignment(null);
    } catch (error) {
      console.error('Error generating PDF:', error);
      showAlert(t('consignments.errorGeneratingPdf'), 'Error');
      setShowPdfLanguageModal(false);
      setPdfConsignment(null);
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

  const sortedConsignments = [...consignments].sort((a, b) => {
    let aVal: string | number | Date | undefined;
    let bVal: string | number | Date | undefined;

    // Handle special calculated fields
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
      // Exclude items array from direct comparison
      if (sortConfig.key === 'items') {
        aVal = 0;
        bVal = 0;
      } else {
        aVal = aValue as string | number | Date | undefined;
        bVal = bValue as string | number | Date | undefined;
      }
    }

    // Handle string sorting
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
    if (aVal === undefined || aVal === null) return 1;
    if (bVal === undefined || bVal === null) return -1;

    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig.key !== columnKey) return <span className="text-gray-400">↕</span>;
    return sortConfig.direction === 'asc' ? <span>↑</span> : <span>↓</span>;
  };

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
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-gray-50 border-b-2 border-gray-200">
                <tr>
                  <th 
                    className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('consignmentId')}
                  >
                    <div className="flex items-center gap-2">
                      {t('consignments.consignmentId')}
                      <SortIcon columnKey="consignmentId" />
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('clientName')}
                  >
                    <div className="flex items-center gap-2">
                      {t('consignments.clientName')}
                      <SortIcon columnKey="clientName" />
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('dateCreated')}
                  >
                    <div className="flex items-center gap-2">
                      {t('consignments.dateCreated')}
                      <SortIcon columnKey="dateCreated" />
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center gap-2">
                      {t('consignments.status')}
                      <SortIcon columnKey="status" />
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('totalItemsDelivered')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      {t('consignments.totalItemsDelivered')}
                      <SortIcon columnKey="totalItemsDelivered" />
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('totalSold')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      {t('consignments.totalSold')}
                      <SortIcon columnKey="totalSold" />
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('totalReturned')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      {t('consignments.totalReturned')}
                      <SortIcon columnKey="totalReturned" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase">{t('consignments.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedConsignments.map((consignment) => (
                  <tr key={consignment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-mono text-sm font-medium text-[#515151]">{consignment.consignmentId}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{consignment.clientName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-700">{new Date(consignment.dateCreated).toLocaleDateString()}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        consignment.status === 'Open' ? 'bg-blue-100 text-blue-800' :
                        consignment.status === 'Partially Closed' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {consignment.status === 'Open' ? t('consignments.statusOpen') :
                         consignment.status === 'Partially Closed' ? t('consignments.statusPartiallyClosed') :
                         t('consignments.statusClosed')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-sm text-gray-900">{calculateTotalItems(consignment.items)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-sm text-gray-900">{calculateTotalSold(consignment.items)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-sm text-gray-900">{calculateTotalReturned(consignment.items)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <button
                          onClick={() => handleViewDetails(consignment)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          {t('consignments.viewDetails')}
                        </button>
                        <button
                          onClick={() => handleDeleteClick(consignment)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          {t('consignments.delete') || t('common.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          open={deleteConfirmOpen}
          title={t('consignments.deleteConsignment') || 'Delete Consignment'}
          description={t('consignments.deleteConfirm') || `Are you sure you want to delete consignment ${consignmentToDelete?.consignmentId}? This will return all unsold items to inventory.`}
          confirmText={t('common.delete') || 'Delete'}
          cancelText={t('common.cancel') || 'Cancel'}
          confirmVariant="danger"
          onConfirm={handleDeleteConfirm}
          onCancel={() => {
            setDeleteConfirmOpen(false);
            setConsignmentToDelete(null);
          }}
        />
        {/* PDF Language Selection Modal */}
        {showPdfLanguageModal && pdfConsignment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
              <h3 className="text-xl font-semibold mb-4">{t('pdf.selectLanguage')}</h3>
              <p className="text-sm text-gray-600 mb-6">{t('pdf.selectLanguageForPdf')}</p>
              
              <div className="space-y-3 mb-6">
                <button
                  onClick={() => generatePDF(pdfConsignment, 'en')}
                  className="w-full px-4 py-3 bg-[#515151] text-white rounded-lg hover:bg-[#000000] transition-colors font-medium text-left"
                >
                  {t('language.english')}
                </button>
                <button
                  onClick={() => generatePDF(pdfConsignment, 'es')}
                  className="w-full px-4 py-3 bg-[#515151] text-white rounded-lg hover:bg-[#000000] transition-colors font-medium text-left"
                >
                  {t('language.spanish')}
                </button>
              </div>

              <button
                onClick={() => {
                  setShowPdfLanguageModal(false);
                  setPdfConsignment(null);
                }}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Cancel
              </button>
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
                    onClick={() => setSelectedClient(null)}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
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
            
            <div className="mb-4 relative" ref={dropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('consignments.searchSku')}</label>
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
              />
              
              {showDropdown && filteredInventory.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredInventory.map((product) => (
                    <div
                      key={product.id}
                      onClick={() => addProductToConsignment(product)}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-mono text-sm font-semibold text-[#515151]">{product.sku}</div>
                      <div className="text-sm text-gray-600">{product.name}</div>
                      <div className="text-xs text-gray-500">{t('consignments.stock')}: {product.ecuadorStock} | {product.category} - {product.line}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {consignmentItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b-2 border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('consignments.sku')}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('consignments.description')}</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('consignments.quantity')}</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('consignments.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {consignmentItems.map((item, index) => {
                      const inventoryItem = inventory.find(inv => inv.sku === item.sku);
                      const maxQuantity = inventoryItem?.ecuadorStock || 0;
                      return (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-mono text-sm font-medium text-gray-900">{item.sku}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-900">{item.description}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
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
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <button
                              onClick={() => removeItem(index)}
                              className="text-red-600 hover:text-red-700 text-sm font-medium"
                            >
                              {t('consignments.remove')}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                {t('consignments.noItemsAdded')}
              </div>
            )}

            {consignmentItems.length > 0 && (
              <div className="mt-6">
                <button
                  onClick={handleCreateConsignment}
                  className="w-full px-6 py-3 bg-[#515151] text-white rounded-lg hover:bg-[#000000] transition-colors font-medium"
                >
                  {t('consignments.createConsignment')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
        {/* PDF Language Selection Modal */}
        {showPdfLanguageModal && pdfConsignment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
              <h3 className="text-xl font-semibold mb-4">{t('pdf.selectLanguage')}</h3>
              <p className="text-sm text-gray-600 mb-6">{t('pdf.selectLanguageForPdf')}</p>
              
              <div className="space-y-3 mb-6">
                <button
                  onClick={() => generatePDF(pdfConsignment, 'en')}
                  className="w-full px-4 py-3 bg-[#515151] text-white rounded-lg hover:bg-[#000000] transition-colors font-medium text-left"
                >
                  {t('language.english')}
                </button>
                <button
                  onClick={() => generatePDF(pdfConsignment, 'es')}
                  className="w-full px-4 py-3 bg-[#515151] text-white rounded-lg hover:bg-[#000000] transition-colors font-medium text-left"
                >
                  {t('language.spanish')}
                </button>
              </div>

              <button
                onClick={() => {
                  setShowPdfLanguageModal(false);
                  setPdfConsignment(null);
                }}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Cancel
              </button>
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
      </>
    );
  }

  // Details View
  if (view === 'details' && selectedConsignment) {
    return (
      <>
        <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">{selectedConsignment.consignmentId}</h2>
            <p className="text-sm text-gray-500 mt-1">{t('consignments.client')}: {selectedConsignment.clientName}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleGeneratePDFClick(selectedConsignment)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              {t('consignments.generatePdf')}
            </button>
            <button
              onClick={() => {
                setView('list');
                setSelectedConsignment(null);
              }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {t('consignments.backToList')}
            </button>
          </div>
        </div>

        {/* Items Delivered Table */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('consignments.itemsDelivered')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b-2 border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('consignments.sku')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('consignments.description')}</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('consignments.qtyDelivered')}</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('consignments.qtySold')}</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('consignments.qtyReturned')}</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('consignments.remaining')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {selectedConsignment.items.map((item, index) => {
                  const remaining = item.quantityDelivered - item.quantitySold - item.quantityReturned;
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono text-sm font-medium text-gray-900">{item.sku}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">{item.description}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="text-sm text-gray-900">{item.quantityDelivered}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="text-sm text-gray-900">{item.quantitySold}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="text-sm text-gray-900">{item.quantityReturned}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="text-sm font-medium text-gray-900">{remaining}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Register Sales Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('consignments.registerSales')}</h3>
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">{t('consignments.sku')}</th>
                    <th className="px-3 py-2 text-left">{t('consignments.description')}</th>
                    <th className="px-3 py-2 text-center">{t('consignments.available')}</th>
                    <th className="px-3 py-2 text-center">{t('consignments.qtySold')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {selectedConsignment.items.map((item, index) => {
                    const available = item.quantityDelivered - item.quantitySold - item.quantityReturned;
                    return (
                      <tr key={index}>
                        <td className="px-3 py-2 font-mono text-xs">{item.sku}</td>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2 text-center">{available}</td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min="0"
                            max={available}
                            value={salesQuantities[index] || ''}
                            onChange={(e) => setSalesQuantities({...salesQuantities, [index]: parseInt(e.target.value) || 0})}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                            disabled={available === 0}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button
              onClick={handleRegisterSales}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              {t('consignments.registerSalesButton')}
            </button>
          </div>
        </div>

        {/* Register Returns Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('consignments.registerReturns')}</h3>
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">{t('consignments.sku')}</th>
                    <th className="px-3 py-2 text-left">{t('consignments.description')}</th>
                    <th className="px-3 py-2 text-center">{t('consignments.available')}</th>
                    <th className="px-3 py-2 text-center">{t('consignments.qtyReturned')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {selectedConsignment.items.map((item, index) => {
                    const available = item.quantityDelivered - item.quantitySold - item.quantityReturned;
                    return (
                      <tr key={index}>
                        <td className="px-3 py-2 font-mono text-xs">{item.sku}</td>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2 text-center">{available}</td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min="0"
                            max={available}
                            value={returnQuantities[index] || ''}
                            onChange={(e) => setReturnQuantities({...returnQuantities, [index]: parseInt(e.target.value) || 0})}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                            disabled={available === 0}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button
              onClick={handleRegisterReturns}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t('consignments.registerReturnsButton')}
            </button>
          </div>
        </div>
      </div>
        {/* PDF Language Selection Modal */}
        {showPdfLanguageModal && pdfConsignment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
              <h3 className="text-xl font-semibold mb-4">{t('pdf.selectLanguage')}</h3>
              <p className="text-sm text-gray-600 mb-6">{t('pdf.selectLanguageForPdf')}</p>
              
              <div className="space-y-3 mb-6">
                <button
                  onClick={() => generatePDF(pdfConsignment, 'en')}
                  className="w-full px-4 py-3 bg-[#515151] text-white rounded-lg hover:bg-[#000000] transition-colors font-medium text-left"
                >
                  {t('language.english')}
                </button>
                <button
                  onClick={() => generatePDF(pdfConsignment, 'es')}
                  className="w-full px-4 py-3 bg-[#515151] text-white rounded-lg hover:bg-[#000000] transition-colors font-medium text-left"
                >
                  {t('language.spanish')}
                </button>
              </div>

              <button
                onClick={() => {
                  setShowPdfLanguageModal(false);
                  setPdfConsignment(null);
                }}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Cancel
              </button>
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
      </>
    );
  }

  return null;
}

