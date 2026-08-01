'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { AutoconsumoLine, InventoryItem } from '../types';
import { createAutoconsumoNote, deleteAutoconsumoNote } from '../services/autoconsumoService';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { findInventoryItemByBarcodeScan } from '../utils/barcodeGenerator';
import { filterSellableInventory, hasSellableStock } from '../utils/inventoryStock';
import { getAvailableStock } from '../utils/stockReservation';
import { resolveSkuUnitCost } from '../utils/landedCostCalculation';
import { deductStockForAutoconsumo } from '../utils/autoconsumoStock';
import AlertDialog from './ui/AlertDialog';
import DateInput from './ui/DateInput';

interface LineWithDetails extends AutoconsumoLine {
  maxQuantity: number;
  availableStock: number;
  imageUrl?: string;
}

function ProductThumb({ imageUrl, alt }: { imageUrl?: string; alt: string }) {
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

export default function Autoconsumo() {
  const { user } = useAuth();
  const { inventory, purchaseOrders, additionalCosts, updateInventoryItem } = useInventory();
  const { t } = useTranslation();

  const [recipient, setRecipient] = useState('');
  const [notes, setNotes] = useState('');
  const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [lines, setLines] = useState<LineWithDetails[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [itemEntryMode, setItemEntryMode] = useState<'barcode' | 'manual' | null>(null);
  const [lastAddedSku, setLastAddedSku] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastAddedRowRef = useRef<HTMLTableRowElement>(null);

  const [alertDialog, setAlertDialog] = useState<{ open: boolean; title?: string; message: string }>({
    open: false,
    message: '',
  });
  const showAlert = (message: string, title?: string) => {
    setAlertDialog({ open: true, message, title });
  };

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

  const resolveCost = useCallback(
    (sku: string): number | null => {
      const { unitCost } = resolveSkuUnitCost(sku, inventory, purchaseOrders, additionalCosts);
      return unitCost;
    },
    [inventory, purchaseOrders, additionalCosts]
  );

  const buildLine = (product: InventoryItem): LineWithDetails => {
    const unitCost = resolveCost(product.sku);
    const availableStock = getAvailableStock(product);
    return {
      sku: product.sku,
      description: product.description || product.name,
      line: product.line,
      category: product.category,
      quantity: 1,
      unitCost,
      lineCost: unitCost != null ? unitCost : 0,
      maxQuantity: availableStock,
      availableStock,
      imageUrl: product.images?.[0],
    };
  };

  const getFilteredInventory = () => {
    if (!searchTerm.trim()) return [];
    const searchLower = searchTerm.toLowerCase();
    return filterSellableInventory(inventory)
      .filter(
        (item) =>
          item.sku.toLowerCase().includes(searchLower) ||
          item.name.toLowerCase().includes(searchLower) ||
          item.description?.toLowerCase().includes(searchLower)
      )
      .slice(0, 10);
  };

  const addProduct = useCallback(
    (product: InventoryItem) => {
      if (!hasSellableStock(product)) {
        showAlert(t('inventory.noSellableStock'), t('autoconsumo.alertTitle'));
        return;
      }
      const newLine = buildLine(product);
      setLines((prev) => {
        const idx = prev.findIndex((i) => i.sku === product.sku);
        if (idx >= 0) {
          const next = [...prev];
          const row = next[idx];
          if (row.quantity >= row.maxQuantity) {
            showAlert(
              `${t('sales.cannotExceedStock')} ${row.maxQuantity}`,
              t('autoconsumo.alertTitle')
            );
            return prev;
          }
          const qty = row.quantity + 1;
          next[idx] = {
            ...row,
            quantity: qty,
            lineCost: row.unitCost != null ? row.unitCost * qty : 0,
          };
          return next;
        }
        return [...prev, newLine];
      });
      setLastAddedSku(product.sku);
      setSearchTerm('');
      setShowDropdown(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, inventory, purchaseOrders, additionalCosts]
  );

  const processBarcodeScan = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const matched = findInventoryItemByBarcodeScan(inventory, code);
      if (!matched) {
        showAlert(t('sales.barcodeNotInSystem'), t('autoconsumo.alertTitle'));
        return;
      }
      const product = filterSellableInventory(inventory).find((p) => p.sku === matched.sku);
      if (!product) {
        showAlert(t('sales.barcodeNoStock'), t('autoconsumo.alertTitle'));
        return;
      }
      addProduct(product);
    },
    [inventory, t, addProduct]
  );

  useBarcodeScanner({
    enabled: itemEntryMode === 'barcode' && !alertDialog.open && !isSubmitting,
    onScan: processBarcodeScan,
    ignoreFormFields: true,
    minLength: 3,
    shouldIgnore: () => alertDialog.open || itemEntryMode !== 'barcode' || isSubmitting,
  });

  useEffect(() => {
    if (!lastAddedSku) return;
    lastAddedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [lastAddedSku, lines]);

  const handleQuantityChange = (index: number, quantity: number) => {
    const updated = [...lines];
    const item = updated[index];
    const valid = Math.max(1, Math.min(quantity, item.maxQuantity || quantity));
    updated[index] = {
      ...item,
      quantity: valid,
      lineCost: item.unitCost != null ? item.unitCost * valid : 0,
    };
    setLines(updated);
    if (quantity > item.maxQuantity) {
      showAlert(`${t('sales.cannotExceedStock')} ${item.maxQuantity}`, t('autoconsumo.alertTitle'));
    }
  };

  const removeItem = (index: number) => {
    const removed = lines[index];
    setLines(lines.filter((_, i) => i !== index));
    if (removed && lastAddedSku === removed.sku) setLastAddedSku(null);
  };

  const totalCost = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.lineCost) || 0), 0),
    [lines]
  );
  const totalUnits = useMemo(() => lines.reduce((sum, l) => sum + l.quantity, 0), [lines]);

  const submit = async () => {
    if (isSubmittingRef.current) return;
    if (!recipient.trim()) {
      showAlert(t('autoconsumo.pleaseEnterRecipient'), t('autoconsumo.validation'));
      return;
    }
    if (lines.length === 0) {
      showAlert(t('autoconsumo.pleaseAddProducts'), t('autoconsumo.validation'));
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const items: AutoconsumoLine[] = lines.map(
        ({ sku, description, quantity, unitCost, lineCost, line, category }) => ({
          sku,
          description,
          quantity,
          unitCost,
          lineCost,
          line,
          category,
        })
      );

      const created = await createAutoconsumoNote({
        noteNumber: 'TEMP',
        recipient: recipient.trim(),
        items,
        totalCost,
        date: new Date(`${noteDate}T12:00:00`),
        notes: notes.trim() || undefined,
        createdBy: user?.name || user?.email || '',
      });

      try {
        await deductStockForAutoconsumo(items, inventory, updateInventoryItem);
      } catch (stockErr) {
        await deleteAutoconsumoNote(created.id);
        throw stockErr;
      }

      showAlert(t('autoconsumo.noteCreated'), t('common.success'));
      setLines([]);
      setRecipient('');
      setNotes('');
      setNoteDate(new Date().toISOString().split('T')[0]);
      setItemEntryMode(null);
      setLastAddedSku(null);
    } catch (error) {
      console.error('Error creating autoconsumo:', error);
      const msg = error instanceof Error ? error.message : t('autoconsumo.errorCreating');
      showAlert(msg, 'Error');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const filteredInventory = getFilteredInventory();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">{t('autoconsumo.title')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t('autoconsumo.subtitle')}</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900">{t('autoconsumo.noteInfo')}</h3>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">{t('autoconsumo.date')}:</label>
            <DateInput
              value={noteDate}
              onChange={setNoteDate}
              inputClassName="px-3 py-2 border border-gray-300 rounded-lg text-sm flex items-center gap-2 min-w-[10rem]"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('autoconsumo.recipient')} *
            </label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={t('autoconsumo.recipientPlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#515151]"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('autoconsumo.notes')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t('autoconsumo.notesPlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#515151]"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">{t('autoconsumo.items')}</h3>

        <div className="mb-5">
          <p className="mb-2 text-sm font-medium text-gray-700">{t('sales.entryModeLabel')}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setItemEntryMode('barcode');
                setSearchTerm('');
                setShowDropdown(false);
              }}
              className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                itemEntryMode === 'barcode'
                  ? 'border-[#515151] bg-[#515151]/5 ring-1 ring-[#515151]/25'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="text-sm font-semibold text-gray-900">{t('sales.entryModeBarcode')}</div>
              <div className="mt-0.5 text-xs text-gray-500">{t('sales.entryModeBarcodeDesc')}</div>
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
              <div className="text-sm font-semibold text-gray-900">{t('sales.entryModeManual')}</div>
              <div className="mt-0.5 text-xs text-gray-500">{t('sales.entryModeManualDesc')}</div>
            </button>
          </div>
        </div>

        {itemEntryMode === 'barcode' && (
          <div className="mb-4 rounded-lg border border-dashed border-[#515151]/30 bg-[#515151]/[0.04] px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              {t('sales.scannerActive')}
            </div>
            <p className="mt-1 text-xs text-gray-500">{t('sales.scannerActiveHint')}</p>
          </div>
        )}

        {itemEntryMode === 'manual' && (
          <div className="relative mb-4" ref={dropdownRef}>
            <label className="mb-2 block text-sm font-medium text-gray-700">{t('sales.searchSku')}</label>
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
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#515151]"
              autoComplete="off"
            />
            {showDropdown && filteredInventory.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg">
                {filteredInventory.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => addProduct(product)}
                    className="cursor-pointer border-b border-gray-100 px-4 py-2 last:border-b-0 hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-3">
                      <ProductThumb imageUrl={product.images?.[0]} alt={product.name || product.sku} />
                      <div className="min-w-0">
                        <div className="font-mono text-sm font-semibold text-[#515151]">{product.sku}</div>
                        <div className="text-sm text-gray-600">{product.name}</div>
                        <div className="text-xs text-gray-500">
                          {t('sales.available')}: {getAvailableStock(product)} | {product.category} -{' '}
                          {product.line}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!itemEntryMode && (
          <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
            {t('sales.entryModeChooseFirst')}
          </div>
        )}

        {itemEntryMode &&
          (lines.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5">
                <span className="text-sm text-gray-600">{t('autoconsumo.unitsSelected')}</span>
                <span className="text-sm font-semibold tabular-nums text-gray-900">
                  {totalUnits}{' '}
                  {totalUnits === 1 ? t('sales.skuSingular') : t('sales.skuPlural')} · {lines.length}{' '}
                  SKU
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('sales.photo')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('sales.sku')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('sales.description')}
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('sales.quantity')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('autoconsumo.unitCost')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('autoconsumo.lineCost')}
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('sales.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {lines.map((item, index) => {
                      const invItem = inventory.find((i) => i.sku === item.sku);
                      const imageUrl = item.imageUrl || invItem?.images?.[0];
                      const isLast = lastAddedSku === item.sku;
                      return (
                        <tr
                          key={item.sku}
                          ref={isLast ? lastAddedRowRef : undefined}
                          className={
                            isLast
                              ? 'bg-[#515151]/[0.06] ring-1 ring-inset ring-[#515151]/20'
                              : 'hover:bg-gray-50'
                          }
                        >
                          <td className="whitespace-nowrap px-4 py-3">
                            <ProductThumb imageUrl={imageUrl} alt={item.description || item.sku} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-sm font-medium text-gray-900">
                            {item.sku}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <input
                                type="number"
                                min={1}
                                max={item.maxQuantity || undefined}
                                value={item.quantity}
                                onChange={(e) =>
                                  handleQuantityChange(index, parseInt(e.target.value, 10) || 1)
                                }
                                className="w-20 rounded border border-gray-300 px-2 py-1 text-center"
                              />
                              <div className="text-xs text-gray-500">
                                {t('sales.max')}: {item.availableStock}
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-gray-700">
                            {item.unitCost != null ? `$${item.unitCost.toFixed(2)}` : '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold tabular-nums text-gray-900">
                            ${item.lineCost.toFixed(2)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="text-sm font-medium text-red-600 hover:text-red-700"
                            >
                              {t('sales.remove')}
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
            <div className="py-12 text-center text-gray-500">
              {itemEntryMode === 'barcode' ? t('sales.noItemsScannedYet') : t('sales.noItemsAdded')}
            </div>
          ))}
      </div>

      {lines.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">{t('autoconsumo.summary')}</h3>
          <div className="mb-4 space-y-2">
            <div className="flex justify-between text-gray-700">
              <span>{t('autoconsumo.totalUnits')}:</span>
              <span className="font-semibold tabular-nums">{totalUnits}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-2 text-gray-900">
              <span className="font-medium">{t('autoconsumo.totalExpense')}:</span>
              <span className="text-lg font-bold tabular-nums">${totalCost.toFixed(2)}</span>
            </div>
            <p className="text-xs text-gray-500">{t('autoconsumo.expenseHint')}</p>
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={isSubmitting}
            className="w-full rounded-lg bg-[#515151] px-4 py-3 font-medium text-white transition-colors hover:bg-[#000000] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? t('common.loading') : t('autoconsumo.createNote')}
          </button>
        </div>
      )}

      <AlertDialog
        open={alertDialog.open}
        title={alertDialog.title}
        message={alertDialog.message}
        onClose={() => setAlertDialog({ open: false, message: '' })}
      />
    </div>
  );
}
