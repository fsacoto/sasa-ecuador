'use client';

import { useMemo, useState } from 'react';
import type { PurchaseOrder, Supplier } from '../types';
import { useTranslation } from '../context/TranslationContext';
import POModalShell from './ui/POModalShell';
import {
  expectedSaleableQuantity,
  isPackBased,
  normalizeUnitsPerPackInput,
} from '../utils/purchaseOrderPack';
import { effectivePurchaseOrderStatus } from '../utils/purchaseOrderStatusTheme';

export type PackSetupSaveItem = { orderId: string; unitsPerPack: number | null };

type LineDraft = {
  orderId: string;
  mode: 'unit' | 'pack';
  unitsPerPack: string;
};

interface InvoicePackSetupModalProps {
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  onClose: () => void;
  onSave: (updates: PackSetupSaveItem[]) => void | Promise<void>;
}

function isEligibleForPackSetup(order: PurchaseOrder): boolean {
  if (effectivePurchaseOrderStatus(order.status) === 'Verified') return false;
  return String(order.sku ?? '').trim().length > 0;
}

export default function InvoicePackSetupModal({
  purchaseOrders,
  suppliers,
  onClose,
  onSave,
}: InvoicePackSetupModalProps) {
  const { t, tf } = useTranslation();
  const [step, setStep] = useState<'invoice' | 'lines'>('invoice');
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [saving, setSaving] = useState(false);

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id;

  const eligibleOrders = useMemo(
    () => purchaseOrders.filter(isEligibleForPackSetup),
    [purchaseOrders]
  );

  const invoices = useMemo(() => {
    const map = new Map<string, PurchaseOrder[]>();
    for (const order of eligibleOrders) {
      const list = map.get(order.invoice) ?? [];
      list.push(order);
      map.set(order.invoice, list);
    }
    return [...map.entries()]
      .map(([invoice, orders]) => ({
        invoice,
        orders,
        supplierId: orders[0]?.supplierId ?? '',
        packLines: orders.filter((o) => isPackBased(o)).length,
      }))
      .sort((a, b) => a.invoice.localeCompare(b.invoice));
  }, [eligibleOrders]);

  const filteredInvoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter((entry) => {
      if (entry.invoice.toLowerCase().includes(q)) return true;
      if (supplierName(entry.supplierId).toLowerCase().includes(q)) return true;
      return entry.orders.some(
        (o) =>
          o.sku?.toLowerCase().includes(q) ||
          o.description?.toLowerCase().includes(q) ||
          o.supplierSKU?.toLowerCase().includes(q)
      );
    });
  }, [invoices, searchQuery, suppliers]);

  const selectedLines = useMemo(() => {
    if (!selectedInvoice) return [];
    return eligibleOrders.filter((o) => o.invoice === selectedInvoice);
  }, [eligibleOrders, selectedInvoice]);

  const openLinesStep = (invoice: string) => {
    const lines = eligibleOrders.filter((o) => o.invoice === invoice);
    const next: Record<string, LineDraft> = {};
    for (const order of lines) {
      const pack = isPackBased(order);
      next[order.id] = {
        orderId: order.id,
        mode: pack ? 'pack' : 'unit',
        unitsPerPack: pack ? String(order.unitsPerPack) : '2',
      };
    }
    setDrafts(next);
    setSelectedInvoice(invoice);
    setStep('lines');
  };

  const setLineMode = (orderId: string, mode: 'unit' | 'pack') => {
    setDrafts((prev) => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        orderId,
        mode,
        unitsPerPack: prev[orderId]?.unitsPerPack || '2',
      },
    }));
  };

  const setLinePerPack = (orderId: string, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        orderId,
        mode: 'pack',
        unitsPerPack: value,
      },
    }));
  };

  const previewSaleable = (order: PurchaseOrder, draft: LineDraft | undefined) => {
    if (!draft || draft.mode === 'unit') {
      return expectedSaleableQuantity({ quantity: order.quantity, unitsPerPack: undefined });
    }
    const n = parseInt(draft.unitsPerPack, 10);
    if (!Number.isFinite(n) || n < 2) return order.quantity;
    return order.quantity * n;
  };

  const handleSave = async () => {
    if (!selectedInvoice || saving) return;

    const updates: PackSetupSaveItem[] = [];
    for (const order of selectedLines) {
      const draft = drafts[order.id];
      if (!draft) continue;
      const nextUnits =
        draft.mode === 'pack' ? normalizeUnitsPerPackInput(parseInt(draft.unitsPerPack, 10)) : null;

      if (draft.mode === 'pack' && nextUnits == null) {
        alert(
          (t('purchaseOrders.packSetup.invalidUnitsPerPack') ||
            'Unidades por caja/set debe ser ≥ 2 (SKU {sku}).').replace('{sku}', order.sku || order.id)
        );
        return;
      }

      const prev = normalizeUnitsPerPackInput(order.unitsPerPack);
      if (prev !== nextUnits) {
        updates.push({ orderId: order.id, unitsPerPack: nextUnits });
      }
    }

    if (updates.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await onSave(updates);
      onClose();
    } catch (err) {
      console.error(err);
      alert(t('purchaseOrders.packSetup.saveError') || 'No se pudo guardar cajas/sets.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <POModalShell
      title={tf('purchaseOrders.packSetup.title', 'Cajas / sets')}
      titleId="invoice-pack-setup-title"
      maxWidthClass="max-w-4xl"
      onClose={onClose}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
        {step === 'invoice' ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {tf(
                'purchaseOrders.packSetup.invoiceStepHint',
                'Elige una factura no verificada con SKU interno. Luego marca líneas vendidas por caja/set.'
              )}
            </p>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tf('purchaseOrders.packSetup.searchPlaceholder', 'Buscar factura, SKU…')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#515151]"
            />
            {filteredInvoices.length === 0 ? (
              <p className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {tf(
                  'purchaseOrders.packSetup.noEligibleInvoices',
                  'No hay facturas elegibles (deben tener SKU interno y no estar Verificadas).'
                )}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                {filteredInvoices.map((entry) => (
                  <li key={entry.invoice}>
                    <button
                      type="button"
                      onClick={() => openLinesStep(entry.invoice)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium text-gray-900">{entry.invoice}</span>
                        <span className="mt-0.5 block text-xs text-gray-500">
                          {supplierName(entry.supplierId)} ·{' '}
                          {entry.orders.length === 1
                            ? tf('purchaseOrders.packSetup.linesOne', '1 línea')
                            : (t('purchaseOrders.packSetup.linesMany') || '{count} líneas').replace(
                                '{count}',
                                String(entry.orders.length)
                              )}
                          {entry.packLines > 0
                            ? ` · ${(t('purchaseOrders.packSetup.alreadyPack') || '{count} caja/set').replace('{count}', String(entry.packLines))}`
                            : ''}
                        </span>
                      </span>
                      <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep('invoice');
                  setSelectedInvoice(null);
                }}
                className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {tf('purchaseOrders.packSetup.backToInvoices', 'Volver a facturas')}
              </button>
              <p className="text-sm font-medium text-gray-900">
                {(t('purchaseOrders.packSetup.invoiceLabel') || 'Factura {invoice}').replace(
                  '{invoice}',
                  selectedInvoice || ''
                )}
              </p>
            </div>

            <p className="text-sm text-gray-600">
              {tf(
                'purchaseOrders.packSetup.linesStepHint',
                'Cantidad pedida = cajas/sets al proveedor. Unidades por set = piezas vendibles por caja.'
              )}
            </p>

            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2">{t('purchaseOrders.sku')}</th>
                    <th className="px-3 py-2">{t('purchaseOrders.description')}</th>
                    <th className="px-3 py-2 text-right">
                      {tf('purchaseOrders.packSetup.ordered', 'Pedido')}
                    </th>
                    <th className="px-3 py-2">{tf('purchaseOrders.packSetup.mode', 'Modo')}</th>
                    <th className="px-3 py-2 text-right">
                      {tf('purchaseOrders.packSetup.unitsPerPack', 'Uds./set')}
                    </th>
                    <th className="px-3 py-2 text-right">
                      {tf('purchaseOrders.packSetup.preview', 'Etiquetas / uds.')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedLines.map((order) => {
                    const draft = drafts[order.id];
                    const mode = draft?.mode ?? 'unit';
                    const saleable = previewSaleable(order, draft);
                    return (
                      <tr key={order.id}>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-800">{order.sku}</td>
                        <td className="max-w-[12rem] truncate px-3 py-2.5 text-gray-700" title={order.description}>
                          {order.description}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-800">{order.quantity}</td>
                        <td className="px-3 py-2.5">
                          <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
                            <button
                              type="button"
                              onClick={() => setLineMode(order.id, 'unit')}
                              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                                mode === 'unit'
                                  ? 'bg-[#515151] text-white'
                                  : 'text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              {tf('purchaseOrders.packSetup.modeUnit', 'Unidad')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setLineMode(order.id, 'pack')}
                              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                                mode === 'pack'
                                  ? 'bg-[#515151] text-white'
                                  : 'text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              {tf('purchaseOrders.packSetup.modePack', 'Caja/set')}
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {mode === 'pack' ? (
                            <input
                              type="number"
                              min={2}
                              step={1}
                              value={draft?.unitsPerPack ?? '2'}
                              onChange={(e) => setLinePerPack(order.id, e.target.value)}
                              className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-[#515151]"
                            />
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-semibold tabular-nums text-gray-900">{saleable}</span>
                          {mode === 'pack' && (
                            <span className="mt-0.5 block text-[10px] text-gray-500">
                              {order.quantity} × {draft?.unitsPerPack || '?'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {t('common.cancel')}
        </button>
        {step === 'lines' && (
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="rounded-lg bg-[#515151] px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
          >
            {saving
              ? tf('purchaseOrders.packSetup.saving', 'Guardando…')
              : tf('purchaseOrders.packSetup.save', 'Guardar cajas/sets')}
          </button>
        )}
      </div>
    </POModalShell>
  );
}
