'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PurchaseOrder, InventoryItem, Supplier } from '../types';
import { useTranslation } from '../context/TranslationContext';
import { findInventoryForPurchaseOrder } from '../utils/barcodePrint';
import { attachBarcodeToPurchaseOrderIfNeeded } from '../utils/syncUpdates';
import { isValidBarcodeInput } from '../utils/barcodeGenerator';

interface PurchaseOrderLineDetailPanelProps {
  order: PurchaseOrder;
  purchaseOrders: PurchaseOrder[];
  inventory: InventoryItem[];
  suppliers: Supplier[];
  updatePurchaseOrder: (id: string, updates: Partial<PurchaseOrder>) => Promise<void>;
  onClose: () => void;
}

export default function PurchaseOrderLineDetailPanel({
  order,
  purchaseOrders,
  inventory,
  suppliers,
  updatePurchaseOrder,
  onClose,
}: PurchaseOrderLineDetailPanelProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const autoAttachTries = useRef(0);

  const latest = useMemo(
    () => purchaseOrders.find((o) => o.id === order.id) ?? order,
    [purchaseOrders, order]
  );

  const inv = useMemo(() => findInventoryForPurchaseOrder(latest, inventory), [latest, inventory]);

  const skuKey = String(latest.sku ?? '').trim().toLowerCase();
  const sameSkuOthers = useMemo(() => {
    if (!skuKey) return [];
    return purchaseOrders.filter(
      (o) => o.id !== latest.id && String(o.sku ?? '').trim().toLowerCase() === skuKey
    );
  }, [purchaseOrders, latest.id, skuKey]);

  const supplier = suppliers.find((s) => s.id === latest.supplierId);

  useEffect(() => {
    autoAttachTries.current = 0;
  }, [order.id]);

  useEffect(() => {
    const row = purchaseOrders.find((o) => o.id === order.id) ?? order;
    const b = (row.barcode || '').trim();
    const s = (row.sku || '').trim();
    if (!isValidBarcodeInput(s)) return;
    if (b) {
      autoAttachTries.current = 0;
      return;
    }
    if (autoAttachTries.current >= 5) return;
    autoAttachTries.current += 1;
    let cancelled = false;
    setBusy(true);
    void attachBarcodeToPurchaseOrderIfNeeded(
      row,
      updatePurchaseOrder,
      inventory,
      undefined,
      purchaseOrders
    )
      .catch((e) => {
        console.error(e);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [order.id, purchaseOrders, inventory, updatePurchaseOrder]);

  const handleEnsureBarcode = async () => {
    if (!isValidBarcodeInput(latest.sku)) {
      alert(t('purchaseOrders.lineDetailNeedSku'));
      return;
    }
    autoAttachTries.current = 0;
    setBusy(true);
    try {
      await attachBarcodeToPurchaseOrderIfNeeded(
        latest,
        updatePurchaseOrder,
        inventory,
        undefined,
        purchaseOrders
      );
    } catch (e) {
      console.error(e);
      alert(t('purchaseOrders.lineDetailBarcodeError'));
    } finally {
      setBusy(false);
    }
  };

  const barcodeUrl = (latest.barcode || '').trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 backdrop-blur-sm animate-in fade-in duration-200 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-full max-h-[100dvh] w-full flex-col border-l border-gray-200 bg-white shadow-2xl sm:max-h-[90vh] sm:w-[min(100%,28rem)] sm:rounded-l-2xl animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-labelledby="po-line-detail-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="min-w-0 pr-2">
            <h2 id="po-line-detail-title" className="truncate text-lg font-semibold text-gray-900">
              {t('purchaseOrders.lineDetailTitle')}
            </h2>
            <p className="truncate text-sm text-gray-500">{latest.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-gray-400 transition-colors hover:text-gray-600"
            aria-label={t('common.close') || 'Close'}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              {t('purchaseOrders.lineDetailThisOrder')}
            </h3>
            <dl className="space-y-2 text-sm text-gray-700">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">{t('purchaseOrders.invoice')}</dt>
                <dd className="font-medium">{latest.invoice || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">{t('purchaseOrders.status')}</dt>
                <dd className="font-medium">{latest.status}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">{t('purchaseOrders.lineDetailInternalSku')}</dt>
                <dd className="font-mono text-xs">{latest.sku || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">{t('purchaseOrders.quantity')}</dt>
                <dd className="font-medium">{latest.quantity}</dd>
              </div>
              {supplier && (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">{t('purchaseOrders.supplier')}</dt>
                  <dd className="text-right font-medium">{supplier.name}</dd>
                </div>
              )}
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              {t('purchaseOrders.lineDetailInventory')}
            </h3>
            {inv ? (
              <div className="rounded-lg border border-green-100 bg-green-50/80 p-3 text-sm text-gray-800">
                <p className="font-medium text-green-900">{inv.name || inv.description}</p>
                <p className="mt-1 font-mono text-xs text-gray-600">SKU: {inv.sku}</p>
                <p className="mt-2 text-xs text-gray-600">
                  {t('purchaseOrders.lineDetailStock')}: {(inv.ecuadorStock ?? 0) + (inv.consignmentStock ?? 0)}
                </p>
              </div>
            ) : (
              <p className="rounded-lg border border-amber-100 bg-amber-50/80 p-3 text-sm text-amber-900">
                {t('purchaseOrders.lineDetailNoInventory')}
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              {t('purchaseOrders.lineDetailSameSkuTitle')}
            </h3>
            {sameSkuOthers.length === 0 ? (
              <p className="text-sm text-gray-500">{t('purchaseOrders.lineDetailSameSkuEmpty')}</p>
            ) : (
              <ul className="max-h-40 space-y-2 overflow-y-auto text-sm">
                {sameSkuOthers.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <span className="font-medium text-gray-900">{o.invoice}</span>
                    <span className="text-xs text-gray-500">{o.status}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-gray-500">
              {t('purchaseOrders.lineDetailSameSkuCount').replace('{count}', String(sameSkuOthers.length))}
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              {t('purchaseOrders.lineDetailBarcode')}
            </h3>
            <p className="mb-3 text-xs text-gray-500">{t('purchaseOrders.lineDetailBarcodeHelp')}</p>
            {barcodeUrl ? (
              <div className="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={barcodeUrl} alt="" className="max-h-28 max-w-full object-contain" />
              </div>
            ) : (
              <p className="text-sm text-gray-500">{t('purchaseOrders.lineDetailNoBarcodeYet')}</p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={handleEnsureBarcode}
              className="mt-3 w-full rounded-lg bg-[#515151] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t('purchaseOrders.lineDetailBarcodeWorking') : t('purchaseOrders.lineDetailEnsureBarcode')}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
