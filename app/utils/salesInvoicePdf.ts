'use client';

import type { SalesInvoice } from '../types';

/** Genera y descarga el PDF de una nota de venta (mismo flujo que Seguimiento de notas de ventas). */
export async function downloadSalesInvoicePdf(invoice: SalesInvoice): Promise<void> {
  const { convertImageForPDF } = await import('./imageConverter');
  const { normalizePdfLogoSrc } = await import('./pdfRenderHelpers');
  const logoUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/sasa.png` : '/sasa.png';
  const logoBase64 = await convertImageForPDF(logoUrl);
  const logoSrc = normalizePdfLogoSrc(logoBase64, logoUrl);

  const React = await import('react');
  const [{ pdf }, { default: InvoicePDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/InvoicePDF'),
  ]);

  const pdfDocument = React.createElement(InvoicePDF, {
    invoice,
    logoSrc,
  });

  const blob = await pdf(pdfDocument as never).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `nota-venta-${invoice.invoiceNumber}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
