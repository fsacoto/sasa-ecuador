'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Consignment,
  ConsignmentItem,
  ConsignmentReturnIssueRef,
  InventoryItem,
} from '../types';
import { useTranslation } from '../context/TranslationContext';
import { useDarkMode } from '../hooks/useDarkMode';
import ModalPortal from './ui/ModalPortal';

export interface ConsignmentReturnModalProps {
  open: boolean;
  consignment: Consignment;
  inventory: InventoryItem[];
  onClose: () => void;
  onSubmit: (params: {
    updatedItems: ConsignmentItem[];
    inventoryPatches: Array<{
      inventoryId: string;
      ecuadorDelta: number;
      consignmentDelta: number;
      newIssueRefs: ConsignmentReturnIssueRef[];
    }>;
  }) => Promise<void>;
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#515151] focus:outline-none focus:ring-2 focus:ring-[#515151]/25';

const qtyInputClass =
  'w-24 rounded-lg border border-gray-300 px-2 py-2 text-center text-sm tabular-nums focus:border-[#515151] focus:outline-none focus:ring-2 focus:ring-[#515151]/25';

/** Remaining units still out on this consignment line. */
function availableOnLine(c: ConsignmentItem): number {
  return c.quantityDelivered - c.quantitySold - c.quantityReturned;
}

export default function ConsignmentReturnModal({
  open,
  consignment,
  inventory,
  onClose,
  onSubmit,
}: ConsignmentReturnModalProps) {
  const { t } = useTranslation();
  const darkMode = useDarkMode();
  const [search, setSearch] = useState('');
  const [returnQty, setReturnQty] = useState<Record<number, string>>({});
  const [problemQty, setProblemQty] = useState<Record<number, string>>({});
  const [comment, setComment] = useState<Record<number, string>>({});
  const [filesByIndex, setFilesByIndex] = useState<Record<number, File[]>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSearch('');
      setReturnQty({});
      setProblemQty({});
      setComment({});
      setFilesByIndex({});
    }
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
    }));
  }, [consignment.items]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      ({ item }) =>
        item.sku.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const setFileList = (index: number, list: FileList | null) => {
    if (!list?.length) {
      setFilesByIndex((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
      return;
    }
    setFilesByIndex((prev) => ({ ...prev, [index]: Array.from(list) }));
  };

  const handleConfirm = async () => {
    const parsedReturn: Record<number, number> = {};
    const parsedProblem: Record<number, number> = {};
    let anyReturn = false;

    for (const { index, available } of rows) {
      const r = Math.max(0, parseInt(returnQty[index] || '0', 10) || 0);
      const p = Math.max(0, parseInt(problemQty[index] || '0', 10) || 0);
      if (r > available) {
        showValidation(
          t('consignments.returnExceedsAvailable') ||
            `La cantidad a devolver no puede superar lo disponible en la línea ${index + 1}.`
        );
        return;
      }
      if (p > r) {
        showValidation(
          t('consignments.problemExceedsReturn') ||
            'Las unidades con problema no pueden ser mayores que las devueltas en cada línea.'
        );
        return;
      }
      if (r > 0) anyReturn = true;
      parsedReturn[index] = r;
      parsedProblem[index] = p;
    }

    if (!anyReturn) {
      showValidation(
        t('consignments.pleaseEnterQuantitiesToReturn') || 'Indique al menos una cantidad a devolver.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const { uploadMultipleFiles } = await import('../services/storageService');
      const batchTs = Date.now();

      const issuesByInventoryId = new Map<
        string,
        { ecuadorDelta: number; consignmentDelta: number; refs: ConsignmentReturnIssueRef[] }
      >();

      for (const { item, index } of rows) {
        const r = parsedReturn[index] || 0;
        if (r === 0) continue;

        const inv = inventory.find((i) => i.sku === item.sku);
        if (!inv) {
          throw new Error(`No se encontró inventario para SKU ${item.sku}`);
        }

        const p = parsedProblem[index] || 0;
        const cur = issuesByInventoryId.get(inv.id) || {
          ecuadorDelta: 0,
          consignmentDelta: 0,
          refs: [] as ConsignmentReturnIssueRef[],
        };
        cur.ecuadorDelta += r;
        cur.consignmentDelta += r;

        if (p > 0) {
          const cmt = (comment[index] || '').trim();
          const files = filesByIndex[index] || [];
          let mediaUrls: string[] = [];
          if (files.length > 0) {
            const consignmentLabel = consignment.consignmentId.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 64);
            const skuSeg = item.sku.replace(/[^a-zA-Z0-9-_]/g, '_');
            const basePath = `consignment-returns/${consignment.id}/${consignmentLabel}/${batchTs}/${skuSeg}/`;
            mediaUrls = await uploadMultipleFiles(files, basePath);
          }
          const good = r - p;
          const ref: ConsignmentReturnIssueRef = {
            consignmentFirestoreId: consignment.id,
            consignmentNumber: consignment.consignmentId,
            sku: item.sku,
            itemIndex: index,
            quantityProblem: p,
            recordedAt: new Date(),
          };
          if (good > 0) ref.quantityGoodInReturn = good;
          if (cmt) ref.comment = cmt;
          if (mediaUrls.length > 0) ref.mediaUrls = mediaUrls;
          cur.refs.push(ref);
        }
        issuesByInventoryId.set(inv.id, cur);
      }

      const updatedItems: ConsignmentItem[] = consignment.items.map((it, index) => ({
        ...it,
        quantityReturned: it.quantityReturned + (parsedReturn[index] || 0),
      }));

      const inventoryPatches = Array.from(issuesByInventoryId.entries()).map(
        ([inventoryId, v]) => ({
          inventoryId,
          ecuadorDelta: v.ecuadorDelta,
          consignmentDelta: v.consignmentDelta,
          newIssueRefs: v.refs,
        })
      );

      await onSubmit({ updatedItems, inventoryPatches });
      onClose();
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : 'Error';
      showValidation(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const showValidation = (message: string) => {
    if (typeof window !== 'undefined') window.alert(message);
  };

  if (!open) return null;

  const cancelBtnClass = darkMode
    ? 'rounded-lg border border-white/20 bg-transparent px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-white/10 disabled:opacity-50'
    : 'rounded-lg border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50';

  return (
    <ModalPortal>
      <div
        className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[80] flex items-center justify-center p-4 backdrop-blur-sm`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consignment-return-modal-title"
        onClick={onClose}
      >
        <div
          className="sasa-modal-panel flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Encabezado */}
          <div className="shrink-0 border-b border-gray-200 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 id="consignment-return-modal-title" className="text-xl font-semibold text-gray-900">
                  {t('consignments.returnModalTitle')}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  <span className="font-mono font-medium text-gray-700">{consignment.consignmentId}</span>
                  <span className="mx-2 text-gray-400">·</span>
                  {t('consignments.returnModalSubtitle')}
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
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('consignments.returnModalSearch')}
                className={inputClass}
              />
            </div>
          </div>

          {/* Líneas */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-3">
              {filteredRows.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-500">
                  {t('consignments.returnModalNoMatch')}
                </p>
              ) : (
                filteredRows.map(({ item, index, available }) => {
                  if (available <= 0) {
                    return (
                      <div key={index} className="sasa-return-line-muted px-4 py-3 text-sm text-gray-500">
                        <span className="font-mono font-medium text-gray-700">{item.sku}</span>
                        <span className="mx-2 text-gray-400">—</span>
                        {item.description}
                        <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">
                          {t('consignments.nothingToReturn')}
                        </span>
                      </div>
                    );
                  }

                  const r = parseInt(returnQty[index] || '0', 10) || 0;
                  const showProblem = r > 0;
                  const fileInputId = `return-files-${consignment.id}-${index}`;

                  return (
                    <div key={index} className="sasa-return-line-card p-4 sm:p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-sm font-semibold text-[#515151]">{item.sku}</div>
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
                        <div className="shrink-0 sm:text-right">
                          <label
                            htmlFor={`return-qty-${index}`}
                            className="block text-xs font-medium uppercase tracking-wide text-gray-500"
                          >
                            {t('consignments.qtyToReturn')}
                          </label>
                          <input
                            id={`return-qty-${index}`}
                            type="number"
                            min={0}
                            max={available}
                            value={returnQty[index] ?? ''}
                            onChange={(e) =>
                              setReturnQty((prev) => ({ ...prev, [index]: e.target.value }))
                            }
                            className={`${qtyInputClass} mt-1 sm:ml-auto sm:block`}
                          />
                        </div>
                      </div>

                      {showProblem && (
                        <div className="sasa-return-incidents mt-4 space-y-3">
                          <div>
                            <p className="sasa-return-incidents-title">
                              {t('consignments.returnProblemSection')}
                            </p>
                            <p className="sasa-return-incidents-hint mt-1">
                              {t('consignments.returnProblemHint')}
                            </p>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label
                                htmlFor={`problem-qty-${index}`}
                                className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide"
                              >
                                {t('consignments.qtyWithProblem')}
                              </label>
                              <input
                                id={`problem-qty-${index}`}
                                type="number"
                                min={0}
                                max={r}
                                value={problemQty[index] ?? ''}
                                onChange={(e) =>
                                  setProblemQty((prev) => ({ ...prev, [index]: e.target.value }))
                                }
                                className={qtyInputClass}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label
                                htmlFor={`problem-comment-${index}`}
                                className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide"
                              >
                                {t('consignments.returnComment')}
                              </label>
                              <textarea
                                id={`problem-comment-${index}`}
                                value={comment[index] ?? ''}
                                onChange={(e) =>
                                  setComment((prev) => ({ ...prev, [index]: e.target.value }))
                                }
                                rows={2}
                                className={inputClass}
                                placeholder={t('consignments.returnCommentPh')}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <span className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wide">
                                {t('consignments.returnPhotosForLine')}
                              </span>
                              <input
                                id={fileInputId}
                                type="file"
                                accept="image/*"
                                multiple
                                className="sr-only"
                                onChange={(e) => setFileList(index, e.target.files)}
                              />
                              <label htmlFor={fileInputId} className="sasa-return-file-btn">
                                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {t('consignments.returnChooseImages')}
                              </label>
                              {(filesByIndex[index]?.length ?? 0) > 0 && (
                                <p className="mt-2 text-xs text-gray-500">
                                  {filesByIndex[index]!.length}{' '}
                                  {filesByIndex[index]!.length === 1 ? 'archivo' : 'archivos'} · {item.sku}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Pie */}
          <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 px-6 py-4">
            <button type="button" onClick={onClose} disabled={submitting} className={cancelBtnClass}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={submitting}
              className="sasa-btn-primary rounded-lg px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? t('consignments.returnModalSubmitting') : t('consignments.registerReturnsButton')}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
