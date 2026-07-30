'use client';

import { useState, useEffect, useRef } from 'react';
import { SalesInvoice, SalesInvoiceLine, InventoryItem, SalesReturnIssueRef } from '../types';
import { updateInvoice } from '../services/invoicesService';
import { useInventory } from '../context/InventoryContext';
import { useTranslation } from '../context/TranslationContext';
import AlertDialog from './ui/AlertDialog';
import { filterSellableInventory, hasSellableStock } from '../utils/inventoryStock';
import {
  getAvailableStock,
  getDeliveredQtyForStock,
  getOpenReservationNotesForSku,
  getReservedStock,
  getUndeliveredQty,
  clampReservedStock,
} from '../utils/stockReservation';
import { getAllInvoices } from '../services/invoicesService';
import { useDarkMode } from '../hooks/useDarkMode';
import ModalPortal from './ui/ModalPortal';

export type InvoiceEditModalProps = {
  invoice: SalesInvoice | null;
  onClose: () => void;
  onSaved?: () => void;
};

type StockImpactRow = {
  description: string;
  sku: string;
  /** Units physically restored to ecuadorStock (were delivered). */
  physicalQty: number;
  /** Units released from reservedStock (were undelivered holds). */
  reservedReleaseQty: number;
  currentStock: number;
  newStock: number;
  currentReserved: number;
  newReserved: number;
  problemQty: number;
  problemComment: string;
  showProblem: boolean;
};

