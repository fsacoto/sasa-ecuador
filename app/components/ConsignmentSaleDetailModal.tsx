'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Consignment,
  ConsignmentItem,
  ConsignmentSaleLine,
  ConsignmentSaleRecord,
  InventoryItem,
} from '../types';
import { useTranslation } from '../context/TranslationContext';
import { useDarkMode } from '../hooks/useDarkMode';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { findInventoryItemByBarcodeScan } from '../utils/barcodeGenerator';
import { normalizeSalePrice } from '../utils/salePrice';
import { formatDateDMY } from '../utils/formatDate';
import {
  availableForSaleEdit,
  roundMoney2,
  saleLinesQtyByItemIndex,
} from '../utils/consignmentSales';
import ModalPortal from './ui/ModalPortal';

interface ConsignmentSaleDetailModalProps {
  open: boolean;
  sale: ConsignmentSaleRecord;
  consignment: Consignment;
  inventory: InventoryItem[];
  onClose: () => void;
  onSave: (lines: ConsignmentSaleLine[]) => Promise<void>;
  onReverse: () => void;
}

const qtyInputClass =
  'w-24 rounded-lg border border-gray-300 px-2 py-2 text-center text-sm tabular-nums focus:border-[#515151] focus:outline-none focus:ring-2 focus:ring-[#515151]/25';

const priceInputClass =
  'w-28 rounded-lg border border-gray-300 px-2 py-2 text-center text-sm tabular-nums focus:border-[#515151] focus:outline-none focus:ring-2 focus:ring-[#515151]/25';

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#515151] focus:outline-none focus:ring-2 focus:ring-[#515151]/25';

type DraftLine = {
  itemIndex: number;
  sku: string;
  description: string;
  quantity: string;
  unitPrice: string;
  line?: string;
  category?: string;
};

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

function formatTemplate(template: string, vars: Record<string, string>) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

function lineFromItem(item: ConsignmentItem, itemIndex: number, quantity: number, unitPrice: number): DraftLine {
  return {
    itemIndex,
    sku: item.sku,
    description: item.description,
    quantity: String(quantity),
    unitPrice: unitPrice > 0 ? unitPrice.toFixed(2) : '',
    ...(item.line ? { line: item.line } : {}),
    ...(item.category ? { category: item.category } : {}),
  };
}

function parseQty(raw: string): number {
  return Math.max(0, parseInt(raw || '0', 10) || 0);
}

function parsePrice(raw: string): number {
  return parseFloat((raw || '').trim().replace(',', '.'));
}

function draftsToSaleLines(drafts: DraftLine[]): ConsignmentSaleLine[] {
  return drafts
    .map((d) => {
      const quantity = parseQty(d.quantity);
      const unitPrice = roundMoney2(parsePrice(d.unitPrice));
      return {
        itemIndex: d.itemIndex,
        sku: d.sku,
        description: d.description,
        quantity,
        unitPrice,
        totalPrice: roundMoney2(quantity * unitPrice),
        ...(d.line ? { line: d.line } : {}),
        ...(d.category ? { category: d.category } : {}),
      };
    })
    .filter((line) => line.quantity > 0);
}

function draftsMatchSale(drafts: DraftLine[], sale: ConsignmentSaleRecord): boolean {
  const next = draftsToSaleLines(drafts);
  if (next.length !== sale.lines.length) return false;
  const byIndex = new Map(sale.lines.map((l) => [l.itemIndex, l]));
  for (const line of next) {
    const orig = byIndex.get(line.itemIndex);
    if (!orig) return false;
    if (orig.sku.trim() !== line.sku.trim()) return false;
    if (orig.quantity !== line.quantity) return false;
    if (roundMoney2(orig.unitPrice) !== roundMoney2(line.unitPrice)) return false;
  }
  return true;
}

