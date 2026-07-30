'use client';

import type { Consignment, SalesInvoice } from '../types';

export interface PrepLabelData {
  /** e.g. "Nota de pedido:" or "Consignación:" */
  documentTitle: string;
  documentNumber: string;
  clientName: string;
  date: Date | string | number | null | undefined;
  itemsCount: number;
}

function prepLabelDataFromInvoice(invoice: SalesInvoice): PrepLabelData {
  const itemsCount = (invoice.items || []).reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0
  );
  return {
    documentTitle: 'Nota de pedido:',
    documentNumber: (invoice.invoiceNumber || '').trim() || '—',
    clientName: invoice.clientName || '—',
    date: invoice.date,
    itemsCount,
  };
}

function prepLabelDataFromConsignment(consignment: Consignment): PrepLabelData {
  const itemsCount = (consignment.items || []).reduce(
    (sum, item) => sum + (Number(item.quantityDelivered) || 0),
    0
  );
  return {
    documentTitle: 'Consignación:',
    documentNumber: (consignment.consignmentId || '').trim() || '—',
    clientName: consignment.clientName || '—',
    date: consignment.dateCreated,
    itemsCount,
  };
}

async function downloadPrepLabelPdf(
  data: PrepLabelData,
  fileNameFallback: string
): Promise<void> {
  const { loadTransparentBrandLogoForPdf } = await import('./imageConverter');
  const { normalizePdfLogoSrc } = await import('./pdfRenderHelpers');

  const logoPath = '/sasa.png';
  const logoUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${logoPath}` : logoPath;
  const logoBase64 = await loadTransparentBrandLogoForPdf(logoPath);
  const logoSrc = normalizePdfLogoSrc(logoBase64, logoUrl);

  const React = await import('react');
  const [{ pdf }, { default: SalesPrepLabelPDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/SalesPrepLabelPDF'),
  ]);

  const pdfDocument = React.createElement(SalesPrepLabelPDF, {
    data,
    logoSrc,
  });

  const blob = await pdf(pdfDocument as never).toBlob();

  const safeNumber = (data.documentNumber || fileNameFallback)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-');

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `etiqueta-preparacion-${safeNumber}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Genera y descarga la etiqueta de preparación 40×20mm de una nota de pedido. */
export async function downloadSalesPrepLabelPdf(invoice: SalesInvoice): Promise<void> {
  await downloadPrepLabelPdf(prepLabelDataFromInvoice(invoice), 'nota');
}

/** Genera y descarga la etiqueta de preparación 40×20mm de una consignación. */
export async function downloadConsignmentPrepLabelPdf(
  consignment: Consignment
): Promise<void> {
  await downloadPrepLabelPdf(prepLabelDataFromConsignment(consignment), 'consignacion');
}
