'use client';

import { useState, useEffect, useRef } from 'react';
import { SalesInvoice, SalesInvoiceLine, InventoryItem } from '../types';
import { updateInvoice } from '../services/invoicesService';
import { useInventory } from '../context/InventoryContext';
import { useTranslation } from '../context/TranslationContext';
import AlertDialog from './ui/AlertDialog';
import { filterSellableInventory, hasSellableStock } from '../utils/inventoryStock';

export type InvoiceEditModalProps = {
  invoice: SalesInvoice | null;
  onClose: () => void;
  onSaved?: () => void;
};

export default function InvoiceEditModal({ invoice, onClose, onSaved }: InvoiceEditModalProps) {
  const { inventory, updateInventoryItem, purchaseOrders } = useInventory();
  const { t } = useTranslation();
  const editDropdownRef = useRef<HTMLDivElement>(null);

  const [editItems, setEditItems] = useState<(SalesInvoiceLine & { maxQuantity?: number })[]>([]);
  const [editDiscountType, setEditDiscountType] = useState<'percentage' | 'flat'>('percentage');
  const [editDiscountValue, setEditDiscountValue] = useState(0);
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editPaymentComment, setEditPaymentComment] = useState('');
  const [editSearchTerm, setEditSearchTerm] = useState('');
  const [editShowDropdown, setEditShowDropdown] = useState(false);

  const [showReturnWarning, setShowReturnWarning] = useState(false);
  const [returnWarningItems, setReturnWarningItems] = useState<
    Array<{ description: string; sku: string; quantity: number; currentStock: number; newStock: number }>
  >([]);
  const [returnWarningCallback, setReturnWarningCallback] = useState<(() => void) | null>(null);

  const [alertDialog, setAlertDialog] = useState<{ open: boolean; title?: string; message: string }>({
    open: false,
    message: '',
  });

  const showAlert = (message: string, title?: string) => {
    setAlertDialog({ open: true, message, title });
  };

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
        const currentStock = inventoryItem.ecuadorStock;
        const maxQuantity = currentStock + item.quantity;
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
    const maxQuantity = product.ecuadorStock;
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

  const processInvoiceEditWithReturns = async (
    inv: SalesInvoice,
    itemsToReturn: Array<{ description: string; sku: string; quantity: number; currentStock: number; newStock: number }>
  ) => {
    for (const itemReturn of itemsToReturn) {
      const inventoryItem = inventory.find((i) => i.sku === itemReturn.sku);
      if (inventoryItem) {
        await updateInventoryItem(inventoryItem.id, { ecuadorStock: itemReturn.newStock });
      }
    }

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
        deliveryStatus: newDeliveryStatus,
      };
      if (editPaymentMethod) updatedInvoice.paymentMethod = editPaymentMethod;
      if (editPaymentComment) updatedInvoice.paymentComment = editPaymentComment;

      await updateInvoice(inv.id, updatedInvoice);
      showAlert(t('invoiceTracking.invoiceUpdated'), 'Success');
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

    const wasDelivered =
      invoice.deliveryStatus === 'Delivered' || invoice.deliveryStatus === 'Partially Delivered';

    const itemsToReturn: Array<{
      description: string;
      sku: string;
      quantity: number;
      currentStock: number;
      newStock: number;
    }> = [];

    if (wasDelivered) {
      const newItemsMap = new Map<string, number>();
      editItems.forEach((item) => {
        newItemsMap.set(item.sku, (newItemsMap.get(item.sku) || 0) + item.quantity);
      });

      invoice.items.forEach((originalItem) => {
        const newQuantity = newItemsMap.get(originalItem.sku) || 0;
        const originalQuantity = originalItem.quantity;
        if (newQuantity < originalQuantity) {
          const quantityToReturn = originalQuantity - newQuantity;
          const inventoryItem = inventory.find((inv) => inv.sku === originalItem.sku);
          if (inventoryItem) {
            const currentStock = inventoryItem.ecuadorStock;
            const newStock = currentStock + quantityToReturn;
            itemsToReturn.push({
              description: originalItem.description,
              sku: originalItem.sku,
              quantity: quantityToReturn,
              currentStock,
              newStock,
            });
          }
        }
        newItemsMap.delete(originalItem.sku);
      });
    }

    if (itemsToReturn.length > 0) {
      setReturnWarningItems(itemsToReturn);
      setReturnWarningCallback(() => async () => {
        setShowReturnWarning(false);
        await processInvoiceEditWithReturns(invoice, itemsToReturn);
      });
      setShowReturnWarning(true);
      return;
    }

    await processInvoiceEditWithReturns(invoice, []);
  };

  if (!invoice) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
        <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
          <h3 className="mb-4 text-xl font-semibold">
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
                {getFilteredEditInventory().map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className="w-full cursor-pointer border-b border-gray-100 px-4 py-2 text-left last:border-b-0 hover:bg-gray-100"
                    onClick={() => addProductToEditItems(product)}
                  >
                    <div className="font-mono text-sm font-semibold text-[#515151]">{product.sku}</div>
                    <div className="text-sm text-gray-600">{product.name}</div>
                    <div className="text-xs text-gray-500">
                      {t('invoiceTracking.stock')}: {product.ecuadorStock} | {product.category} - {product.line}
                    </div>
                  </button>
                ))}
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

      {showReturnWarning && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6">
            <h3 className="mb-4 text-xl font-bold text-orange-600">
              {t('invoiceTracking.inventoryImpactWarning')}
            </h3>
            <p className="mb-4 text-gray-700">{t('invoiceTracking.itemsRemovedMessage')}</p>
            <div className="mb-4 rounded-lg bg-green-50 p-4">
              <h4 className="mb-3 font-semibold text-gray-900">{t('invoiceTracking.itemsReturningToStock')}</h4>
              <div className="space-y-2">
                {returnWarningItems.map((item, index) => (
                  <div key={index} className="flex items-center justify-between rounded bg-white p-2">
                    <div>
                      <div className="font-medium text-gray-900">{item.description}</div>
                      <div className="text-sm text-gray-600">
                        {t('invoiceTracking.quantityReturning')}: {item.quantity}
                      </div>
                    </div>
                    <div className="text-right text-sm font-semibold text-green-600">
                      {item.currentStock} → {item.newStock}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 hover:bg-gray-200"
                onClick={() => {
                  setShowReturnWarning(false);
                  setReturnWarningItems([]);
                  setReturnWarningCallback(null);
                }}
              >
                {t('invoiceTracking.cancel')}
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700"
                onClick={() => {
                  void returnWarningCallback?.();
                  setReturnWarningItems([]);
                  setReturnWarningCallback(null);
                }}
              >
                {t('invoiceTracking.confirmAndUpdate')}
              </button>
            </div>
          </div>
        </div>
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
