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

export function prepLabelDataFromConsignment(consignment: Consignment): PrepLabelData {
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

async function downloadPrepLabelsPdf(
  labels: PrepLabelData[],
  fileNameFallback: string
): Promise<void> {
  if (labels.length === 0) {
    throw new Error('No prep labels to render');
  }

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
    labels,
    logoSrc,
  });

  const blob = await pdf(pdfDocument as never).toBlob();

  const safeNumber =
    labels.length === 1
      ? (labels[0].documentNumber || fileNameFallback)
          .trim()
          .replace(/[\\/:*?"<>|]+/g, '-')
          .replace(/\s+/g, '-')
      : `${labels.length}-etiquetas`;

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
  await downloadPrepLabelsPdf([prepLabelDataFromInvoice(invoice)], 'nota');
}

/** Genera y descarga la etiqueta de preparación 40×20mm de una consignación. */
export async function downloadConsignmentPrepLabelPdf(
  consignment: Consignment
): Promise<void> {
  await downloadPrepLabelsPdf([prepLabelDataFromConsignment(consignment)], 'consignacion');
}

/** One PDF with a prep label page per selected consignación. */
export async function downloadConsignmentsPrepLabelPdf(
  consignments: Consignment[]
): Promise<void> {
  const labels = consignments.map(prepLabelDataFromConsignment);
  await downloadPrepLabelsPdf(labels, 'consignaciones');
}
