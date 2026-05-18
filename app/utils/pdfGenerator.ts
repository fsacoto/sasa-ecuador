// Isolated PDF generation utility to avoid Turbopack chunk loading issues
// This file should only be imported dynamically

import type { PurchaseOrder, Supplier } from '../types';
import type React from 'react';

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

