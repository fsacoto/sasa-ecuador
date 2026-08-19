'use client';

import { useMemo } from 'react';
import type { InventoryItem, SalesInvoice } from '../types';
import { useTranslation } from '../context/TranslationContext';
import { useDarkMode } from '../hooks/useDarkMode';
import { formatDateDMY } from '../utils/formatDate';
import { deliveryStatusBadgeClass, paymentStatusBadgeClass } from '../utils/invoiceStatusStyles';
import ModalPortal from './ui/ModalPortal';

function resolveItemImageUrl(sku: string, inventory: InventoryItem[]): string | null {
  const trimmed = sku.trim();
  if (!trimmed) return null;
  const item = inventory.find((inv) => inv.sku === trimmed);
  const url = item?.images?.find((img) => typeof img === 'string' && img.trim());
  return url?.trim() || null;
}

function NoPhotoThumb({ label }: { label: string }) {
  return (
    <div
      className="flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-md border border-gray-200 bg-gray-100"
      title={label}
    >
      <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6" />
      </svg>
      <span className="text-[8px] font-medium uppercase leading-none tracking-wide text-gray-400">
        {label}
      </span>
    </div>
  );
}

export type SalesInvoiceDetailsModalProps = {
  invoice: SalesInvoice;
  inventory?: InventoryItem[];
  /** When true, shows payment history, delivery details, and delivered qty (Entregas y cobros). */
  showTrackingDetails?: boolean;
  onClose: () => void;
  onGeneratePdf?: (invoice: SalesInvoice) => void;
};

