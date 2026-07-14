'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PurchaseOrder, InventoryItem, Supplier } from '../types';
import { useTranslation } from '../context/TranslationContext';
import { useDarkMode } from '../hooks/useDarkMode';
import { findInventoryForPurchaseOrder } from '../utils/barcodePrint';
import { attachBarcodeToPurchaseOrderIfNeeded } from '../utils/syncUpdates';
import { isValidBarcodeInput } from '../utils/barcodeGenerator';
import {
  expectedSaleableQuantity,
  isPackBased,
} from '../utils/purchaseOrderPack';
import { displayCategory, displayLine } from '../utils/merchandiseLabels';
import { formatDateMedium } from '../utils/formatDate';
import { statusLabelKey } from '../utils/purchaseOrderStatusFlow';
import {
  PO_STATUS_BADGE_CLASS,
  effectivePurchaseOrderStatus,
} from '../utils/purchaseOrderStatusTheme';
import PoStatusIcon from './icons/PoStatusIcon';
import ModalPortal from './ui/ModalPortal';

interface PurchaseOrderLineDetailPanelProps {
  order: PurchaseOrder;
  purchaseOrders: PurchaseOrder[];
  inventory: InventoryItem[];
  suppliers: Supplier[];
  updatePurchaseOrder: (id: string, updates: Partial<PurchaseOrder>) => Promise<void>;
  onClose: () => void;
  onEdit?: (order: PurchaseOrder) => void;
}

function DetailCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`mt-0.5 text-sm font-medium text-gray-900 ${mono ? 'font-mono text-xs' : ''}`}>
        {value || '—'}
      </dd>
    </div>
  );
}