export default function InvoiceEditModal({ invoice, onClose, onSaved }: InvoiceEditModalProps) {
  const { inventory, updateInventoryItem, purchaseOrders } = useInventory();
  const { t } = useTranslation();
  const darkMode = useDarkMode();
  const editDropdownRef = useRef<HTMLDivElement>(null);

  const [editItems, setEditItems] = useState<(SalesInvoiceLine & { maxQuantity?: number })[]>([]);
  const [editDiscountType, setEditDiscountType] = useState<'percentage' | 'flat'>('percentage');
  const [editDiscountValue, setEditDiscountValue] = useState(0);
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editPaymentComment, setEditPaymentComment] = useState('');
  const [editSearchTerm, setEditSearchTerm] = useState('');
  const [editShowDropdown, setEditShowDropdown] = useState(false);

  const [showReturnWarning, setShowReturnWarning] = useState(false);
  const [returnWarningItems, setReturnWarningItems] = useState<StockImpactRow[]>([]);
  const [previousGrandTotal, setPreviousGrandTotal] = useState(0);

  const [alertDialog, setAlertDialog] = useState<{ open: boolean; title?: string; message: string }>({
    open: false,
    message: '',
  });
  const [openInvoices, setOpenInvoices] = useState<SalesInvoice[]>([]);

  const showAlert = (message: string, title?: string) => {
    setAlertDialog({ open: true, message, title });
  };

  useEffect(() => {
    void (async () => {
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
        console.error('Error loading open invoices:', error);
      }
    })();
  }, []);

  useEffect(() => {
    if (!invoice) {
      setEditItems([]);
      setEditDiscountType('percentage');
      setEditDiscountValue(0);
      setEditPaymentMethod('');
      setEditPaymentComment('');
      setEditSearchTerm('');
      setEditShowDropdown(false);
      return;
    }

    const enrichedItems = invoice.items.map((item) => {
      const inventoryItem = inventory.find((inv) => inv.sku === item.sku);
      if (inventoryItem) {
        const undelivered = getUndeliveredQty(invoice, item);
        const available = getAvailableStock(inventoryItem);
        // Current note's undelivered hold can be reassigned on this edit.
        const maxQuantity = available + undelivered;
        return { ...item, maxQuantity } as SalesInvoiceLine & { maxQuantity?: number };
      }
      return item as SalesInvoiceLine & { maxQuantity?: number };
    });

    setEditItems(enrichedItems);
    setEditDiscountType(invoice.discountType || 'percentage');
    setEditDiscountValue(invoice.discountValue || 0);
    setEditPaymentMethod(invoice.paymentMethod || '');
    setEditPaymentComment(invoice.paymentComment || '');
  }, [invoice, inventory]);

  const getFilteredEditInventory = () => {
    if (!editSearchTerm.trim()) return [];
    const searchLower = editSearchTerm.toLowerCase();
    return filterSellableInventory(
      inventory.filter(
        (item) =>
          item.sku.toLowerCase().includes(searchLower) ||
          item.name.toLowerCase().includes(searchLower) ||
          item.description?.toLowerCase().includes(searchLower)
      )
    ).slice(0, 10);
  };

  const addProductToEditItems = (product: InventoryItem) => {
    if (!hasSellableStock(product)) {
      setAlertDialog({
        open: true,
        message: t('inventory.noSellableStock'),
        title: 'Stock',
      });
      return;
    }
    let unitPrice = 25;
    if (product.linkedPurchaseOrders.length > 0) {
      const linkedOrders = purchaseOrders.filter(
        (po) => product.linkedPurchaseOrders.includes(po.id) && po.status === 'Verified'
      );
      if (linkedOrders.length > 0) {
        const avgLandedCost =
          linkedOrders.reduce((sum, po) => sum + po.landedCostPerUnit, 0) / linkedOrders.length;
        unitPrice = avgLandedCost * 2.5;
      }
    }
    const maxQuantity = getAvailableStock(product);
    const newItem: SalesInvoiceLine & { maxQuantity?: number } = {
      sku: product.sku,
      description: product.description || product.name,
      line: product.line,
      category: product.category,
      quantity: 1,
      unitPrice,
      totalPrice: unitPrice,
      maxQuantity,
    };
    setEditItems([...editItems, newItem]);
    setEditSearchTerm('');
    setEditShowDropdown(false);
  };

  const handleEditItem = (index: number, field: string, value: string | number) => {
    const updatedItems = [...editItems];
    if (field === 'quantity' || field === 'unitPrice') {
      let parsedValue = parseFloat(String(value)) || 0;
      if (field === 'quantity') {
        const item = updatedItems[index] as SalesInvoiceLine & { maxQuantity?: number };
        if (item.maxQuantity) {
          parsedValue = Math.min(Math.max(1, parsedValue), item.maxQuantity);
          if (parseFloat(String(value)) > item.maxQuantity) {
            showAlert(`${t('invoiceTracking.cannotExceedStock')} ${item.maxQuantity}`, 'Stock Limit');
          }
        }
      }
      updatedItems[index] = { ...updatedItems[index], [field]: parsedValue };
      updatedItems[index].totalPrice = updatedItems[index].quantity * updatedItems[index].unitPrice;
    } else {
      updatedItems[index] = { ...updatedItems[index], [field]: value } as typeof updatedItems[number];
    }
    setEditItems(updatedItems);
  };

  const removeEditItem = (index: number) => {
    setEditItems(editItems.filter((_, i) => i !== index));
  };

  const calculateEditSubtotal = () => editItems.reduce((sum, item) => sum + item.totalPrice, 0);

  const calculateEditDiscount = () => {
    const subtotal = calculateEditSubtotal();
    if (editDiscountType === 'percentage') {
      return (subtotal * editDiscountValue) / 100;
    }
    return editDiscountValue;
  };

  const calculateEditGrandTotal = () => calculateEditSubtotal() - calculateEditDiscount();

  /** Clamp quantityDelivered so it never exceeds the new line quantity after edits. */
  const clampEditItemsDelivered = (inv: SalesInvoice): SalesInvoiceLine[] => {
    const oldDeliveredBySku = new Map<string, number>();
    for (const item of inv.items) {
      const d = getDeliveredQtyForStock(inv, item);
      oldDeliveredBySku.set(item.sku, (oldDeliveredBySku.get(item.sku) ?? 0) + d);
    }

    const remainingDelivered = new Map(oldDeliveredBySku);
    return editItems.map((item) => {
      const pool = remainingDelivered.get(item.sku) ?? 0;
      const keepDelivered = Math.min(item.quantity, pool);
      remainingDelivered.set(item.sku, Math.max(0, pool - keepDelivered));
      const { maxQuantity: _mq, ...line } = item as SalesInvoiceLine & { maxQuantity?: number };
      return {
        ...line,
        quantityDelivered: keepDelivered,
      };
    });
  };

  const buildStockImpactRows = (inv: SalesInvoice): StockImpactRow[] => {
    if (inv.sourceConsignmentFirestoreId) return [];

    type Agg = { description: string; qty: number; delivered: number; undelivered: number };
    const oldBySku = new Map<string, Agg>();
    for (const item of inv.items) {
      const prev = oldBySku.get(item.sku) || {
        description: item.description,
        qty: 0,
        delivered: 0,
        undelivered: 0,
      };
      prev.qty += item.quantity;
      prev.delivered += getDeliveredQtyForStock(inv, item);
      prev.undelivered += getUndeliveredQty(inv, item);
      oldBySku.set(item.sku, prev);
    }

    const newBySku = new Map<string, number>();
    for (const item of editItems) {
      newBySku.set(item.sku, (newBySku.get(item.sku) ?? 0) + item.quantity);
    }

    const rows: StockImpactRow[] = [];
    const stockOverrides = new Map<string, number>();
    const reservedOverrides = new Map<string, number>();

    for (const [sku, old] of oldBySku) {
      const newQty = newBySku.get(sku) ?? 0;
      const reduction = old.qty - newQty;
      if (reduction <= 0) continue;

      const physicalQty = Math.max(0, old.delivered - newQty);
      const reservedReleaseQty = reduction - physicalQty;
      if (physicalQty <= 0 && reservedReleaseQty <= 0) continue;

      const inventoryItem = inventory.find((i) => i.sku === sku);
      if (!inventoryItem) continue;

      const currentStock =
        stockOverrides.get(inventoryItem.id) ?? inventoryItem.ecuadorStock;
      const newStock = currentStock + physicalQty;
      stockOverrides.set(inventoryItem.id, newStock);

      const currentReserved =
        reservedOverrides.get(inventoryItem.id) ?? getReservedStock(inventoryItem);
      const newReserved = clampReservedStock(currentReserved - reservedReleaseQty);
      reservedOverrides.set(inventoryItem.id, newReserved);

      rows.push({
        description: old.description,
        sku,
        physicalQty,
        reservedReleaseQty,
        currentStock,
        newStock,
        currentReserved,
        newReserved,
        problemQty: 0,
        problemComment: '',
        showProblem: false,
      });
    }

    return rows;
  };

  const processInvoiceEditWithReturns = async (
    inv: SalesInvoice,
    impactRows: StockImpactRow[]
  ) => {
    for (const row of impactRows) {
      const inventoryItem = inventory.find((i) => i.sku === row.sku);
      if (!inventoryItem) continue;

      const updates: Partial<InventoryItem> = {};
      if (row.physicalQty > 0) {
        updates.ecuadorStock = row.newStock;
      }
      if (row.reservedReleaseQty > 0 && !inv.sourceConsignmentFirestoreId) {
        updates.reservedStock = row.newReserved;
      }

      const problemQty = Math.max(
        0,
        Math.min(row.problemQty, row.physicalQty)
      );
      if (problemQty > 0 && row.physicalQty > 0) {
        const ref: SalesReturnIssueRef = {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          sku: row.sku,
          quantityProblem: problemQty,
          recordedAt: new Date(),
        };
        const good = row.physicalQty - problemQty;
        if (good > 0) ref.quantityGoodInReturn = good;
        const cmt = row.problemComment.trim();
        if (cmt) ref.comment = cmt;
        updates.salesReturnIssues = [
          ...(inventoryItem.salesReturnIssues ?? []),
          ref,
        ];
      }

      if (Object.keys(updates).length > 0) {
        await updateInventoryItem(inventoryItem.id, updates);
      }
    }

    // Adjust reservations for lines that gained undelivered qty (adds / increases).
    if (!inv.sourceConsignmentFirestoreId) {
      const oldBySku = new Map<string, number>();
      for (const item of inv.items) {
        const qty = getUndeliveredQty(inv, item);
        if (qty <= 0) continue;
        oldBySku.set(item.sku, (oldBySku.get(item.sku) ?? 0) + qty);
      }

      const clampedItems = clampEditItemsDelivered(inv);
      const newDeliveryStatus =
        inv.deliveryStatus === 'Delivered' && editItems.length > inv.items.length
          ? 'Partially Delivered'
          : inv.deliveryStatus;

      const newBySku = new Map<string, number>();
      for (const item of clampedItems) {
        const synthetic: SalesInvoice = {
          ...inv,
          deliveryStatus: newDeliveryStatus,
          items: clampedItems,
        };
        const qty = getUndeliveredQty(synthetic, item);
        if (qty <= 0) continue;
        newBySku.set(item.sku, (newBySku.get(item.sku) ?? 0) + qty);
      }

      // Releases already applied from impactRows; only apply positive deltas (extra holds).
      const releasedSkus = new Set(
        impactRows.filter((r) => r.reservedReleaseQty > 0).map((r) => r.sku)
      );
      const reservedOverrides = new Map<string, number>();
      for (const row of impactRows) {
        if (row.reservedReleaseQty <= 0) continue;
        const inventoryItem = inventory.find((i) => i.sku === row.sku);
        if (inventoryItem) {
          reservedOverrides.set(inventoryItem.id, row.newReserved);
        }
      }

      const skus = new Set([...oldBySku.keys(), ...newBySku.keys()]);
      for (const sku of skus) {
        if (releasedSkus.has(sku)) continue; // already handled
        const delta = (newBySku.get(sku) ?? 0) - (oldBySku.get(sku) ?? 0);
        if (delta <= 0) continue;
        const inventoryItem = inventory.find((i) => i.sku === sku);
        if (!inventoryItem) continue;
        const available = getAvailableStock(inventoryItem);
        if (delta > available) {
          showAlert(
            `${t('invoiceTracking.cannotExceedStock')} ${available}`,
            'Stock Limit'
          );
          return;
        }
        const currentReserved =
          reservedOverrides.get(inventoryItem.id) ?? getReservedStock(inventoryItem);
        const next = clampReservedStock(currentReserved + delta);
        reservedOverrides.set(inventoryItem.id, next);
        await updateInventoryItem(inventoryItem.id, { reservedStock: next });
      }
    }

    const clampedItems = clampEditItemsDelivered(inv);
    const newGrandTotal = calculateEditGrandTotal();
    const currentAmountPaid = inv.amountPaid || 0;
    const newRemainingBalance = Math.max(0, newGrandTotal - currentAmountPaid);

    let newPaymentStatus: 'Unpaid' | 'Partially Paid' | 'Paid' = inv.paymentStatus;
    if (currentAmountPaid === 0) {
      newPaymentStatus = 'Unpaid';
    } else if (currentAmountPaid >= newGrandTotal || newRemainingBalance <= 0.01) {
      newPaymentStatus = 'Paid';
    } else {
      newPaymentStatus = 'Partially Paid';
    }

    let newDeliveryStatus = inv.deliveryStatus;
    if (inv.deliveryStatus === 'Delivered' && editItems.length > inv.items.length) {
      newDeliveryStatus = 'Partially Delivered';
    }
    // If all remaining lines have zero delivered, keep status consistent
    const anyDelivered = clampedItems.some(
      (item) => (item.quantityDelivered ?? 0) > 0
    );
    if (
      (inv.deliveryStatus === 'Delivered' || inv.deliveryStatus === 'Partially Delivered') &&
      !anyDelivered &&
      clampedItems.length > 0
    ) {
      newDeliveryStatus = 'Pending';
    } else if (
      inv.deliveryStatus === 'Delivered' &&
      anyDelivered &&
      clampedItems.some(
        (item) => (item.quantityDelivered ?? 0) < item.quantity
      )
    ) {
      newDeliveryStatus = 'Partially Delivered';
    }

    try {
      const updatedInvoice: Partial<SalesInvoice> = {
        items: clampedItems,
        subtotal: calculateEditSubtotal(),
        discountType: editDiscountType,
        discountValue: editDiscountValue,
        discountTotal: calculateEditDiscount(),
        grandTotal: newGrandTotal,
        remainingBalance: newRemainingBalance,
        paymentStatus: newPaymentStatus,
        deliveryStatus: newDeliveryStatus,
      };
      if (editPaymentMethod) updatedInvoice.paymentMethod = editPaymentMethod;
      if (editPaymentComment) updatedInvoice.paymentComment = editPaymentComment;

      await updateInvoice(inv.id, updatedInvoice);
      showAlert(t('invoiceTracking.invoiceUpdated'), 'Success');
      setShowReturnWarning(false);
      setReturnWarningItems([]);
      onClose();
      onSaved?.();
    } catch (error) {
      console.error('Error updating invoice:', error);
      showAlert(t('invoiceTracking.errorUpdating'), 'Error');
    }
  };

  const saveInvoiceEdit = async () => {
    if (!invoice) return;
    if (editItems.length === 0) {
      showAlert(t('invoiceTracking.invoiceMustHaveItem'), 'Validation Error');
      return;
    }

    const impactRows = buildStockImpactRows(invoice);
    if (impactRows.length > 0) {
      setPreviousGrandTotal(invoice.grandTotal || 0);
      setReturnWarningItems(impactRows);
      setShowReturnWarning(true);
      return;
    }

    await processInvoiceEditWithReturns(invoice, []);
  };

  const updateImpactRow = (index: number, patch: Partial<StockImpactRow>) => {
    setReturnWarningItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  if (!invoice) return null;

  return (
    <>
      <ModalPortal>
      <div
        className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm`}
      >
        <div className="sasa-modal-panel max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl p-6 shadow-xl">
          <h3 className="mb-4 text-xl font-semibold text-gray-900">
            {t('invoiceTracking.editInvoiceTitle')} — {invoice.invoiceNumber}
          </h3>

          <div className="relative mb-6" ref={editDropdownRef}>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              {t('invoiceTracking.addProductFromInventory')}
            </label>
            <input
              type="text"
              placeholder={t('invoiceTracking.searchBySkuPlaceholder')}
              value={editSearchTerm}
              onChange={(e) => {
                setEditSearchTerm(e.target.value);
                setEditShowDropdown(true);
              }}
              onFocus={() => setEditShowDropdown(true)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-[#515151]"
            />
            {editShowDropdown && getFilteredEditInventory().length > 0 && (
              <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg">
                {getFilteredEditInventory().map((product) => {
                  const available = getAvailableStock(product);
                  const reserved = getReservedStock(product);
                  const notes = getOpenReservationNotesForSku(openInvoices, product.sku).filter(
                    (n) => n.invoiceNumber !== invoice.invoiceNumber
                  );
                  const noteLabels = notes
                    .map((n) => `${n.invoiceNumber} (${n.quantity})`)
                    .join(', ');
                  return (
                  <button
                    key={product.id}
                    type="button"
                    className="w-full cursor-pointer border-b border-gray-100 px-4 py-2 text-left last:border-b-0 hover:bg-gray-100"
                    onClick={() => addProductToEditItems(product)}
                  >
                    <div className="font-mono text-sm font-semibold text-[#515151]">{product.sku}</div>
                    <div className="text-sm text-gray-600">{product.name}</div>
                    <div className="text-xs text-gray-500">
                      {t('sales.available')}: {available}
                      {reserved > 0
                        ? ` · ${t('sales.reserved')}: ${reserved}${noteLabels ? ` — ${noteLabels}` : ''}`
                        : ''}
                      {' | '}{product.category} - {product.line}
                    </div>
                  </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mb-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('invoiceTracking.sku')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('invoiceTracking.description')}</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('invoiceTracking.qty')}</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('invoiceTracking.unitPrice')}</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('invoiceTracking.total')}</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('invoiceTracking.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {editItems.map((item, index) => (
                  <tr key={index} className="transition-colors hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <input
                        type="text"
                        value={item.sku}
                        onChange={(e) => handleEditItem(index, 'sku', e.target.value)}
                        className="w-full rounded border px-2 py-1"
                      />
                    </td>
                    <td className="px-6 py-3">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleEditItem(index, 'description', e.target.value)}
                        className="w-full rounded border px-2 py-1"
                      />
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-col items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={item.maxQuantity || undefined}
                          value={item.quantity}
                          onChange={(e) => handleEditItem(index, 'quantity', e.target.value)}
                          className="w-20 rounded border px-2 py-1 text-center"
                        />
                        {item.maxQuantity != null && (
                          <div className="text-xs text-gray-500">
                            {t('invoiceTracking.max')}: {item.maxQuantity}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <input
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => handleEditItem(index, 'unitPrice', e.target.value)}
                        className="w-24 rounded border px-2 py-1 text-right"
                      />
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900">${item.totalPrice.toFixed(2)}</td>
                    <td className="px-6 py-3 text-center">
                      <button
                        type="button"
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

          <div className="mb-6 grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium">{t('invoiceTracking.discountType')}</label>
              <select
                value={editDiscountType}
                onChange={(e) => setEditDiscountType(e.target.value as 'percentage' | 'flat')}
                className="w-full rounded border border-gray-300 px-3 py-2"
              >
                <option value="percentage">{t('invoiceTracking.percentage')} (%)</option>
                <option value="flat">{t('invoiceTracking.flatAmount')}</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">{t('invoiceTracking.discountValue')}</label>
              <input
                type="number"
                value={editDiscountValue}
                onChange={(e) => setEditDiscountValue(parseFloat(e.target.value) || 0)}
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium">{t('invoiceTracking.paymentMethod')}</label>
            <select
              value={editPaymentMethod}
              onChange={(e) => setEditPaymentMethod(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2"
            >
              <option value="">{t('invoiceTracking.selectPaymentMethod')}</option>
              <option value="card">{t('invoiceTracking.card')}</option>
              <option value="cash">{t('invoiceTracking.cash')}</option>
              <option value="transfer">{t('invoiceTracking.transfer')}</option>
            </select>
          </div>

          {editPaymentMethod && (
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium">{t('invoiceTracking.paymentNotes')}</label>
              <textarea
                value={editPaymentComment}
                onChange={(e) => setEditPaymentComment(e.target.value)}
                rows={3}
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
          )}

          <div className="mb-6 border-t pt-4">
            <div className="mb-2 flex justify-between">
              <span>{t('invoiceTracking.subtotal')}:</span>
              <span className="font-semibold">${calculateEditSubtotal().toFixed(2)}</span>
            </div>
            <div className="mb-2 flex justify-between">
              <span>{t('invoiceTracking.discount')}:</span>
              <span className="font-semibold">${calculateEditDiscount().toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-xl font-bold text-[#515151]">
              <span>{t('invoiceTracking.grandTotal')}:</span>
              <span>${calculateEditGrandTotal().toFixed(2)}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void saveInvoiceEdit()}
              className="flex-1 rounded-lg bg-[#515151] px-4 py-2 text-white hover:bg-black"
            >
              {t('invoiceTracking.saveChanges')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200"
            >
              {t('invoiceTracking.cancel')}
            </button>
          </div>
        </div>
      </div>
      </ModalPortal>

      {showReturnWarning && (
        <ModalPortal>
        <div
          className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm`}
        >
          <div className="sasa-modal-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl p-6">
            <h3 className="mb-2 text-xl font-bold text-orange-600">
              {t('invoiceTracking.inventoryImpactWarning')}
            </h3>
            <p className="mb-4 text-sm text-gray-700">
              {t('invoiceTracking.itemsRemovedMessage')}
            </p>

            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-gray-600">{t('invoiceTracking.totalsAdjustLabel')}</span>
                <span className="font-semibold tabular-nums text-gray-900">
                  ${previousGrandTotal.toFixed(2)} → ${calculateEditGrandTotal().toFixed(2)}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {t('invoiceTracking.totalsAdjustHint')}
              </p>
            </div>

            <div className="mb-4 space-y-3">
              {returnWarningItems.map((item, index) => (
                <div
                  key={`${item.sku}-${index}`}
                  className="rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900">{item.description}</div>
                      <div className="font-mono text-xs text-gray-500">{item.sku}</div>
                    </div>
                  </div>

                  <div className="mt-2 space-y-1.5 text-sm">
                    {item.physicalQty > 0 && (
                      <div className="flex items-center justify-between rounded bg-green-50 px-2.5 py-1.5 text-green-800">
                        <span>
                          {t('invoiceTracking.physicalReturnLabel')}: {item.physicalQty}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {item.currentStock} → {item.newStock}
                        </span>
                      </div>
                    )}
                    {item.reservedReleaseQty > 0 && (
                      <div className="flex items-center justify-between rounded bg-blue-50 px-2.5 py-1.5 text-blue-800">
                        <span>
                          {t('invoiceTracking.reservationReleaseLabel')}:{' '}
                          {item.reservedReleaseQty}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {t('invoiceTracking.reservedShort')} {item.currentReserved} →{' '}
                          {item.newReserved}
                        </span>
                      </div>
                    )}
                  </div>

                  {item.physicalQty > 0 && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateImpactRow(index, { showProblem: !item.showProblem })
                        }
                        className="text-xs font-medium text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
                      >
                        {item.showProblem
                          ? t('invoiceTracking.hideProblemOption')
                          : t('invoiceTracking.reportProblemOption')}
                      </button>
                      {item.showProblem && (
                        <div className="mt-2 space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                          <p className="text-xs text-amber-900/80">
                            {t('invoiceTracking.reportProblemHint')}
                          </p>
                          <div className="flex flex-wrap items-end gap-3">
                            <div>
                              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-amber-900/70">
                                {t('invoiceTracking.problemQty')}
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={item.physicalQty}
                                value={item.problemQty || ''}
                                onChange={(e) =>
                                  updateImpactRow(index, {
                                    problemQty: Math.min(
                                      item.physicalQty,
                                      Math.max(0, parseInt(e.target.value, 10) || 0)
                                    ),
                                  })
                                }
                                className="w-20 rounded border border-amber-200 bg-white px-2 py-1 text-center text-sm tabular-nums"
                              />
                            </div>
                            <div className="min-w-[12rem] flex-1">
                              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-amber-900/70">
                                {t('invoiceTracking.problemComment')}
                              </label>
                              <input
                                type="text"
                                value={item.problemComment}
                                onChange={(e) =>
                                  updateImpactRow(index, {
                                    problemComment: e.target.value,
                                  })
                                }
                                placeholder={t('invoiceTracking.problemCommentPh')}
                                className="w-full rounded border border-amber-200 bg-white px-2 py-1 text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 hover:bg-gray-200"
                onClick={() => {
                  setShowReturnWarning(false);
                  setReturnWarningItems([]);
                }}
              >
                {t('invoiceTracking.cancel')}
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700"
                onClick={() => {
                  if (!invoice) return;
                  void processInvoiceEditWithReturns(invoice, returnWarningItems);
                }}
              >
                {t('invoiceTracking.confirmAndUpdate')}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      <AlertDialog
        open={alertDialog.open}
        title={alertDialog.title}
        message={alertDialog.message}
        onClose={() => setAlertDialog({ open: false, message: '' })}
      />
    </>
  );
}
