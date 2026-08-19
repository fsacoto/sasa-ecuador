'use client';

import type { Consignment, InventoryItem } from '../types';

export type ConsignmentPdfOptions = {
  markItemOutcomes?: boolean;
};

function safeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function buildConsignmentPdfBlob(
  consignments: Consignment[],
  inventory: InventoryItem[],
  options: ConsignmentPdfOptions = {}
): Promise<Blob> {
  if (consignments.length === 0) {
    throw new Error('No consignments to render');
  }

  const { convertImageForPDF } = await import('./imageConverter');
  const { buildPdfProductImagesBySku } = await import('./pdfProductImages');
  const { normalizePdfLogoSrc } = await import('./pdfRenderHelpers');

  const logoUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/sasa.png` : '/sasa.png';

  const allSkus = consignments.flatMap((c) => c.items.map((item) => item.sku));

  const [logoBase64, productImagesBySku, React, pdfBundle] = await Promise.all([
    convertImageForPDF(logoUrl),
    buildPdfProductImagesBySku(allSkus, inventory),
    import('react'),
    Promise.all([import('@react-pdf/renderer'), import('../components/ConsignmentPDF')]),
  ]);

  const logoSrc = normalizePdfLogoSrc(logoBase64, logoUrl);
  const [{ pdf }, { default: ConsignmentPDF }] = pdfBundle;

  const pdfDocument = React.createElement(ConsignmentPDF, {
    consignments,
    logoSrc,
    productImagesBySku,
    markItemOutcomes: Boolean(options.markItemOutcomes),
  });

  return pdf(pdfDocument as never).toBlob();
}

/** Download a single consignment note PDF. */
export async function downloadConsignmentPdf(
  consignment: Consignment,
  inventory: InventoryItem[],
  options: ConsignmentPdfOptions = {}
): Promise<void> {
  const blob = await buildConsignmentPdfBlob([consignment], inventory, options);
  triggerDownload(blob, `consignment-${safeFilePart(consignment.consignmentId)}.pdf`);
}

/**
 * One PDF with all selected consignments in order
 * (each consignación starts on a new page).
 */
export async function downloadCombinedConsignmentsPdf(
  consignments: Consignment[],
  inventory: InventoryItem[],
  options: ConsignmentPdfOptions = {}
): Promise<void> {
  const blob = await buildConsignmentPdfBlob(consignments, inventory, options);
  const stamp = new Date().toISOString().slice(0, 10);
  const name =
    consignments.length === 1
      ? `consignment-${safeFilePart(consignments[0].consignmentId)}.pdf`
      : `consignaciones-combinadas-${consignments.length}-${stamp}.pdf`;
  triggerDownload(blob, name);
}

/** Separate PDF per consignación, packaged as a ZIP. */
export async function downloadConsignmentsPdfsZip(
  consignments: Consignment[],
  inventory: InventoryItem[],
  options: ConsignmentPdfOptions = {}
): Promise<void> {
  if (consignments.length === 0) {
    throw new Error('No consignments to zip');
  }

  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const consignment of consignments) {
    const blob = await buildConsignmentPdfBlob([consignment], inventory, options);
    let base = `consignment-${safeFilePart(consignment.consignmentId) || consignment.id}.pdf`;
    if (usedNames.has(base)) {
      base = `consignment-${safeFilePart(consignment.consignmentId)}-${consignment.id.slice(0, 6)}.pdf`;
    }
    usedNames.add(base);
    zip.file(base, blob);
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(zipBlob, `consignaciones-pdfs-${consignments.length}-${stamp}.zip`);
}
