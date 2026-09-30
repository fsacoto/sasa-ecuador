import type { SalesInvoice } from '../types';

export function calcSellerCommissionAmount(
  subtotal: number,
  type: 'percentage' | 'flat' | undefined,
  value: number
): number {
  if (!value || value < 0) return 0;
  if (type === 'percentage') {
    return Math.round(((subtotal * value) / 100) * 100) / 100;
  }
  return Math.round(value * 100) / 100;
}

/** 0–100: cuánto de la comisión ya se pagó a la vendedora por adelantado. */
export function normalizePrepaidPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 100) return 100;
  return Math.round(n * 100) / 100;
}

/** Parte de la comisión que aún reduce lo que el cliente debe. */
export function commissionAppliedToBalance(
  commissionTotal: number,
  prepaidPercent: number
): number {
  const pct = normalizePrepaidPercent(prepaidPercent);
  return Math.round(commissionTotal * (1 - pct / 100) * 100) / 100;
}

/**
 * Total a cobrar del cliente.
 * Si la comisión se pagó por adelantado, esa parte ya no reduce el saldo del cliente.
 */
export function invoiceCollectibleTotal(
  invoice: Pick<
    SalesInvoice,
    | 'subtotal'
    | 'discountTotal'
    | 'sellerCommissionTotal'
    | 'sellerCommissionPrepaidPercent'
  >
): number {
  const subtotal = Number(invoice.subtotal) || 0;
  const discount = Number(invoice.discountTotal) || 0;
  const commission = Number(invoice.sellerCommissionTotal) || 0;
  const applied = commissionAppliedToBalance(
    commission,
    invoice.sellerCommissionPrepaidPercent || 0
  );
  return Math.max(0, Math.round((subtotal - discount - applied) * 100) / 100);
}

export function computeCollectibleTotal(params: {
  subtotal: number;
  discountTotal: number;
  commissionTotal: number;
  prepaidPercent: number;
}): number {
  const applied = commissionAppliedToBalance(params.commissionTotal, params.prepaidPercent);
  return Math.max(
    0,
    Math.round((params.subtotal - params.discountTotal - applied) * 100) / 100
  );
}
