'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Consignment,
  ConsignmentItem,
  ConsignmentReturnIssueRef,
  InventoryItem,
} from '../types';
import { useTranslation } from '../context/TranslationContext';

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
            // Path includes Firestore id + human-readable CSG-xxxxx for support / Storage browser
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

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {t('consignments.returnModalTitle') || 'Registrar devolución'}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {consignment.consignmentId} · {t('consignments.returnModalSubtitle') || 'Busque líneas, indique cantidades devueltas. Las no marcadas con problema se consideran en buen estado.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100"
            aria-label={t('common.close')}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('consignments.returnModalSearch') || 'Buscar por SKU o descripción...'}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#515151] focus:border-[#515151]"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {filteredRows.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              {t('consignments.returnModalNoMatch') || 'Ninguna línea coincide con la búsqueda.'}
            </p>
          ) : (
            filteredRows.map(({ item, index, available }) => {
              if (available <= 0) {
                return (
                  <div
                    key={index}
                    className="border border-gray-100 rounded-xl p-4 bg-gray-50 text-sm text-gray-500"
                  >
                    <span className="font-mono font-medium text-gray-700">{item.sku}</span> — {item.description}{' '}
                    <span className="text-amber-700">({t('consignments.nothingToReturn') || 'Sin unidades por devolver'})</span>
                  </div>
                );
              }
              const r = parseInt(returnQty[index] || '0', 10) || 0;
              const showProblem = r > 0;
              return (
                <div
                  key={index}
                  className="border border-gray-200 rounded-xl p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-sm font-semibold text-[#515151]">{item.sku}</div>
                      <div className="text-sm text-gray-800">{item.description}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {t('consignments.available')}: {available}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 whitespace-nowrap">
                        {t('consignments.qtyToReturn') || 'A devolver'}
                        <input
                          type="number"
                          min={0}
                          max={available}
                          value={returnQty[index] ?? ''}
                          onChange={(e) =>
                            setReturnQty((prev) => ({ ...prev, [index]: e.target.value }))
                          }
                          className="ml-2 w-20 px-2 py-1 border border-gray-300 rounded text-center text-sm"
                        />
                      </label>
                    </div>
                  </div>

                  {showProblem && (
                    <div className="pl-3 border-l-4 border-amber-400 bg-amber-50/60 rounded-r-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-amber-900 uppercase tracking-wide">
                        {t('consignments.returnProblemSection') || 'Incidencias (opcional)'}
                      </p>
                      <p className="text-xs text-amber-800">
                        {t('consignments.returnProblemHint') ||
                          'Si no indica unidades con problema, toda la devolución de esta línea se considera en buen estado. Las unidades con problema siguen sumando al stock físico y aparecen como alerta en inventario.'}
                      </p>
                      <label className="flex items-center gap-2 text-sm">
                        <span className="text-gray-700 w-44 shrink-0">
                          {t('consignments.qtyWithProblem') || 'Cant. con problema'}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={r}
                          value={problemQty[index] ?? ''}
                          onChange={(e) =>
                            setProblemQty((prev) => ({ ...prev, [index]: e.target.value }))
                          }
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-center text-sm"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="text-gray-700">{t('consignments.returnComment') || 'Comentario'}</span>
                        <textarea
                          value={comment[index] ?? ''}
                          onChange={(e) =>
                            setComment((prev) => ({ ...prev, [index]: e.target.value }))
                          }
                          rows={2}
                          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          placeholder={t('consignments.returnCommentPh') || 'Detalle del daño o incidencia…'}
                        />
                      </label>
                      <div>
                        <label className="text-xs font-medium text-gray-700">
                          {t('consignments.returnPhotosForLine') || 'Imágenes para esta línea (SKU arriba)'}
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => setFileList(index, e.target.files)}
                          className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5"
                        />
                        {(filesByIndex[index]?.length ?? 0) > 0 && (
                          <p className="text-xs text-gray-500 mt-1">
                            {filesByIndex[index]!.length} archivo(s) · {item.sku}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-white">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting}
            className="px-5 py-2 bg-[#515151] text-white rounded-lg hover:bg-black disabled:opacity-50 font-medium"
          >
            {submitting
              ? t('consignments.returnModalSubmitting') || 'Procesando…'
              : t('consignments.registerReturnsButton') || 'Registrar devoluciones'}
          </button>
        </div>
      </div>
    </div>
  );
}
