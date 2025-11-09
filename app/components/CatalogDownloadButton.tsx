'use client';

import { useState, useEffect } from 'react';
import { InventoryItem } from '../types';
import { convertImageForPDF } from '../utils/imageConverter';

interface CatalogDownloadButtonProps {
  products: InventoryItem[];
  catalogTitle: string;
  includeStock: boolean;
  itemsPerPage: number;
  orientation: 'landscape' | 'portrait';
  fileName: string;
}

export default function CatalogDownloadButton({
  products,
  catalogTitle,
  includeStock,
  itemsPerPage,
  orientation,
  fileName,
}: CatalogDownloadButtonProps) {
  const [isReady, setIsReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load PDF components on mount
  useEffect(() => {
    const loadComponents = async () => {
      try {
        // Just verify imports work - we'll use them when generating
        await Promise.all([
          import('@react-pdf/renderer'),
          import('./ProductCatalogPDF')
        ]);
        setIsReady(true);
      } catch (err) {
        console.error('Failed to load PDF components:', err);
        setError('Failed to load PDF generator');
      }
    };
    loadComponents();
  }, []);


  const handleDownload = async () => {
    if (!isReady || !products || products.length === 0) {
      return;
    }

    try {
      setIsGenerating(true);
      setError(null);

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

      // Dynamically import components
      const [{ pdf }, { default: ProductCatalogPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./ProductCatalogPDF')
      ]);

      // Create PDF document
      const pdfDocument = (
        <ProductCatalogPDF
          products={convertedProducts}
          catalogTitle={catalogTitle}
          includeStock={includeStock}
          itemsPerPage={itemsPerPage}
          orientation={orientation}
        />
      );

      // Generate blob
      const instance = pdf(pdfDocument);
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

    } catch (err) {
      console.error('Error generating PDF:', err);
      setError('Failed to generate PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  // Error state
  if (error) {
    return (
      <button
        disabled
        className="px-3 py-1.5 bg-red-300 text-red-600 rounded-md font-medium cursor-not-allowed text-xs"
      >
        <span className="flex items-center justify-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Error: {error}
        </span>
      </button>
    );
  }

  // Loading state
  if (!isReady) {
    return (
      <button
        disabled
        className="px-3 py-1.5 bg-gray-300 text-gray-500 rounded-md font-medium cursor-wait text-xs"
      >
        <span className="flex items-center justify-center gap-1">
          <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading...
        </span>
      </button>
    );
  }

  // No products
  if (!products || products.length === 0) {
    return (
      <button
        disabled
        className="px-3 py-1.5 bg-gray-300 text-gray-500 rounded-md font-medium cursor-not-allowed text-xs"
      >
        <span className="flex items-center justify-center gap-1">
          No products selected
        </span>
      </button>
    );
  }

  // Ready to generate
  return (
    <button
      onClick={handleDownload}
      disabled={isGenerating}
      className="px-3 py-1.5 bg-[#4f0c1b] hover:bg-[#3d0a15] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md transition-all font-medium shadow-sm hover:shadow-lg active:scale-95 text-center text-xs"
    >
      {isGenerating ? (
        <span className="flex items-center justify-center gap-1">
          <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Generating...
        </span>
      ) : (
        <span className="flex items-center justify-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Generate Catalog
        </span>
      )}
    </button>
  );
}

