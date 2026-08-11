'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Consignment, ConsignmentItem, InventoryItem } from '../types';
import { useTranslation } from '../context/TranslationContext';
import { useDarkMode } from '../hooks/useDarkMode';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { findInventoryItemByBarcodeScan } from '../utils/barcodeGenerator';
import { normalizeSalePrice } from '../utils/salePrice';
import ModalPortal from './ui/ModalPortal';

export interface ConsignmentSaleSubmitParams {
  salesQuantities: Record<number, number>;
  saleUnitPrices: Record<number, string>;
}

export interface ConsignmentSaleModalProps {
  open: boolean;
  consignment: Consignment;
  inventory: InventoryItem[];
  onClose: () => void;
  onSubmit: (params: ConsignmentSaleSubmitParams) => Promise<void>;
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#515151] focus:outline-none focus:ring-2 focus:ring-[#515151]/25';

const qtyInputClass =
  'w-24 rounded-lg border border-gray-300 px-2 py-2 text-center text-sm tabular-nums focus:border-[#515151] focus:outline-none focus:ring-2 focus:ring-[#515151]/25';

const priceInputClass =
  'w-28 rounded-lg border border-gray-300 px-2 py-2 text-center text-sm tabular-nums focus:border-[#515151] focus:outline-none focus:ring-2 focus:ring-[#515151]/25';

function availableOnLine(c: ConsignmentItem): number {
  return c.quantityDelivered - c.quantitySold - c.quantityReturned;
}

function roundMoney2(n: number) {
  return Math.round(n * 100) / 100;
}

function SaleProductThumb({ imageUrl, alt }: { imageUrl?: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(imageUrl) && !broken;

  return showImage ? (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
      <img
        src={imageUrl}
        alt={alt}
        className="h-full w-full object-cover object-center"
        onError={() => setBroken(true)}
      />
    </div>
  ) : (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100"
      title="Sin foto"
      aria-label="Sin foto"
    >
      <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
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

export default function ConsignmentSaleModal({
  open,
  consignment,
  inventory,
  onClose,
  onSubmit,
}: ConsignmentSaleModalProps) {
  const { t } = useTranslation();
  const darkMode = useDarkMode();
  const [entryMode, setEntryMode] = useState<'barcode' | 'manual' | null>(null);
  const [search, setSearch] = useState('');
  const [saleQty, setSaleQty] = useState<Record<number, string>>({});
  const [unitPrices, setUnitPrices] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [lastScannedIndex, setLastScannedIndex] = useState<number | null>(null);
  const [scanOrder, setScanOrder] = useState<number[]>([]);
  const lastScannedRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setEntryMode(null);
    setSearch('');
    setSaleQty({});
    const prices: Record<number, string> = {};
    consignment.items.forEach((item, index) => {
      const p = normalizeSalePrice(item.unitPrice);
      if (p !== undefined) prices[index] = p.toFixed(2);
    });
    setUnitPrices(prices);
    setLastScannedIndex(null);
    setScanOrder([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when modal opens / consignment changes
  }, [open, consignment.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  const rows = useMemo(() => {
    return consignment.items.map((item, index) => ({
      item,
      index,
      available: availableOnLine(item),
      imageUrl: inventory.find((inv) => inv.sku === item.sku)?.images?.[0],
    }));
  }, [consignment.items, inventory]);

  const totalUnitsToSell = useMemo(() => {
    return Object.values(saleQty).reduce((sum, raw) => {
      const n = Math.max(0, parseInt(raw || '0', 10) || 0);
      return sum + n;
    }, 0);
  }, [saleQty]);

  const linesWithSales = useMemo(() => {
    return Object.entries(saleQty).filter(([, raw]) => (parseInt(raw || '0', 10) || 0) > 0)
      .length;
  }, [saleQty]);

  const estimatedTotal = useMemo(() => {
    return rows.reduce((sum, { index }) => {
      const qty = Math.max(0, parseInt(saleQty[index] || '0', 10) || 0);
      if (qty <= 0) return sum;
      const unit = parseFloat((unitPrices[index] ?? '').trim().replace(',', '.'));
      if (!Number.isFinite(unit) || unit <= 0) return sum;
      return sum + roundMoney2(qty * unit);
    }, 0);
  }, [rows, saleQty, unitPrices]);

  const displayRows = useMemo(() => {
    const byIndex = new Map(rows.map((r) => [r.index, r]));
    const scannedSet = new Set(scanOrder);
    const unscanned = rows.filter((r) => !scannedSet.has(r.index));
    const scanned = scanOrder
      .map((idx) => byIndex.get(idx))
      .filter((r): r is (typeof rows)[number] => Boolean(r));
    return [...unscanned, ...scanned];
  }, [rows, scanOrder]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || entryMode === 'barcode') return displayRows;
    return displayRows.filter(
      ({ item }) =>
        item.sku.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
    );
  }, [displayRows, search, entryMode]);

  useEffect(() => {
    if (lastScannedIndex == null) return;
    lastScannedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [lastScannedIndex, saleQty]);

  const showValidation = (message: string) => {
    if (typeof window !== 'undefined') window.alert(message);
  };

  const processBarcodeScan = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;

      const matched = findInventoryItemByBarcodeScan(inventory, code);
      const sku = (matched?.sku || code).trim();
      const skuLower = sku.toLowerCase();

      const onConsignment = rows.filter(
        (r) => r.item.sku.trim().toLowerCase() === skuLower
      );
      if (onConsignment.length === 0) {
        showValidation(
          t('consignments.saleBarcodeNotOnConsignment') ||
            'Ese código no corresponde a un artículo de esta consignación.'
        );
        return;
      }

      const withStock = onConsignment.filter((r) => r.available > 0);
      if (withStock.length === 0) {
        showValidation(
          t('consignments.saleBarcodeNothingLeft') ||
            'Ese SKU ya no tiene unidades disponibles para vender en esta consignación.'
        );
        return;
      }

      setSaleQty((prev) => {
        const target =
          withStock.find((r) => {
            const current = Math.max(0, parseInt(prev[r.index] || '0', 10) || 0);
            return current < r.available;
          }) || withStock[0];

        const current = Math.max(0, parseInt(prev[target.index] || '0', 10) || 0);
        if (current + 1 > target.available) {
          queueMicrotask(() =>
            showValidation(
              t('consignments.saleExceedsAvailable') ||
                'La cantidad a vender no puede superar lo disponible en esa línea.'
            )
          );
          return prev;
        }
        queueMicrotask(() => {
          setLastScannedIndex(target.index);
          setScanOrder((order) => {
            const without = order.filter((i) => i !== target.index);
            return [...without, target.index];
          });
        });
        return { ...prev, [target.index]: String(current + 1) };
      });
    },
    [inventory, rows, t]
  );

  useBarcodeScanner({
    enabled: open && entryMode === 'barcode' && !submitting,
    onScan: processBarcodeScan,
    ignoreFormFields: true,
    minLength: 3,
    shouldIgnore: () => !open || entryMode !== 'barcode' || submitting,
  });

  const handleConfirm = async () => {
    const parsedQty: Record<number, number> = {};
    let anySale = false;

    for (const { index, available, item } of rows) {
      const q = Math.max(0, parseInt(saleQty[index] || '0', 10) || 0);
      if (q > available) {
        showValidation(
          t('consignments.saleExceedsAvailable') ||
            `La cantidad a vender no puede superar lo disponible en la línea ${index + 1}.`
        );
        return;
      }
      if (q > 0) {
        anySale = true;
        const raw = (unitPrices[index] ?? '').trim();
        const unitPrice = parseFloat(raw.replace(',', '.'));
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
          showValidation(
            t('consignments.saleUnitPriceRequired') ||
              `Indique un precio unitario válido (> 0) para ${item.sku}.`
          );
          return;
        }
      }
      parsedQty[index] = q;
    }

    if (!anySale) {
      showValidation(
        t('consignments.pleaseEnterQuantitiesToSell') || 'Indique al menos una cantidad a vender.'
      );
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        salesQuantities: parsedQty,
        saleUnitPrices: unitPrices,
      });
      onClose();
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : 'Error';
      showValidation(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const cancelBtnClass = darkMode
    ? 'rounded-lg border border-white/20 bg-transparent px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-white/10 disabled:opacity-50'
    : 'rounded-lg border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50';

  const formatTemplate = (template: string, vars: Record<string, string>) => {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  };

  return (
    <ModalPortal>
      <div
        className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consignment-sale-modal-title"
        onClick={onClose}
      >
        <div
          className="sasa-modal-panel flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 border-b border-gray-200 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 id="consignment-sale-modal-title" className="text-xl font-semibold text-gray-900">
                  {t('consignments.saleModalTitle')}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  <span className="font-mono font-medium text-gray-700">{consignment.consignmentId}</span>
                  <span className="mx-2 text-gray-400">·</span>
                  {t('consignments.saleModalSubtitle')}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                aria-label={t('common.close')}
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-gray-700">
                {t('consignments.entryModeLabel')}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setEntryMode('barcode');
                    setSearch('');
                  }}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                    entryMode === 'barcode'
                      ? 'border-[#515151] bg-[#515151]/5 ring-1 ring-[#515151]/25'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-sm font-semibold text-gray-900">
                    {t('consignments.entryModeBarcode')}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {t('consignments.saleEntryModeBarcodeDesc')}
                  </div>
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setEntryMode('manual')}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                    entryMode === 'manual'
                      ? 'border-[#515151] bg-[#515151]/5 ring-1 ring-[#515151]/25'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-sm font-semibold text-gray-900">
                    {t('consignments.entryModeManual')}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {t('consignments.saleEntryModeManualDesc')}
                  </div>
                </button>
              </div>
            </div>

            {entryMode === 'barcode' && (
              <div className="mt-4 rounded-lg border border-dashed border-[#515151]/30 bg-[#515151]/[0.04] px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                    aria-hidden
                  />
                  {t('consignments.scannerActive')}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {t('consignments.saleScannerActiveHint')}
                </p>
              </div>
            )}

            {entryMode === 'manual' && (
              <div className="mt-4">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('consignments.saleModalSearch')}
                  className={inputClass}
                />
              </div>
            )}

