'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { SalesInvoiceLine, Client, InventoryItem, SalesInvoice } from '../types';
import { getAllClients, createClient } from '../services/clientsService';
import { createInvoice } from '../services/invoicesService';
import { downloadSalesInvoicePdf } from '../utils/salesInvoicePdf';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';
import { findInventoryItemByBarcodeScan } from '../utils/barcodeGenerator';
import { filterSellableInventory, hasSellableStock } from '../utils/inventoryStock';
import AlertDialog from './ui/AlertDialog';
import DateInput from './ui/DateInput';

interface InvoiceLineWithDetails extends SalesInvoiceLine {
  line?: string;
  category?: string;
  maxQuantity: number;
  availableStock: number;
}

export default function Sales() {
  const { user, hasPermission } = useAuth();
  const { inventory, purchaseOrders } = useInventory();
  const { t } = useTranslation();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceLineWithDetails[]>([]);
  const [discountType, setDiscountType] = useState<'percentage' | 'flat'>('percentage');
  const [discountValue, setDiscountValue] = useState(0);
  const [showClientModal, setShowClientModal] = useState(false);
  const [clientModalMode, setClientModalMode] = useState<'select' | 'create'>('select');
  const [clientModalSearch, setClientModalSearch] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);
  const [newClientForm, setNewClientForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: 'Ecuador' as 'Ecuador' | 'USA',
    notes: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'transfer' | ''>('');
  const [paymentComment, setPaymentComment] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  
  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{open: boolean, title?: string, message: string}>({open: false, message: ''});
  
  // Helper function for styled alerts
  const showAlert = (message: string, title?: string) => {
    setAlertDialog({ open: true, message, title });
  };

  useEffect(() => {
    loadClients();
  }, []);

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

  const loadClients = async () => {
    try {
      const country = user?.role === 'sales' ? 'Ecuador' : undefined;
      const data = await getAllClients(country);
      setClients(data);
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  };

  const getAvailableInventory = () => filterSellableInventory(inventory);

  const buildLineFromProduct = (product: InventoryItem): InvoiceLineWithDetails => {
    let unitPrice = 25;
    if (product.linkedPurchaseOrders.length > 0) {
      const linkedOrders = purchaseOrders.filter(
        po => product.linkedPurchaseOrders.includes(po.id) && po.status === 'Verified'
      );
      if (linkedOrders.length > 0) {
        const avgLandedCost =
          linkedOrders.reduce((sum, po) => sum + po.landedCostPerUnit, 0) / linkedOrders.length;
        unitPrice = avgLandedCost * 2.5;
      }
    }
    const availableStock = product.ecuadorStock;
    return {
      sku: product.sku,
      description: product.description || product.name,
      line: product.line,
      category: product.category,
      quantity: 1,
      unitPrice,
      totalPrice: unitPrice,
      maxQuantity: availableStock,
      availableStock
    };
  };

  // Filter inventory based on search term
  const getFilteredInventory = () => {
    if (!searchTerm.trim()) return [];
    const searchLower = searchTerm.toLowerCase();
    return getAvailableInventory().filter(item =>
      item.sku.toLowerCase().includes(searchLower) ||
      item.name.toLowerCase().includes(searchLower) ||
      item.description?.toLowerCase().includes(searchLower)
    ).slice(0, 10); // Limit to 10 results
  };

  const addProductToInvoice = (product: InventoryItem) => {
    if (!hasSellableStock(product)) {
      showAlert(t('inventory.noSellableStock'), t('sales.barcodeScanTitle'));
      return;
    }
    const newLine = buildLineFromProduct(product);
    setInvoiceItems(prev => {
      const idx = prev.findIndex(i => i.sku === product.sku);
      if (idx >= 0) {
        const row = prev[idx];
        const nextQty = row.quantity + 1;
        if (nextQty > row.maxQuantity) {
          queueMicrotask(() =>
            showAlert(`${t('sales.cannotExceedStock')} ${row.maxQuantity}`, t('sales.barcodeScanTitle'))
          );
          return prev;
        }
        const copy = [...prev];
        copy[idx] = {
          ...row,
          quantity: nextQty,
          totalPrice: row.unitPrice * nextQty
        };
        return copy;
      }
      return [...prev, newLine];
    });
    setSearchTerm('');
    setShowDropdown(false);
  };

  const processBarcodeScan = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;

      const matched = findInventoryItemByBarcodeScan(inventory, code);
      if (!matched) {
        showAlert(t('sales.barcodeNotInSystem'), t('sales.barcodeScanTitle'));
        return;
      }

      const pool = getAvailableInventory();
      const product = pool.find(p => p.sku === matched.sku);
      if (!product) {
        showAlert(t('sales.barcodeNoStock'), t('sales.barcodeScanTitle'));
        return;
      }

      const newLine = buildLineFromProduct(product);
      setInvoiceItems(prev => {
        const idx = prev.findIndex(i => i.sku === product.sku);
        if (idx >= 0) {
          const row = prev[idx];
          const nextQty = row.quantity + 1;
          if (nextQty > row.maxQuantity) {
            queueMicrotask(() =>
              showAlert(`${t('sales.cannotExceedStock')} ${row.maxQuantity}`, t('sales.barcodeScanTitle'))
            );
            return prev;
          }
          const copy = [...prev];
          copy[idx] = {
            ...row,
            quantity: nextQty,
            totalPrice: row.unitPrice * nextQty
          };
          return copy;
        }
        return [...prev, newLine];
      });
    },
    [inventory, purchaseOrders, user?.role, t]
  );

  useBarcodeScanner({
    enabled: !showClientModal && !alertDialog.open,
    onScan: processBarcodeScan,
    shouldIgnore: () => showClientModal || alertDialog.open,
  });

  const handleQuantityChange = (index: number, quantity: number) => {
    const updatedItems = [...invoiceItems];
    const item = updatedItems[index];
    
    // Validate against max quantity
    const validQuantity = Math.min(Math.max(1, quantity), item.maxQuantity);
    
    updatedItems[index].quantity = validQuantity;
    updatedItems[index].totalPrice = updatedItems[index].unitPrice * validQuantity;
    setInvoiceItems(updatedItems);
    
      // Show warning if trying to exceed available stock
    if (quantity > item.maxQuantity) {
      showAlert(`${t('sales.cannotExceedStock')} ${item.maxQuantity}`, 'Stock Limit');
    }
  };

  const handlePriceChange = (index: number, price: number) => {
    const updatedItems = [...invoiceItems];
    updatedItems[index].unitPrice = price;
    updatedItems[index].totalPrice = price * updatedItems[index].quantity;
    setInvoiceItems(updatedItems);
  };

  const removeItem = (index: number) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
  };

  const calculateSubtotal = () => {
    return invoiceItems.reduce((sum, item) => sum + item.totalPrice, 0);
  };

  const calculateDiscount = () => {
    const subtotal = calculateSubtotal();
    if (discountType === 'percentage') {
      return (subtotal * discountValue) / 100;
    }
    return discountValue;
  };

  const calculateGrandTotal = () => {
    return calculateSubtotal() - calculateDiscount();
  };

  const submitInvoice = async () => {
    if (isSubmittingRef.current) return;

    if (!selectedClient) {
      showAlert(t('sales.pleaseSelectClient'), 'Validation Error');
      return;
    }
    if (invoiceItems.length === 0) {
      showAlert(t('sales.pleaseAddProducts'), 'Validation Error');
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      // Invoice number will be auto-generated in createInvoice
      const newInvoice: Omit<SalesInvoice, 'id' | 'createdAt'> = {
        invoiceNumber: 'TEMP', // Will be replaced with sequential number in createInvoice
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        clientAddress: `${selectedClient.address}, ${selectedClient.city}, ${selectedClient.country}`,
        items: invoiceItems,
        subtotal: calculateSubtotal(),
        discountType: discountType,
        discountValue: discountValue,
        discountTotal: calculateDiscount(),
        grandTotal: calculateGrandTotal(),
        date: new Date(invoiceDate),
        notes: '',
        salesAgent: user?.name || user?.email || '',
        currency: 'USD',
        deliveryStatus: 'Pending',
        paymentStatus: 'Unpaid',
        amountPaid: 0,
        remainingBalance: calculateGrandTotal()
      };

      // Only add optional fields if they have values
      if (paymentMethod) {
        newInvoice.paymentMethod = paymentMethod;
      }
      if (paymentComment) {
        newInvoice.paymentComment = paymentComment;
      }

      const created = await createInvoice(newInvoice);

      let pdfOk = true;
      try {
        await downloadSalesInvoicePdf(created);
      } catch (pdfErr) {
        pdfOk = false;
        console.error('PDF download after sale:', pdfErr);
      }

      showAlert(
        pdfOk ? t('sales.invoiceSubmitted') : `${t('sales.invoiceSubmitted')} ${t('sales.pdfDownloadFailedHint')}`,
        t('common.success')
      );

      setInvoiceItems([]);
      setSelectedClient(null);
      setPaymentMethod('');
      setPaymentComment('');
      setInvoiceDate(new Date().toISOString().split('T')[0]);
    } catch (error) {
      console.error('Error submitting invoice:', error);
      showAlert(t('sales.errorSubmitting'), 'Error');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const canCreateClient =
    hasPermission('clients.create') || hasPermission('clients.create.ecuador');

  const resetNewClientForm = () => {
    setNewClientForm({
      name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      country: 'Ecuador',
      notes: ''
    });
  };

  const openClientModal = (mode: 'select' | 'create' = 'select') => {
    if (mode === 'create' && !canCreateClient) return;
    setClientModalMode(mode);
    setClientModalSearch('');
    if (mode === 'create') resetNewClientForm();
    setShowClientModal(true);
  };

  const closeClientModal = () => {
    setShowClientModal(false);
    setCreatingClient(false);
  };

  const clientsModalFiltered = clients.filter((client) => {
    const q = clientModalSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      client.name.toLowerCase().includes(q) ||
      client.email?.toLowerCase().includes(q) ||
      client.phone?.includes(clientModalSearch.trim())
    );
  });

  const handleNewClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateClient) return;
    if (user?.role === 'sales' && newClientForm.country !== 'Ecuador') {
      showAlert(t('clients.onlyCreateEcuador'), 'Validación');
      return;
    }
    setCreatingClient(true);
    try {
      const created = await createClient({
        name: newClientForm.name.trim(),
        email: newClientForm.email.trim() || undefined,
        phone: newClientForm.phone.trim() || undefined,
        address: newClientForm.address.trim(),
        city: newClientForm.city.trim(),
        country: newClientForm.country,
        notes: newClientForm.notes.trim() || undefined
      });
      await loadClients();
      setSelectedClient(created);
      closeClientModal();
      resetNewClientForm();
    } catch (error) {
      console.error('Error creating client:', error);
      showAlert(t('clients.errorSaving'), 'Error');
    } finally {
      setCreatingClient(false);
    }
  };

  const filteredInventory = getFilteredInventory();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">{t('sales.title')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('sales.subtitle')}</p>
        </div>
      </div>

      {/* Client Selection */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{t('sales.clientInformation')}</h3>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">{t('sales.date')}:</label>
            <DateInput
              value={invoiceDate}
              onChange={setInvoiceDate}
              inputClassName="px-3 py-2 border border-gray-300 rounded-lg text-sm flex items-center gap-2 min-w-[10rem]"
            />
          </div>
        </div>
        {selectedClient ? (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sales.clientName')}</div>
                  <div className="font-semibold text-gray-900">{selectedClient.name}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sales.country')}</div>
                  <div className="font-medium text-gray-900">{selectedClient.country === 'Ecuador' ? 'Ecuador' : 'USA'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sales.address')}</div>
                  <div className="text-gray-700">{selectedClient.address}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sales.city')}</div>
                  <div className="text-gray-700">{selectedClient.city}</div>
                </div>
                {selectedClient.email && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sales.email')}</div>
                    <div className="text-gray-700">{selectedClient.email}</div>
                  </div>
                )}
                {selectedClient.phone && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sales.phone')}</div>
                    <div className="text-gray-700">{selectedClient.phone}</div>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 ml-0 md:ml-4 shrink-0">
                <button
                  type="button"
                  onClick={() => openClientModal('select')}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {t('sales.changeClient')}
                </button>
                {canCreateClient && (
                  <button
                    type="button"
                    onClick={() => openClientModal('create')}
                    className="px-4 py-2 border border-gray-300 text-gray-800 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {t('sales.newClient')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedClient(null)}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                >
                  {t('sales.clear')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openClientModal('select')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#515151] text-white rounded-lg hover:bg-[#000000] transition-colors"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                {t('sales.selectClient')}
              </button>
              {canCreateClient && (
                <button
                  type="button"
                  onClick={() => openClientModal('create')}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-800 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  {t('sales.newClient')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('sales.invoiceItems')}</h3>

          <div className="mb-4 relative" ref={dropdownRef}>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.searchSku')}</label>
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t('sales.searchSkuPlaceholder')}
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
                    onClick={() => addProductToInvoice(product)}
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                  >
                    <div className="font-mono text-sm font-semibold text-[#515151]">{product.sku}</div>
                    <div className="text-sm text-gray-600">{product.name}</div>
                    <div className="text-xs text-gray-500">{t('sales.stock')}: {product.ecuadorStock} | {product.category} - {product.line}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {invoiceItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('sales.sku')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('sales.description')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('sales.line')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('sales.category')}</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('sales.quantity')}</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('sales.unitPrice')}</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('sales.totalPrice')}</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('sales.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {invoiceItems.map((item, index) => (
                    <tr key={index} className="transition-colors hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="font-mono text-sm font-medium text-gray-900">{item.sku}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{item.description}</div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="text-sm text-gray-900">{item.line || '-'}</div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="text-sm text-gray-900">{item.category || '-'}</div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            max={isNaN(item.maxQuantity) ? undefined : item.maxQuantity}
                            value={isNaN(item.quantity) ? '' : String(item.quantity)}
                            onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 1)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                          />
                          <div className="text-xs text-gray-500">
                            {t('sales.max')}: {item.availableStock}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={isNaN(item.unitPrice) ? '' : String(item.unitPrice)}
                          onChange={(e) => handlePriceChange(index, parseFloat(e.target.value) || 0)}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                        />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="text-sm font-semibold text-gray-900">${item.totalPrice.toFixed(2)}</div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-center">
                        <button
                          onClick={() => removeItem(index)}
                          className="text-red-600 hover:text-red-700 text-sm font-medium"
                        >
                          {t('sales.remove')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              {t('sales.noItemsAdded')}
            </div>
          )}
        </div>

      {/* Totals */}
      {invoiceItems.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('sales.invoiceSummary')}</h3>
          
          <div className="space-y-3 mb-4">
            <div className="flex justify-between text-gray-700">
              <span>{t('sales.subtotal')}:</span>
              <span className="font-semibold">${calculateSubtotal().toFixed(2)}</span>
            </div>
            
            <div className="flex items-center gap-4 pt-3 border-t border-gray-200">
              <label className="text-sm font-medium text-gray-700">{t('sales.discount')}:</label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'flat')}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="percentage">{t('sales.percentage')} (%)</option>
                <option value="flat">{t('sales.flatAmount')}</option>
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
                placeholder={discountType === 'percentage' ? '0' : '0.00'}
              />
              <span className="text-gray-600 font-medium">
                = ${calculateDiscount().toFixed(2)}
              </span>
            </div>
            
            <div className="flex justify-between font-bold text-xl text-[#515151] pt-3 border-t-2 border-gray-300">
              <span>{t('sales.grandTotal')}:</span>
              <span>${calculateGrandTotal().toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Method Section */}
          <div className="border-t border-gray-200 pt-4 mt-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('sales.paymentMethodOptional')}
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'card' | 'cash' | 'transfer' | '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                >
                  <option value="">{t('sales.selectPaymentMethod')}</option>
                  <option value="card">{t('sales.card')}</option>
                  <option value="cash">{t('sales.cash')}</option>
                  <option value="transfer">{t('sales.transfer')}</option>
                </select>
              </div>
              
              {paymentMethod && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('sales.paymentDetails')}
                  </label>
                  <textarea
                    value={paymentComment}
                    onChange={(e) => setPaymentComment(e.target.value)}
                    placeholder={t('sales.paymentDetailsPlaceholder')}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                  />
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={submitInvoice}
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center gap-2 px-6 py-3 bg-[#515151] text-white rounded-lg hover:bg-[#000000] transition-colors font-medium mt-4 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#515151]"
          >
            {isSubmitting ? (
              <>
                <svg className="h-5 w-5 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {t('sales.submittingInvoice')}
              </>
            ) : (
              <>
                <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {t('sales.submitInvoice')}
              </>
            )}
          </button>
        </div>
      )}

      {/* Client picker: listar o registrar (estilo facturación) */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-xl">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">{t('sales.clientPickerTitle')}</h3>

            {canCreateClient ? (
              <div className="flex rounded-lg border border-gray-200 p-1 mb-4 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setClientModalMode('select')}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                    clientModalMode === 'select'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t('sales.tabSelectClient')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setClientModalMode('create');
                    resetNewClientForm();
                  }}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                    clientModalMode === 'create'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t('sales.tabNewClient')}
                </button>
              </div>
            ) : null}

            {!canCreateClient || clientModalMode === 'select' ? (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('sales.selectClient')}</label>
                <input
                  type="search"
                  autoComplete="off"
                  placeholder={t('sales.searchClientsPlaceholder')}
                  value={clientModalSearch}
                  onChange={(e) => setClientModalSearch(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-3 focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                />
                <div className="space-y-2 max-h-[min(24rem,50vh)] overflow-y-auto pr-1">
                  {clientsModalFiltered.length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">
                      {clients.length === 0 ? t('sales.noClientsYet') : t('sales.noClientsMatch')}
                    </p>
                  ) : (
                    clientsModalFiltered.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => {
                          setSelectedClient(client);
                          closeClientModal();
                        }}
                        className="w-full text-left border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="font-semibold text-gray-900">{client.name}</div>
                        <div className="text-sm text-gray-500 mt-1">
                          {client.address}, {client.city}, {client.country}
                        </div>
                        {(client.phone || client.email) && (
                          <div className="text-xs text-gray-400 mt-1">
                            {client.phone && `${client.phone}`}
                            {client.phone && client.email ? ' · ' : ''}
                            {client.email && `${client.email}`}
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <form onSubmit={handleNewClientSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('clients.nameRequired')}</label>
                    <input
                      type="text"
                      required
                      value={newClientForm.name}
                      onChange={(e) => setNewClientForm({ ...newClientForm, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('clients.countryRequired')}</label>
                    <select
                      required
                      value={newClientForm.country}
                      onChange={(e) =>
                        setNewClientForm({ ...newClientForm, country: e.target.value as 'Ecuador' | 'USA' })
                      }
                      disabled={user?.role === 'sales'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151] disabled:bg-gray-100"
                    >
                      <option value="Ecuador">Ecuador</option>
                      <option value="USA">USA</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('clients.email')}</label>
                    <input
                      type="email"
                      value={newClientForm.email}
                      onChange={(e) => setNewClientForm({ ...newClientForm, email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('clients.phone')}</label>
                    <input
                      type="tel"
                      value={newClientForm.phone}
                      onChange={(e) => setNewClientForm({ ...newClientForm, phone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('clients.addressRequired')}</label>
                  <input
                    type="text"
                    required
                    value={newClientForm.address}
                    onChange={(e) => setNewClientForm({ ...newClientForm, address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('clients.cityRequired')}</label>
                  <input
                    type="text"
                    required
                    value={newClientForm.city}
                    onChange={(e) => setNewClientForm({ ...newClientForm, city: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('clients.notes')}</label>
                  <textarea
                    value={newClientForm.notes}
                    onChange={(e) => setNewClientForm({ ...newClientForm, notes: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151]"
                  />
                </div>
                <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeClientModal}
                    className="w-full sm:flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={creatingClient}
                    className="w-full sm:flex-1 px-4 py-2 bg-[#515151] text-white rounded-lg hover:bg-[#000000] disabled:opacity-60"
                  >
                    {creatingClient ? t('sales.savingClient') : t('sales.saveClientAndUse')}
                  </button>
                </div>
              </form>
            )}

            {(!canCreateClient || clientModalMode === 'select') && (
              <button
                type="button"
                onClick={closeClientModal}
                className="mt-4 w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                {t('common.cancel')}
              </button>
            )}
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
    </div>
  );
}
