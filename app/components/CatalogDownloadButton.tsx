'use client';

import { useState } from 'react';
import { InventoryItem } from '../types';
import { useTranslation } from '../context/TranslationContext';

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
  const { t } = useTranslation();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!products || products.length === 0) {
      return;
    }

    try {
      setIsGenerating(true);
      setError(null);

      const { generateCatalogPDF } = await import('../utils/pdfGenerator');

      await generateCatalogPDF({
        products,
        catalogTitle,
        includeStock,
        itemsPerPage,
        orientation,
        fileName,
      });
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError(t('inventory.catalog.catalogGenerationFailed'));
    } finally {
      setIsGenerating(false);
    }
  };

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
          {error}
        </span>
      </button>
    );
  }

  if (!products || products.length === 0) {
    return (
      <button
        disabled
        className="px-3 py-1.5 bg-gray-300 text-gray-500 rounded-md font-medium cursor-not-allowed text-xs"
      >
        <span className="flex items-center justify-center gap-1">
          {t('inventory.catalog.noProductsAvailable')}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={handleDownload}
      disabled={isGenerating}
      className="px-3 py-1.5 bg-[#515151] hover:bg-[#000000] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md transition-all font-medium shadow-sm hover:shadow-lg active:scale-95 text-center text-xs"
    >
      {isGenerating ? (
        <span className="flex items-center justify-center gap-1">
          <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          {t('inventory.catalog.generating')}
        </span>
      ) : (
        <span className="flex items-center justify-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {t('inventory.catalog.generateCatalog')}
        </span>
      )}
    </button>
  );
}
