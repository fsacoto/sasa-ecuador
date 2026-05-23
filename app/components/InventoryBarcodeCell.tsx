'use client';

import { useState } from 'react';
import type { InventoryItem } from '../types';
import { isValidBarcodeInput } from '../utils/barcodeGenerator';

interface InventoryBarcodeCellProps {
  item: InventoryItem;
  isReadOnly?: boolean;
  onGenerate: (item: InventoryItem) => void | Promise<void>;
  labels: {
    generate: string;
    regenerate: string;
    alt: string;
    needSku: string;
    failed: string;
  };
}

/** Mismo formato visual que PurchaseOrderBarcodeCell (columna en tabla). */
export default function InventoryBarcodeCell({
  item,
  isReadOnly = false,
  onGenerate,
  labels,
}: InventoryBarcodeCellProps) {
  const [loading, setLoading] = useState(false);
  const skuOk = isValidBarcodeInput(item.sku);
  const displayUrl = (item.barcode || '').trim();

  const run = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isReadOnly) return;
    if (!skuOk) {
      alert(labels.needSku);
      return;
    }
    setLoading(true);
    try {
      await onGenerate(item);
    } catch (err) {
      console.error(err);
      alert(labels.failed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <td
      className="sasa-inventory-barcode-cell px-3 py-3 text-center align-middle"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col items-center gap-1.5 min-w-[5.5rem]">
        {displayUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayUrl}
              alt={labels.alt}
              className="h-10 w-auto max-w-[7rem] object-contain"
            />
            {!isReadOnly && (
              <button
                type="button"
                disabled={loading}
                onClick={run}
                className="sasa-barcode-regenerate-btn text-[10px] font-medium text-[#515151] underline hover:text-black disabled:opacity-50"
              >
                {loading ? '…' : labels.regenerate}
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={loading || !skuOk || isReadOnly}
            onClick={run}
            className="rounded-md border border-dashed border-gray-300 px-2 py-1.5 text-[10px] font-medium text-gray-600 hover:border-[#515151] hover:text-[#515151] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? '…' : labels.generate}
          </button>
        )}
      </div>
    </td>
  );
}
