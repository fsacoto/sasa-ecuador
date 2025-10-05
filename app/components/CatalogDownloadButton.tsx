'use client';

import { useState, useEffect } from 'react';
import { InventoryItem } from '../types';

interface CatalogDownloadButtonProps {
  products: InventoryItem[];
  catalogTitle: string;
  includeStock: boolean;
  itemsPerPage: number;
  fileName: string;
}

export default function CatalogDownloadButton({
  products,
  catalogTitle,
  includeStock,
  itemsPerPage,
  fileName,
}: CatalogDownloadButtonProps) {
  const [isClient, setIsClient] = useState(false);
  const [PDFDownloadLink, setPDFDownloadLink] = useState<React.ComponentType<any> | null>(null);
  const [ProductCatalogPDF, setProductCatalogPDF] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    setIsClient(true);
    // Dynamically import PDF components only on client side
    import('@react-pdf/renderer').then((module) => {
      setPDFDownloadLink(() => module.PDFDownloadLink);
    });
    import('./ProductCatalogPDF').then((module) => {
      setProductCatalogPDF(() => module.default);
    });
  }, []);

  if (!isClient || !PDFDownloadLink || !ProductCatalogPDF) {
    return (
      <button
        disabled
        className="flex-1 bg-gray-300 text-gray-500 px-6 py-3 rounded-xl font-medium cursor-wait"
      >
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading...
        </span>
      </button>
    );
  }

  return (
    <PDFDownloadLink
      document={
        <ProductCatalogPDF
          products={products}
          catalogTitle={catalogTitle}
          includeStock={includeStock}
          itemsPerPage={itemsPerPage}
        />
      }
      fileName={fileName}
      className="flex-1 bg-[#4f0c1b] hover:bg-[#3d0a15] text-white px-6 py-3 rounded-xl transition-all font-medium shadow-sm hover:shadow active:scale-95 text-center"
    >
      {({ loading }: { loading: boolean }) =>
        loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Generating...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download PDF Catalog
          </span>
        )
      }
    </PDFDownloadLink>
  );
}
