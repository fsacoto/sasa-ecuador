// Isolated PDF generation utility to avoid Turbopack chunk loading issues
// This file should only be imported dynamically

import type { InventoryItem, PurchaseOrder, Supplier } from '../types';
import type React from 'react';

export interface GenerateCatalogPDFParams {
  products: InventoryItem[];
  catalogTitle?: string;
  includeStock: boolean;
  itemsPerPage: number;
  orientation: 'landscape' | 'portrait';
  fileName: string;
}

export async function generateCatalogPDF(params: GenerateCatalogPDFParams): Promise<void> {
  const { products, catalogTitle, includeStock, itemsPerPage, orientation, fileName } = params;

  // Import image converter
  const { convertImageForPDF } = await import('./imageConverter');

  // Convert images right before generating PDF
  const convertedProducts = await Promise.all(
    products.map(async (product) => {
      if (!product.images || product.images.length === 0) {
        return product;
      }

      // Convert each image to base64
      const convertedImages = await Promise.allSettled(
        product.images.map(img => convertImageForPDF(img))
      );

      // Filter out failed conversions but keep successful ones
      const validImages = convertedImages
        .filter((result): result is PromiseFulfilledResult<string | null> => 
          result.status === 'fulfilled' && result.value !== null
        )
        .map(result => result.value as string);

      return {
        ...product,
        images: validImages,
      };
    })
  );

  // Dynamically import PDF components - import in sequence to help with chunk loading
  // Wait a tick to ensure previous operations complete
  await new Promise(resolve => setTimeout(resolve, 0));
  
  // Import React first
  const React = await import('react');
  
  // Import @react-pdf/renderer - this is the problematic import
  // Try to import it with a small delay to avoid chunk loading race conditions
  let reactPdfRenderer;
  try {
    reactPdfRenderer = await import('@react-pdf/renderer');
  } catch (err) {
    console.error('Failed to load @react-pdf/renderer:', err);
    // Retry once after a short delay
    await new Promise(resolve => setTimeout(resolve, 100));
    reactPdfRenderer = await import('@react-pdf/renderer');
  }
  
  // Import the PDF component
  const ProductCatalogPDFModule = await import('../components/ProductCatalogPDF');
  
  const { pdf } = reactPdfRenderer;
  const ProductCatalogPDF = ProductCatalogPDFModule.default;

  // Create PDF document using React.createElement to avoid JSX transformation issues
  const pdfDocument = React.createElement(ProductCatalogPDF, {
    products: convertedProducts,
    catalogTitle,
    includeStock,
    itemsPerPage,
    orientation,
  } as React.ComponentProps<typeof ProductCatalogPDF>);

  // Generate blob - cast to any to avoid type issues with React PDF
  const instance = pdf(pdfDocument as any);
  const blob = await instance.toBlob();

  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface GeneratePurchaseOrderVerificationPDFParams {
  orders: PurchaseOrder[];
  supplier: Supplier | null;
  fileName: string;
}

export async function generatePurchaseOrderVerificationPDF(params: GeneratePurchaseOrderVerificationPDFParams): Promise<void> {
  const { orders, supplier, fileName } = params;

  // Dynamically import PDF components
  await new Promise(resolve => setTimeout(resolve, 0));
  
  // Import React first
  const React = await import('react');
  
  // Import @react-pdf/renderer
  let reactPdfRenderer;
  try {
    reactPdfRenderer = await import('@react-pdf/renderer');
  } catch (err) {
    console.error('Failed to load @react-pdf/renderer:', err);
    // Retry once after a short delay
    await new Promise(resolve => setTimeout(resolve, 100));
    reactPdfRenderer = await import('@react-pdf/renderer');
  }
  
  // Import the PDF component
  const PurchaseOrderVerificationPDFModule = await import('../components/PurchaseOrderVerificationPDF');
  
  const { pdf } = reactPdfRenderer;
  const PurchaseOrderVerificationPDF = PurchaseOrderVerificationPDFModule.default;

  // Create PDF document
  const pdfDocument = React.createElement(PurchaseOrderVerificationPDF, {
    orders,
    supplier,
  } as React.ComponentProps<typeof PurchaseOrderVerificationPDF>);

  // Generate blob - cast to any to avoid type issues with React PDF
  const instance = pdf(pdfDocument as any);
  const blob = await instance.toBlob();

  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