export default function ConsignmentSaleDetailModal({
  open,
  sale,
  consignment,
  inventory,
  onClose,
  onSave,
  onReverse,
}: ConsignmentSaleDetailModalProps) {
  const { t } = useTranslation();
  const darkMode = useDarkMode();
  const [drafts, setDrafts] = useState<DraftLine[]>([]);
  const [search, setSearch] = useState('');
  const [scannerOn, setScannerOn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastAddedIndex, setLastAddedIndex] = useState<number | null>(null);
  const lastAddedRowRef = useRef<HTMLDivElement>(null);
  const draftsRef = useRef<DraftLine[]>([]);
  const originalQtyByIndex = useMemo(() => saleLinesQtyByItemIndex(sale.lines), [sale.lines]);

  useEffect(() => {
    if (!open) return;
    setDrafts(
      sale.lines.map((line) => ({
        itemIndex: line.itemIndex,
        sku: line.sku,
        description: line.description,
        quantity: String(line.quantity),
        unitPrice: roundMoney2(line.unitPrice).toFixed(2),
        ...(line.line ? { line: line.line } : {}),
        ...(line.category ? { category: line.category } : {}),
      }))
    );
    setSearch('');
    setScannerOn(false);
    setLastAddedIndex(null);
  }, [open, sale]);

  draftsRef.current = drafts;

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

  useEffect(() => {
    if (lastAddedIndex == null) return;
    lastAddedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [lastAddedIndex, drafts]);

  const maxForIndex = useCallback(
    (itemIndex: number) => {
      const item = consignment.items[itemIndex];
      if (!item) return 0;
      return availableForSaleEdit(item, originalQtyByIndex.get(itemIndex) || 0);
    },
    [consignment.items, originalQtyByIndex]
  );

  const imageForSku = useCallback(
    (sku: string) => inventory.find((inv) => inv.sku === sku)?.images?.[0],
    [inventory]
  );

  const showValidation = (message: string) => {
    if (typeof window !== 'undefined') window.alert(message);
  };

  const addOrIncrement = useCallback(
    (itemIndex: number, increment = 1, opts?: { silent?: boolean }) => {
      const item = consignment.items[itemIndex];
      if (!item) return false;
      const max = maxForIndex(itemIndex);
      const prev = draftsRef.current;
      const existing = prev.find((d) => d.itemIndex === itemIndex);
      const current = existing ? parseQty(existing.quantity) : 0;
      if (max <= 0 || current + increment > max) {
        if (!opts?.silent) {
          showValidation(
            max <= 0
              ? t('consignments.saleDetailNoAvailable')
              : t('consignments.saleExceedsAvailable')
          );
        }
        return false;
      }
      const next = existing
        ? prev.map((d) =>
            d.itemIndex === itemIndex ? { ...d, quantity: String(current + increment) } : d
          )
        : [
            ...prev,
            lineFromItem(
              item,
              itemIndex,
              increment,
              normalizeSalePrice(item.unitPrice) ??
                normalizeSalePrice(inventory.find((inv) => inv.sku === item.sku)?.salePrice) ??
                0
            ),
          ];
      draftsRef.current = next;
      setDrafts(next);
      setLastAddedIndex(itemIndex);
      return true;
    },
    [consignment.items, inventory, maxForIndex, t]
  );

  const processBarcodeScan = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const matched = findInventoryItemByBarcodeScan(inventory, code);
      const sku = (matched?.sku || code).trim().toLowerCase();
      const candidates = consignment.items
        .map((item, index) => ({ item, index }))
        .filter((r) => r.item.sku.trim().toLowerCase() === sku);
      if (candidates.length === 0) {
        showValidation(t('consignments.saleBarcodeNotOnConsignment'));
        return;
      }
      for (const r of candidates) {
        if (addOrIncrement(r.index, 1, { silent: true })) return;
      }
      showValidation(t('consignments.saleDetailNoAvailable'));
    },
    [addOrIncrement, consignment.items, inventory, t]
  );

  useBarcodeScanner({
    enabled: open && scannerOn && !submitting,
    onScan: processBarcodeScan,
    ignoreFormFields: true,
    minLength: 3,
    shouldIgnore: () => !open || !scannerOn || submitting,
  });

  const parsedLines = useMemo(() => draftsToSaleLines(drafts), [drafts]);
  const dirty = useMemo(() => !draftsMatchSale(drafts, sale), [drafts, sale]);
  const units = parsedLines.reduce((sum, l) => sum + l.quantity, 0);
  const total = roundMoney2(parsedLines.reduce((sum, l) => sum + l.totalPrice, 0));

  const addCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return consignment.items
      .map((item, index) => {
        const current = drafts.find((d) => d.itemIndex === index);
        const used = current ? parseQty(current.quantity) : 0;
        const max = maxForIndex(index);
        return { item, index, used, max, remaining: Math.max(0, max - used) };
      })
      .filter(
        (r) =>
          r.remaining > 0 &&
          (r.item.sku.toLowerCase().includes(q) ||
            r.item.description.toLowerCase().includes(q))
      );
  }, [consignment.items, drafts, maxForIndex, search]);

  const handleSave = async () => {
    if (parsedLines.length === 0) {
      showValidation(t('consignments.saleDetailEmptyLines'));
      return;
    }
    for (const line of parsedLines) {
      const max = maxForIndex(line.itemIndex);
      if (line.quantity > max) {
        showValidation(t('consignments.saleExceedsAvailable'));
        return;
      }
      if (!Number.isFinite(line.unitPrice) || line.unitPrice <= 0) {
        showValidation(t('consignments.saleUnitPriceRequired'));
        return;
      }
    }
    setSubmitting(true);
    try {
      await onSave(parsedLines);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('consignments.saleDetailError');
      showValidation(msg || t('consignments.saleDetailError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const cancelBtnClass = darkMode
    ? 'rounded-lg border border-white/20 bg-transparent px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-white/10 disabled:opacity-50'
    : 'rounded-lg border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50';

  return (
    <ModalPortal>
      <div
        className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consignment-sale-detail-title"
        onClick={onClose}
      >
        <div
          className="sasa-modal-panel flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 border-b border-gray-200 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 id="consignment-sale-detail-title" className="text-xl font-semibold text-gray-900">
                  {t('consignments.saleDetailTitle')}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  <span className="font-mono font-medium text-gray-700">{consignment.consignmentId}</span>
                  <span className="mx-2 text-gray-400">·</span>
                  {formatDateDMY(sale.createdAt)}
                  <span className="mx-2 text-gray-400">·</span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      sale.invoiced
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {sale.invoiced
                      ? t('consignments.saleStatusInvoiced')
                      : t('consignments.saleStatusPending')}
                  </span>
                </p>
                <p className="mt-1 text-sm text-gray-500">{t('consignments.saleDetailSubtitle')}</p>
                {sale.createdBy ? (
                  <p className="mt-1 text-xs text-gray-400">
                    {formatTemplate(t('consignments.saleDetailCreatedBy'), { name: sale.createdBy })}
                  </p>
                ) : null}
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

            {sale.invoiced ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t('consignments.saleDetailInvoicedHint')}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5">
              <span className="text-sm text-gray-600">
                {units}{' '}
                {units === 1 ? t('consignments.unitSingular') : t('consignments.unitPlural')}
                <span className="mx-1.5 text-gray-300">·</span>
                {parsedLines.length}{' '}
                {parsedLines.length === 1
                  ? t('consignments.skuSingular')
                  : t('consignments.skuPlural')}
              </span>
              <span className="text-sm font-semibold tabular-nums text-gray-900">
                ${total.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {drafts.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                {t('consignments.saleDetailEmptyLines')}
              </p>
            ) : (
              <div className="space-y-3">
                {drafts.map((draft) => {
                  const qty = parseQty(draft.quantity);
                  const unit = parsePrice(draft.unitPrice);
                  const lineTotal =
                    qty > 0 && Number.isFinite(unit) && unit > 0 ? roundMoney2(qty * unit) : null;
                  const max = maxForIndex(draft.itemIndex);
                  const isLast = lastAddedIndex === draft.itemIndex;
                  return (
                    <div
                      key={draft.itemIndex}
                      ref={isLast ? lastAddedRowRef : undefined}
                      className={`sasa-return-line-card p-4 sm:p-5 transition-colors ${
                        isLast ? 'ring-1 ring-inset ring-[#515151]/25 bg-[#515151]/[0.04]' : ''
                      }`}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 flex-1 gap-3">
                          <SaleProductThumb
                            imageUrl={imageForSku(draft.sku)}
                            alt={draft.description || draft.sku}
                          />
                          <div className="min-w-0">
                            <div className="font-mono text-sm font-semibold text-[#515151]">
                              {draft.sku}
                            </div>
                            <div className="mt-0.5 text-sm text-gray-800">{draft.description}</div>
                            <span className="mt-2 inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                              {formatTemplate(t('consignments.saleDetailMax'), { max: String(max) })}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-end gap-3 sm:justify-end">
                          <div>
                            <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                              {t('consignments.saleDetailQty')}
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={max}
                              value={draft.quantity}
                              onChange={(e) =>
                                setDrafts((prev) =>
                                  prev.map((d) =>
                                    d.itemIndex === draft.itemIndex
                                      ? { ...d, quantity: e.target.value }
                                      : d
                                  )
                                )
                              }
                              className={`${qtyInputClass} mt-1`}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                              {t('consignments.saleUnitPriceUsd')}
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={draft.unitPrice}
                              onChange={(e) =>
                                setDrafts((prev) =>
                                  prev.map((d) =>
                                    d.itemIndex === draft.itemIndex
                                      ? { ...d, unitPrice: e.target.value }
                                      : d
                                  )
                                )
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
                          <button
                            type="button"
                            onClick={() =>
                              setDrafts((prev) => prev.filter((d) => d.itemIndex !== draft.itemIndex))
                            }
                            disabled={submitting}
                            className="mb-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            {t('consignments.saleDetailRemoveLine')}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-6 rounded-xl border border-gray-200 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {t('consignments.saleDetailAddItem')}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">{t('consignments.saleDetailAddItemHint')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setScannerOn((v) => !v)}
                  disabled={submitting}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                    scannerOn
                      ? 'border-[#515151] bg-[#515151]/5 text-gray-900'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {t('consignments.entryModeBarcode')}
                </button>
              </div>
              {scannerOn ? (
                <div className="mb-3 rounded-lg border border-dashed border-[#515151]/30 bg-[#515151]/[0.04] px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                    {t('consignments.scannerActive')}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{t('consignments.saleScannerActiveHint')}</p>
                </div>
              ) : null}
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('consignments.saleDetailAddItemSearch')}
                disabled={submitting}
                className={inputClass}
                autoComplete="off"
              />
              {addCandidates.length > 0 ? (
                <ul className="mt-2 max-h-48 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {addCandidates.slice(0, 12).map(({ item, index, remaining }) => (
                    <li key={index}>
                      <button
                        type="button"
                        onClick={() => {
                          addOrIncrement(index, 1);
                          setSearch('');
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
                      >
                        <SaleProductThumb
                          imageUrl={imageForSku(item.sku)}
                          alt={item.description || item.sku}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-sm font-medium text-[#515151]">
                            {item.sku}
                          </span>
                          <span className="block truncate text-xs text-gray-600">{item.description}</span>
                        </span>
                        <span className="text-xs text-gray-500">
                          {t('consignments.available')}: {remaining}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : search.trim() ? (
                <p className="mt-2 text-xs text-gray-500">{t('consignments.saleModalNoMatch')}</p>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-3 border-t border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={onReverse}
              disabled={submitting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {t('consignments.reverseSale')}
            </button>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} disabled={submitting} className={cancelBtnClass}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={submitting || !dirty || units === 0}
                className="sasa-btn-primary rounded-lg px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {submitting ? t('consignments.saleDetailSaving') : t('consignments.saleDetailSave')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
