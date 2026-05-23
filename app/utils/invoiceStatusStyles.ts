import { SalesInvoice } from '../types';

const statusSelectBase =
  'sasa-invoice-status-select appearance-none rounded-lg border font-medium cursor-pointer shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-[#515151]/20';

/** Badge de solo lectura (Notas de ventas, detalle, etc.) */
export function paymentStatusBadgeClass(status: SalesInvoice['paymentStatus'] | string): string {
  const base = 'inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium';
  if (status === 'Paid') return `${base} sasa-invoice-pay-paid bg-green-100 text-green-800`;
  if (status === 'Partially Paid') return `${base} sasa-invoice-pay-partial bg-amber-100 text-amber-900`;
  return `${base} sasa-invoice-pay-unpaid bg-red-50 text-red-700`;
}

export function deliveryStatusBadgeClass(status: SalesInvoice['deliveryStatus'] | string): string {
  const base = 'inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium';
  if (status === 'Delivered') return `${base} sasa-invoice-del-delivered bg-green-100 text-green-800`;
  if (status === 'Partially Delivered') return `${base} sasa-invoice-del-partial bg-blue-100 text-blue-800`;
  if (status === 'Canceled') return `${base} sasa-invoice-del-canceled bg-gray-200 text-gray-700`;
  return `${base} sasa-invoice-del-pending bg-gray-100 text-gray-700`;
}

/** Select editable en Seguimiento de notas */
export function paymentStatusSelectClass(status: SalesInvoice['paymentStatus']): string {
  if (status === 'Paid') return `${statusSelectBase} sasa-invoice-pay-paid bg-green-50 text-green-700 border-green-200/70`;
  if (status === 'Partially Paid') {
    return `${statusSelectBase} sasa-invoice-pay-partial bg-amber-50 text-amber-800 border-amber-200/70`;
  }
  return `${statusSelectBase} sasa-invoice-pay-unpaid bg-red-50 text-red-700 border-red-200/70`;
}

export function deliveryStatusSelectClass(status: SalesInvoice['deliveryStatus']): string {
  if (status === 'Delivered') {
    return `${statusSelectBase} sasa-invoice-del-delivered bg-green-50 text-green-700 border-green-200/70`;
  }
  if (status === 'Partially Delivered') {
    return `${statusSelectBase} sasa-invoice-del-partial bg-blue-50 text-blue-700 border-blue-200/70`;
  }
  if (status === 'Canceled') {
    return `${statusSelectBase} sasa-invoice-del-canceled bg-gray-50 text-gray-600 border-gray-200/70`;
  }
  return `${statusSelectBase} sasa-invoice-del-pending bg-gray-50 text-gray-600 border-gray-200/70`;
}
