'use client';

import type { SalesInvoice } from '../types';

/** Genera y descarga la etiqueta de preparación 40×20mm de una nota de pedido. */
export async function downloadSalesPrepLabelPdf(invoice: SalesInvoice): Promise<void> {
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
    invoice,
    logoSrc,
  });

  const blob = await pdf(pdfDocument as never).toBlob();

  const safeNumber = (invoice.invoiceNumber || 'nota')
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
