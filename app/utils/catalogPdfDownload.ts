'use client';

import type { InventoryItem } from '../types';

export interface GenerateCatalogPDFParams {
  products: InventoryItem[];
  catalogTitle?: string;
  includeStock: boolean;
  itemsPerPage: number;
  orientation: 'landscape' | 'portrait';
  fileName: string;
}

/** Genera y descarga el catálogo PDF (import estático desde el botón; evita fallos de chunk Turbopack). */
export async function generateCatalogPDF(params: GenerateCatalogPDFParams): Promise<void> {
  const { products, catalogTitle, includeStock, itemsPerPage, orientation, fileName } = params;

  let convertedProducts = products;
  try {
    const { prepareInventoryItemsForCatalogPdf } = await import('./catalogPdfImages');
    convertedProducts = await prepareInventoryItemsForCatalogPdf(products);
  } catch (prepError) {
    console.error('[catalog PDF] image prep failed, continuing without photos:', prepError);
    convertedProducts = products.map((p) => ({ ...p, images: [] }));
  }

  const React = await import('react');

  let reactPdfRenderer;
  try {
    reactPdfRenderer = await import('@react-pdf/renderer');
  } catch (err) {
    console.error('Failed to load @react-pdf/renderer:', err);
    await new Promise((resolve) => setTimeout(resolve, 100));
    reactPdfRenderer = await import('@react-pdf/renderer');
  }

  const { default: ProductCatalogPDF } = await import('../components/ProductCatalogPDF');
  const { pdf } = reactPdfRenderer;

  const pdfDocument = React.createElement(ProductCatalogPDF, {
    products: convertedProducts,
    catalogTitle,
    includeStock,
    itemsPerPage,
    orientation,
  });

  const blob = await pdf(pdfDocument as never).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