            {entryMode && totalUnitsToSell > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5">
                <span className="text-sm text-gray-600">
                  {t('consignments.saleUnitsScanned')}
                </span>
                <span className="text-sm font-semibold tabular-nums text-gray-900">
                  {formatTemplate(t('consignments.unitsScannedCount'), {
                    count: String(totalUnitsToSell),
                  })}
                  <span className="ml-2 font-normal text-gray-500">
                    ({linesWithSales}{' '}
                    {linesWithSales === 1
                      ? t('consignments.skuSingular')
                      : t('consignments.skuPlural')}
                    )
                  </span>
                  {estimatedTotal > 0 && (
                    <span className="ml-3 tabular-nums text-gray-700">
                      · ${estimatedTotal.toFixed(2)}
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {!entryMode ? (
              <p className="py-12 text-center text-sm text-gray-500">
                {t('consignments.entryModeChooseFirst')}
              </p>
            ) : filteredRows.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-500">
                {t('consignments.saleModalNoMatch')}
              </p>
            ) : (
              <div className="space-y-3">
                {filteredRows.map(({ item, index, available, imageUrl }) => {
                  if (available <= 0) {
                    return (
                      <div
                        key={index}
                        className="sasa-return-line-muted flex items-center gap-3 px-4 py-3 text-sm text-gray-500"
                      >
                        <SaleProductThumb imageUrl={imageUrl} alt={item.description || item.sku} />
                        <div className="min-w-0">
                          <span className="font-mono font-medium text-gray-700">{item.sku}</span>
                          <span className="mx-2 text-gray-400">—</span>
                          {item.description}
                          <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">
                            {t('consignments.nothingToSell')}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  const q = parseInt(saleQty[index] || '0', 10) || 0;
                  const unitRaw = (unitPrices[index] ?? '').trim().replace(',', '.');
                  const unit = parseFloat(unitRaw);
                  const lineTotal =
                    q > 0 && Number.isFinite(unit) && unit > 0
                      ? roundMoney2(q * unit)
                      : null;
                  const isLastScanned = lastScannedIndex === index;

                  return (
                    <div
                      key={index}
                      ref={isLastScanned ? lastScannedRowRef : undefined}
                      className={`sasa-return-line-card p-4 sm:p-5 transition-colors ${
                        isLastScanned
                          ? 'ring-1 ring-inset ring-[#515151]/25 bg-[#515151]/[0.04]'
                          : ''
                      }`}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 flex-1 gap-3">
                          <SaleProductThumb
                            imageUrl={imageUrl}
                            alt={item.description || item.sku}
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-mono text-sm font-semibold text-[#515151]">
                                {item.sku}
                              </div>
                              {isLastScanned && (
                                <span className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#515151]/80 bg-[#515151]/10">
                                  {t('consignments.lastAdded')}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-sm text-gray-800">{item.description}</div>
                            <span
                              className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                darkMode
                                  ? 'border border-white/15 bg-white/10 text-gray-300'
                                  : 'border border-gray-200 bg-gray-50 text-gray-600'
                              }`}
                            >
                              {t('consignments.available')}: {available}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-end gap-3 sm:justify-end">
                          <div>
                            <label
                              htmlFor={`sale-qty-${index}`}
                              className="block text-xs font-medium uppercase tracking-wide text-gray-500"
                            >
                              {t('consignments.qtyToSell')}
                            </label>
                            <input
                              id={`sale-qty-${index}`}
                              type="number"
                              min={0}
                              max={available}
                              value={saleQty[index] ?? ''}
                              onChange={(e) =>
                                setSaleQty((prev) => ({ ...prev, [index]: e.target.value }))
                              }
                              className={`${qtyInputClass} mt-1`}
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`sale-price-${index}`}
                              className="block text-xs font-medium uppercase tracking-wide text-gray-500"
                            >
                              {t('consignments.saleUnitPriceUsd')}
                            </label>
                            <input
                              id={`sale-price-${index}`}
                              type="text"
                              inputMode="decimal"
                              placeholder="0.00"
                              value={unitPrices[index] ?? ''}
                              onChange={(e) =>
                                setUnitPrices((prev) => ({ ...prev, [index]: e.target.value }))
                              }
                              className={`${priceInputClass} mt-1`}
                            />
                          </div>
                          <div className="min-w-[4.5rem] pb-2 text-right">
                            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                              {t('consignments.saleLineTotalUsd')}
                            </div>
                            <div className="mt-1 text-sm font-semibold tabular-nums text-gray-900">
                              {lineTotal != null ? `$${lineTotal.toFixed(2)}` : '—'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-3 border-t border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-gray-600">
              {estimatedTotal > 0 ? (
                <>
                  <span className="text-gray-500">{t('common.total')}: </span>
                  <span className="text-lg font-semibold tabular-nums text-gray-900">
                    ${estimatedTotal.toFixed(2)}
                  </span>
                </>
              ) : null}
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} disabled={submitting} className={cancelBtnClass}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={submitting || !entryMode || totalUnitsToSell === 0}
                className="sasa-btn-primary rounded-lg px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {submitting
                  ? t('consignments.registeringSales')
                  : t('consignments.registerSalesButton')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