export default function PurchaseOrderLineDetailPanel({
  order,
  purchaseOrders,
  inventory,
  suppliers,
  updatePurchaseOrder,
  onClose,
  onEdit,
}: PurchaseOrderLineDetailPanelProps) {
  const { t, tf } = useTranslation();
  const darkMode = useDarkMode();
  const [busy, setBusy] = useState(false);
  const autoAttachTries = useRef(0);

  const latest = useMemo(
    () => purchaseOrders.find((o) => o.id === order.id) ?? order,
    [purchaseOrders, order]
  );

  const inv = useMemo(() => findInventoryForPurchaseOrder(latest, inventory), [latest, inventory]);
  const supplier = suppliers.find((s) => s.id === latest.supplierId);
  const status = effectivePurchaseOrderStatus(latest.status);
  const saleable = expectedSaleableQuantity(latest);
  const packBased = isPackBased(latest);
  const barcodeUrl = (latest.barcode || inv?.barcode || '').trim();
  const invoiceLink = (latest.invoiceLink || '').trim();

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  const currency = latest.currency || 'USD';
  const formatMoney = (n: number, code = currency) =>
    `${code} ${Number(n || 0).toLocaleString('es-EC', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const formatUsd = (n: number) =>
    `$${Number(n || 0).toLocaleString('es-EC', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <ModalPortal>
      <div
        className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[100] flex items-stretch justify-end backdrop-blur-sm animate-in fade-in duration-200`}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="sasa-modal-panel flex h-full max-h-[100dvh] w-full max-w-md flex-col overflow-hidden rounded-none shadow-2xl animate-in slide-in-from-right duration-300 sm:rounded-l-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="po-line-detail-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="shrink-0 border-b border-gray-200 px-5 pb-4 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p id="po-line-detail-title" className="text-sm text-gray-500">
                  {tf('purchaseOrders.lineDetailTitle', 'Detalles del pedido')}
                </p>
                <h2 className="mt-1 truncate text-3xl font-bold tracking-tight text-gray-900">
                  {latest.invoice || '—'}
                </h2>
                <p className="mt-1 truncate text-sm text-gray-600">
                  {latest.description || '—'}
                  {latest.sku ? (
                    <span className="text-gray-400"> · {latest.sku}</span>
                  ) : null}
                </p>
                {invoiceLink ? (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    <a
                      href={invoiceLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {tf('purchaseOrders.lineDetailViewImportSheet', 'Ver hoja de importación')}
                    </a>
                    <a
                      href={invoiceLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {tf('purchaseOrders.lineDetailDownload', 'Descargar')}
                    </a>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                aria-label={t('common.close') || 'Close'}
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-3">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PO_STATUS_BADGE_CLASS[status]}`}
              >
                <PoStatusIcon status={status} className="h-3.5 w-3.5 shrink-0" />
                {t(`purchaseOrders.${statusLabelKey(status)}`)}
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
            <div className="flex flex-col items-center rounded-2xl border border-gray-200 bg-white px-4 py-5">
              {barcodeUrl ? (
                <>
                  <div className="rounded-lg bg-white px-3 py-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={barcodeUrl}
                      alt=""
                      className="max-h-28 max-w-full object-contain"
                    />
                  </div>
                  {latest.sku ? (
                    <p className="mt-2 font-mono text-sm font-medium text-gray-900">{latest.sku}</p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-gray-500">
                    {tf('purchaseOrders.lineDetailBarcodeLabel', 'Código de barras')}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500">
                    {t('purchaseOrders.lineDetailNoBarcodeYet')}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleEnsureBarcode}
                    className="mt-3 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {busy
                      ? t('purchaseOrders.lineDetailBarcodeWorking')
                      : t('purchaseOrders.lineDetailEnsureBarcode')}
                  </button>
                </>
              )}
            </div>

            <DetailCard title={tf('purchaseOrders.lineDetailProduct', 'Producto')}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label={t('purchaseOrders.sku')} value={latest.sku} mono />
                <Field
                  label={tf('purchaseOrders.supplierSkuLabel', 'SKU del Proveedor')}
                  value={latest.supplierSKU}
                  mono
                />
                <Field
                  label={t('purchaseOrders.category') || 'Categoría'}
                  value={displayCategory(latest.category) || latest.category}
                />
                <Field
                  label={t('purchaseOrders.line') || 'Línea'}
                  value={displayLine(latest.line) || latest.line}
                />
              </dl>
            </DetailCard>

            <DetailCard title={tf('purchaseOrders.lineDetailSupplierSection', 'Proveedor')}>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {supplier?.name || '—'}
                </p>
                {supplier?.country ? (
                  <p className="mt-0.5 text-sm text-gray-500">{supplier.country}</p>
                ) : null}
              </div>
            </DetailCard>

            <DetailCard title={tf('purchaseOrders.lineDetailQuantitySection', 'Cantidad')}>
              <div>
                <p className="text-xs text-gray-500">
                  {tf('purchaseOrders.expectedQuantity', 'Cantidad Esperada')}
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{saleable}</p>
                {packBased ? (
                  <p className="mt-1 text-xs text-violet-700">
                    {latest.quantity}{' '}
                    {tf('purchaseOrders.packSetup.modePack', 'Caja/set')} × {latest.unitsPerPack}{' '}
                    {tf('purchaseOrders.packSetup.forSaleShort', 'venta')}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">
                    {tf('purchaseOrders.lineDetailOrderedQty', 'Cantidad pedida')}: {latest.quantity}
                  </p>
                )}
              </div>
            </DetailCard>

            <DetailCard title={tf('purchaseOrders.lineDetailCostsSection', 'Costos')}>
              <div className="rounded-lg bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-500">
                  {tf('purchaseOrders.lineDetailTotalUsd', 'Total (USD)')}
                </p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">
                  {formatUsd(latest.costInUSD || latest.totalLandedCost)}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  <span className="font-semibold tabular-nums text-gray-900">
                    {formatUsd(latest.landedCostPerUnit)}
                  </span>{' '}
                  {tf('purchaseOrders.lineDetailLandedPerUnit', 'Costo puesto/unit')}
                </p>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                <Field
                  label={t('purchaseOrders.costPerUnit') || 'Costo por Unidad'}
                  value={formatMoney(latest.costPerUnit)}
                />
                <Field
                  label={tf('common.total', 'Total')}
                  value={formatMoney(latest.totalCost)}
                />
                <Field
                  label={t('purchaseOrders.exchangeRate') || 'Tipo de Cambio'}
                  value={String(latest.exchangeRate ?? '—')}
                />
                <Field label="USD" value={formatUsd(latest.costInUSD)} />
              </dl>
            </DetailCard>

            <DetailCard title={tf('purchaseOrders.lineDetailDatesSection', 'Fechas')}>
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-500">
                    {tf('purchaseOrders.lineDetailOrderDate', 'Fecha de Orden')}
                  </dt>
                  <dd className="font-medium text-gray-900">
                    {formatDateMedium(latest.purchaseDate)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-500">
                    {t('purchaseOrders.dateCreated') || 'Fecha de Creación'}
                  </dt>
                  <dd className="font-medium text-gray-900">
                    {formatDateMedium(latest.createdAt)}
                  </dd>
                </div>
                {latest.receivedDate ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-gray-500">
                      {tf('purchaseOrders.lineDetailReceivedDate', 'Fecha de Recepción')}
                    </dt>
                    <dd className="font-medium text-gray-900">
                      {formatDateMedium(latest.receivedDate)}
                    </dd>
                  </div>
                ) : null}
                {latest.verifiedDate ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-gray-500">
                      {tf('purchaseOrders.lineDetailVerifiedDate', 'Fecha de Verificación')}
                    </dt>
                    <dd className="font-medium text-gray-900">
                      {formatDateMedium(latest.verifiedDate)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </DetailCard>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 gap-3 border-t border-gray-200 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50"
            >
              {t('common.close') || tf('common.cancel', 'Cerrar')}
            </button>
            {onEdit ? (
              <button
                type="button"
                onClick={() => {
                  onEdit(latest);
                  onClose();
                }}
                className="flex-1 rounded-lg bg-[#515151] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black"
              >
                {t('common.edit') || 'Editar'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