export default function SalesInvoiceDetailsModal({
  invoice,
  inventory = [],
  showTrackingDetails = false,
  onClose,
  onGeneratePdf,
}: SalesInvoiceDetailsModalProps) {
  const { t } = useTranslation();
  const darkMode = useDarkMode();
  const noPhotoLabel = t('invoiceTracking.noPhoto') || 'Sin foto';

  const imageBySku = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const item of invoice.items || []) {
      const sku = (item.sku || '').trim();
      if (!sku || sku in map) continue;
      map[sku] = resolveItemImageUrl(sku, inventory);
    }
    return map;
  }, [invoice.items, inventory]);

  return (
    <ModalPortal>
      <div
        className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sales-invoice-details-title"
        onClick={onClose}
      >
        <div
          className="sasa-modal-panel max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h3 id="sales-invoice-details-title" className="text-2xl font-bold text-[#515151]">
                {invoice.invoiceNumber}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {t('invoiceTracking.invoiceDetails') || 'Detalle de la nota de pedido'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-2xl leading-none text-gray-400 hover:text-gray-600"
              aria-label={t('invoiceTracking.close') || 'Cerrar'}
            >
              ×
            </button>
          </div>

          <div className="space-y-6">
            <div className="rounded-lg bg-gray-50 p-4">
              <h4 className="mb-3 font-semibold text-gray-900">{t('invoiceTracking.clientInformation')}</h4>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-gray-600">{t('invoiceTracking.clientName')}:</span>
                  <span className="ml-2 font-medium">{invoice.clientName}</span>
                </div>
                <div>
                  <span className="text-gray-600">{t('invoiceTracking.address')}:</span>
                  <span className="ml-2 font-medium">{invoice.clientAddress || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-600">{t('invoiceTracking.date')}:</span>
                  <span className="ml-2 font-medium">{formatDateDMY(invoice.date)}</span>
                </div>
                <div>
                  <span className="text-gray-600">{t('invoiceTracking.currency')}:</span>
                  <span className="ml-2 font-medium">{invoice.currency}</span>
                </div>
                {invoice.sourceConsignmentId ? (
                  <div className="sm:col-span-2">
                    <span className="text-gray-600">
                      {t('consignments.sourceConsignmentTag') || 'Consignación'}:
                    </span>
                    <span className="ml-2 font-medium text-amber-900">{invoice.sourceConsignmentId}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div>
              <h4 className="mb-3 font-semibold text-gray-900">{t('invoiceTracking.items')}</h4>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('invoiceTracking.photo') || 'Foto'}
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('invoiceTracking.sku')}
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('invoiceTracking.description')}
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('invoiceTracking.qty')}
                      </th>
                      {showTrackingDetails ? (
                        <th className="px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                          {t('invoiceTracking.delivered') || 'Entregado'}
                        </th>
                      ) : null}
                      <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('invoiceTracking.unitPrice')}
                      </th>
                      <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('invoiceTracking.total')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(invoice.items || []).map((item, index) => {
                      const sku = (item.sku || '').trim();
                      const imageUrl = sku ? imageBySku[sku] : null;
                      const delivered = Number(item.quantityDelivered) || 0;
                      return (
                        <tr key={`${sku}-${index}`} className="transition-colors hover:bg-gray-50">
                          <td className="px-3 py-2.5">
                            {imageUrl ? (
                              <div className="h-12 w-12 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                                <img
                                  src={imageUrl}
                                  alt={item.description || sku}
                                  className="h-full w-full object-contain object-center"
                                />
                              </div>
                            ) : (
                              <NoPhotoThumb label={noPhotoLabel} />
                            )}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-gray-900">{item.sku}</td>
                          <td className="px-3 py-3 text-gray-700">{item.description}</td>
                          <td className="px-3 py-3 text-center text-gray-700 tabular-nums">{item.quantity}</td>
                          {showTrackingDetails ? (
                            <td className="px-3 py-3 text-center text-gray-700 tabular-nums">{delivered}</td>
                          ) : null}
                          <td className="px-3 py-3 text-right text-gray-700 tabular-nums">
                            ${Number(item.unitPrice || 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-3 text-right font-medium text-gray-900 tabular-nums">
                            ${Number(item.totalPrice || 0).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg bg-gray-50 p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>{t('invoiceTracking.subtotal')}:</span>
                  <span className="font-medium tabular-nums">${Number(invoice.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>
                    {t('invoiceTracking.discount')}
                    {invoice.discountType === 'percentage' ? ` (${invoice.discountValue}%)` : ''}:
                  </span>
                  <span className="font-medium text-red-600 tabular-nums">
                    -${Number(invoice.discountTotal || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-gray-300 pt-2 text-lg font-bold text-[#515151]">
                  <span>{t('invoiceTracking.grandTotal')}:</span>
                  <span className="tabular-nums">${Number(invoice.grandTotal || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {showTrackingDetails ? (
              <>
                <div className="rounded-lg bg-blue-50 p-4">
                  <h4 className="mb-3 font-semibold text-gray-900">{t('invoiceTracking.paymentStatus')}</h4>
                  <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <div className="text-xs uppercase text-gray-600">{t('invoiceTracking.status')}</div>
                      <span className={paymentStatusBadgeClass(invoice.paymentStatus)}>
                        {invoice.paymentStatus === 'Unpaid' && t('invoiceTracking.unpaid')}
                        {invoice.paymentStatus === 'Partially Paid' && t('invoiceTracking.partial')}
                        {invoice.paymentStatus === 'Paid' && t('invoiceTracking.paid')}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-gray-600">{t('invoiceTracking.amountPaid')}</div>
                      <div className="font-semibold tabular-nums text-gray-900">
                        ${Number(invoice.amountPaid || 0).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-gray-600">{t('invoiceTracking.remaining')}</div>
                      <div className="font-semibold tabular-nums text-gray-900">
                        ${Number(invoice.remainingBalance || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {invoice.paymentHistory && invoice.paymentHistory.length > 0 ? (
                    <div className="mt-4">
                      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t('invoiceTracking.paymentHistory')}
                      </div>
                      <div className="space-y-2">
                        {invoice.paymentHistory.map((payment, index) => (
                          <div
                            key={`${String(payment.date)}-${index}`}
                            className="rounded bg-white p-2 text-sm"
                          >
                            <div className="flex justify-between">
                              <span className="text-gray-600">
                                {formatDateDMY(payment.date)}
                                {payment.method
                                  ? ` (${
                                      payment.method === 'cash'
                                        ? t('invoiceTracking.cash')
                                        : payment.method === 'card'
                                          ? t('invoiceTracking.card')
                                          : payment.method === 'transfer'
                                            ? t('invoiceTracking.transfer')
                                            : payment.method
                                    })`
                                  : ''}
                              </span>
                              <span className="font-semibold tabular-nums text-green-600">
                                ${Number(payment.amount || 0).toFixed(2)}
                              </span>
                            </div>
                            {payment.receipts && payment.receipts.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
                                {payment.receipts.map((receipt, receiptIndex) => (
                                  <a
                                    key={`${receipt.url}-${receiptIndex}`}
                                    href={receipt.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 underline hover:text-blue-800"
                                  >
                                    {receipt.name || t('invoiceTracking.viewReceipt')}
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-lg bg-purple-50 p-4">
                  <h4 className="mb-3 font-semibold text-gray-900">{t('invoiceTracking.deliveryStatus')}</h4>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <div className="text-xs uppercase text-gray-600">{t('invoiceTracking.status')}</div>
                      <span className={deliveryStatusBadgeClass(invoice.deliveryStatus)}>
                        {invoice.deliveryStatus === 'Pending' && t('invoiceTracking.pending')}
                        {invoice.deliveryStatus === 'Partially Delivered' &&
                          t('invoiceTracking.partiallyDelivered')}
                        {invoice.deliveryStatus === 'Delivered' && t('invoiceTracking.delivered')}
                        {invoice.deliveryStatus === 'Canceled' && t('invoiceTracking.canceled')}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-gray-600">{t('invoiceTracking.deliveryDate')}</div>
                      <div className="font-medium">
                        {invoice.deliveryDate
                          ? formatDateDMY(invoice.deliveryDate)
                          : t('invoiceTracking.na')}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-gray-600">{t('invoiceTracking.salesAgent')}</div>
                      <div className="font-medium">{invoice.salesAgent || t('invoiceTracking.na')}</div>
                    </div>
                  </div>
                  {invoice.deliveryNotes ? (
                    <div className="mt-4">
                      <div className="mb-1 text-xs uppercase text-gray-600">
                        {t('invoiceTracking.deliveryNotes')}
                      </div>
                      <div className="rounded bg-white p-2 text-sm">{invoice.deliveryNotes}</div>
                    </div>
                  ) : null}
                  {invoice.notes ? (
                    <div className="mt-4">
                      <div className="mb-1 text-xs uppercase text-gray-600">
                        {t('invoiceTracking.additionalNotes')}
                      </div>
                      <div className="rounded bg-white p-2 text-sm whitespace-pre-wrap">{invoice.notes}</div>
                    </div>
                  ) : null}
                </div>

                {invoice.paymentMethod ? (
                  <div className="rounded-lg bg-gray-50 p-4">
                    <h4 className="mb-2 font-semibold text-gray-900">{t('invoiceTracking.paymentMethod')}</h4>
                    <div className="text-sm">
                      <span className="font-medium">
                        {invoice.paymentMethod.charAt(0).toUpperCase() + invoice.paymentMethod.slice(1)}
                      </span>
                      {invoice.paymentComment ? (
                        <div className="mt-2 text-gray-600">{invoice.paymentComment}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-blue-50 p-3">
                    <div className="mb-1 text-xs uppercase text-gray-600">{t('invoiceTracking.paymentStatus')}</div>
                    <span className={paymentStatusBadgeClass(invoice.paymentStatus)}>
                      {invoice.paymentStatus === 'Unpaid' && t('invoiceTracking.unpaid')}
                      {invoice.paymentStatus === 'Partially Paid' && t('invoiceTracking.partial')}
                      {invoice.paymentStatus === 'Paid' && t('invoiceTracking.paid')}
                    </span>
                  </div>
                  <div className="rounded-lg bg-purple-50 p-3">
                    <div className="mb-1 text-xs uppercase text-gray-600">{t('invoiceTracking.deliveryStatus')}</div>
                    <span className={deliveryStatusBadgeClass(invoice.deliveryStatus)}>
                      {invoice.deliveryStatus === 'Pending' && t('invoiceTracking.pending')}
                      {invoice.deliveryStatus === 'Partially Delivered' &&
                        t('invoiceTracking.partiallyDelivered')}
                      {invoice.deliveryStatus === 'Delivered' && t('invoiceTracking.delivered')}
                      {invoice.deliveryStatus === 'Canceled' && t('invoiceTracking.canceled')}
                    </span>
                  </div>
                </div>
                {invoice.notes ? (
                  <div className="rounded-lg bg-amber-50 p-3">
                    <div className="mb-1 text-xs uppercase text-gray-600">
                      {t('invoiceTracking.additionalNotes')}
                    </div>
                    <div className="text-sm whitespace-pre-wrap text-gray-800">{invoice.notes}</div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-2">
            {onGeneratePdf ? (
              <button
                type="button"
                onClick={() => onGeneratePdf(invoice)}
                className="flex-1 rounded-lg bg-[#515151] px-4 py-2 text-white hover:bg-black"
              >
                {t('invoiceTracking.generatePdf')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className={`rounded-lg border border-gray-200 bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 ${
                onGeneratePdf ? 'flex-1' : 'w-full'
              }`}
            >
              {t('invoiceTracking.close')}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
