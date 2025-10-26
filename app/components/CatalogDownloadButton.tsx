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
  const [isClient, setIsClient] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [PDFDownloadLink, setPDFDownloadLink] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ProductCatalogPDF, setProductCatalogPDF] = useState<any>(null);
  const [convertedProducts, setConvertedProducts] = useState<InventoryItem[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
    // Dynamically import PDF components only on client
    const loadPDFComponents = async () => {
      try {
        const [pdfRenderer, productCatalogPDF] = await Promise.all([
          import('@react-pdf/renderer'),
          import('./ProductCatalogPDF')
        ]);
        
        if (pdfRenderer.PDFDownloadLink && productCatalogPDF.default) {
          setPDFDownloadLink(pdfRenderer.PDFDownloadLink);
          setProductCatalogPDF(productCatalogPDF.default);
        } else {
          throw new Error('PDF components not properly loaded');
        }
      } catch (error) {
        console.error('Error loading PDF components:', error);
        setError('Failed to load PDF generator');
      }
    };
    
    loadPDFComponents();
  }, []);

  // Convert WebP images to JPEG for PDF compatibility
  useEffect(() => {
    async function convertImages() {
      if (!products || products.length === 0) {
        setConvertedProducts([]);
        return;
      }

      setIsConverting(true);
      try {
        const converted = await Promise.all(
          products.map(async (product) => {
            if (!product.images || product.images.length === 0) {
              return product;
            }

            const convertedImages = await Promise.all(
              product.images.map(img => convertImageForPDF(img))
            );

            return {
              ...product,
              images: convertedImages.filter((img): img is string => img !== null),
            };
          })
        );

        setConvertedProducts(converted);
      } catch (error) {
        console.error('Error converting images:', error);
        setError('Failed to process images');
      } finally {
        setIsConverting(false);
      }
    }

    convertImages();
  }, [products]);

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

  if (!isClient || !PDFDownloadLink || !ProductCatalogPDF || isConverting) {
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
          {isConverting ? 'Converting...' : 'Loading PDF...'}
        </span>
      </button>
    );
  }

  try {
    return (
      <PDFDownloadLink
        document={
          <ProductCatalogPDF
            products={convertedProducts}
            catalogTitle={catalogTitle}
            includeStock={includeStock}
            itemsPerPage={itemsPerPage}
            orientation={orientation}
          />
        }
        fileName={fileName}
        className="px-3 py-1.5 bg-[#4f0c1b] hover:bg-[#3d0a15] text-white rounded-md transition-all font-medium shadow-sm hover:shadow-lg active:scale-95 text-center text-xs"
      >
        {({ loading }: { loading: boolean }) =>
          loading ? (
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
          )
        }
      </PDFDownloadLink>
    );
  } catch (error) {
    console.error('Error rendering PDF:', error);
    return (
      <button
        disabled
        className="px-3 py-1.5 bg-red-300 text-red-600 rounded-md font-medium cursor-not-allowed text-xs"
      >
        <span className="flex items-center justify-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          PDF Error
        </span>
      </button>
    );
  }
}