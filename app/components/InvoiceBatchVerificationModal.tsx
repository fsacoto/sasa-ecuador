'use client';

import { useMemo, useState } from 'react';
import { PurchaseOrder } from '../types';
import { useTranslation } from '../context/TranslationContext';
import { expectedSaleableQuantity, isPackBased } from '../utils/purchaseOrderPack';

export type InvoiceVerifyLineInput = {
  orderId: string;
  actualQuantity: number;
  quantityGood: number;
  quantityProblem: number;
  quantityNotReceived: number;
  comment?: string;
};

interface InvoiceBatchVerificationModalProps {
  invoice: string;
  orders: PurchaseOrder[];
  onClose: () => void;
  onConfirm: (lines: InvoiceVerifyLineInput[]) => void | Promise<void>;
  submitting?: boolean;
}

type LineState = {
  order: PurchaseOrder;
  received: string;
  good: string;
  problem: string;
  notReceived: string;
  comment: string;
};

export default function InvoiceBatchVerificationModal({
  invoice,
  orders,
  onClose,
  onConfirm,
  submitting = false,
}: InvoiceBatchVerificationModalProps) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<LineState[]>(() =>
    orders.map((order) => {
      const saleable = expectedSaleableQuantity(order);
      return {
        order,
        received: String(saleable),
        good: String(order.quantityGood ?? saleable),
        problem: String(order.quantityProblem ?? 0),
        notReceived: String(order.quantityNotReceived ?? 0),
        comment: order.verificationComment ?? '',
      };
    })
  );

  const missingSkuCount = useMemo(
    () =>
      lines.filter(
        (l) => !String(l.order.supplierSKU ?? '').trim() || !String(l.order.sku ?? '').trim()
      ).length,
    [lines]
  );

  const updateLine = (orderId: string, patch: Partial<LineState>) => {
    setLines((prev) => prev.map((l) => (l.order.id === orderId ? { ...l, ...patch } : l)));
  };

  const handleSubmit = async () => {
    const payload: InvoiceVerifyLineInput[] = [];
    for (const line of lines) {
      const actualQuantity = parseInt(line.received, 10) || 0;
      const quantityGood = parseInt(line.good, 10) || 0;
      const quantityProblem = parseInt(line.problem, 10) || 0;
      const quantityNotReceived = parseInt(line.notReceived, 10) || 0;
      if (quantityGood + quantityProblem + quantityNotReceived !== actualQuantity) {
        alert(
          (t('purchaseOrders.invoiceVerifyLineMismatch') || 'Cantidades no coinciden en línea {sku}').replace(
            '{sku}',
            line.order.sku || line.order.description
          )
        );
        return;
      }
      payload.push({
        orderId: line.order.id,
        actualQuantity,
        quantityGood,
        quantityProblem,
        quantityNotReceived,
        comment: line.comment.trim() || undefined,
      });
    }
    await onConfirm(payload);
  };

  return (
    <div className="sasa-modal-overlay fixed inset-0 z-[100] flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="shrink-0 border-b border-gray-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{t('purchaseOrders.verifyInvoiceTitle')}</h3>
          <p className="mt-1 text-sm text-gray-600">
            {(t('purchaseOrders.verifyInvoiceSubtitle') || 'Factura {invoice} — {count} líneas')
              .replace('{invoice}', invoice)
              .replace('{count}', String(orders.length))}
          </p>
          {missingSkuCount > 0 && (
            <p className="mt-2 text-sm text-amber-800">
              {(t('purchaseOrders.verifyInvoiceSkuWarning') || '{count} líneas sin SKU completo').replace(
                '{count}',
                String(missingSkuCount)
              )}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="pb-2 pr-3">{t('purchaseOrders.sku')}</th>
                <th className="pb-2 pr-3">{t('purchaseOrders.description')}</th>
                <th className="pb-2 pr-3 text-right">{t('purchaseOrders.expectedQuantity')}</th>
                <th className="pb-2 pr-2 text-right">{t('purchaseOrders.quantityGood')}</th>
                <th className="pb-2 pr-2 text-right">{t('purchaseOrders.quantityProblem')}</th>
                <th className="pb-2 pr-2 text-right">{t('purchaseOrders.quantityNotReceived')}</th>
                <th className="pb-2 text-right">{t('purchaseOrders.actualQuantityReceived')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((line) => {
                const missingSku =
                  !String(line.order.supplierSKU ?? '').trim() || !String(line.order.sku ?? '').trim();
                return (
                  <tr key={line.order.id} className={missingSku ? 'bg-amber-50/50' : ''}>
                    <td className="py-3 pr-3 font-mono text-xs text-gray-800">{line.order.sku || '—'}</td>
                    <td className="max-w-[12rem] truncate py-3 pr-3 text-gray-700" title={line.order.description}>
                      {line.order.description}
                    </td>
                    <td className="py-3 pr-3 text-right text-gray-600">
                      <span className="tabular-nums">{expectedSaleableQuantity(line.order)}</span>
                      {isPackBased(line.order) && (
                        <span className="mt-0.5 block text-[10px] text-violet-700">
                          {line.order.quantity} × {line.order.unitsPerPack}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-2">
                      <input
                        type="number"
                        min={0}
                        value={line.good}
                        onChange={(e) => updateLine(line.order.id, { good: e.target.value })}
                        className="w-16 rounded border border-gray-200 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="py-3 pr-2">
                      <input
                        type="number"
                        min={0}
                        value={line.problem}
                        onChange={(e) => updateLine(line.order.id, { problem: e.target.value })}
                        className="w-16 rounded border border-gray-200 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="py-3 pr-2">
                      <input
                        type="number"
                        min={0}
                        value={line.notReceived}
                        onChange={(e) => updateLine(line.order.id, { notReceived: e.target.value })}
                        className="w-16 rounded border border-gray-200 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="py-3">
                      <input
                        type="number"
                        min={0}
                        value={line.received}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateLine(line.order.id, {
                            received: val,
                            good:
                              line.good === line.received || !line.good ? val : line.good,
                          });
                        }}
                        className="w-16 rounded border border-gray-200 px-2 py-1 text-right text-sm"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-gray-500">{t('purchaseOrders.verifyInvoiceHint')}</p>
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || missingSkuCount > 0}
            className="rounded-lg bg-[#515151] px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {submitting ? t('purchaseOrders.verifying') : t('purchaseOrders.confirmVerifyInvoice')}
          </button>
        </div>
      </div>
    </div>
  );
}
