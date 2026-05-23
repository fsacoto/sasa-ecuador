'use client';

import { useMemo, useState } from 'react';
import type { PurchaseOrder, InventoryItem } from '../types';
import { attachBarcodeToPurchaseOrderIfNeeded } from '../utils/syncUpdates';
import { isValidBarcodeInput } from '../utils/barcodeGenerator';
import {
  findInventoryForPurchaseOrder,
  resolveBarcodeUrlForPrint,
} from '../utils/barcodePrint';

interface PurchaseOrderBarcodeCellProps {
  order: PurchaseOrder;
  purchaseOrders: PurchaseOrder[];
  inventory: InventoryItem[];
  updatePurchaseOrder: (id: string, updates: Partial<PurchaseOrder>) => Promise<void>;
  labels: {
    generate: string;
    regenerate: string;
    alt: string;
    needSku: string;
    failed: string;
  };
  /** `cell` = dentro de `<table>` como `<td>`. `block` = bloque en formulario u otro layout. */
  variant?: 'cell' | 'block';
}

export default function PurchaseOrderBarcodeCell({
  order,
  purchaseOrders,
  inventory,
  updatePurchaseOrder,
  labels,
  variant = 'cell',
}: PurchaseOrderBarcodeCellProps) {
  const [loading, setLoading] = useState(false);

  const live = useMemo(() => {
    const fromList = purchaseOrders.find((o) => o.id === order.id);
    if (!fromList) return order;
    return { ...fromList, ...order };
  }, [purchaseOrders, order]);

  const displayUrl = useMemo(() => {
    const inv = findInventoryForPurchaseOrder(live, inventory);
    return resolveBarcodeUrlForPrint(live, inv, purchaseOrders);
  }, [live, inventory, purchaseOrders]);

  const skuOk = isValidBarcodeInput(live.sku);

  const run = async (e: React.MouseEvent, forceRegenerate: boolean) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isValidBarcodeInput(live.sku)) {
      alert(labels.needSku);
      return;
    }
    setLoading(true);
    try {
      const result = await attachBarcodeToPurchaseOrderIfNeeded(
        live,
        updatePurchaseOrder,
        inventory,
        forceRegenerate ? { forceRegenerate: true } : undefined,
        purchaseOrders
      );
      if (!resolveBarcodeUrlForPrint(result, findInventoryForPurchaseOrder(result, inventory), purchaseOrders)) {
        alert(labels.failed);
      }
    } catch (err) {
      console.error(err);
      alert(labels.failed);
    } finally {
      setLoading(false);
    }
  };

  const inner = (
    <div className="flex flex-col items-center gap-1.5 min-w-[5.5rem]">
      {displayUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt={labels.alt}
            className="h-10 w-auto max-w-[7rem] object-contain"
          />
          <button
            type="button"
            disabled={loading}
            onClick={(e) => run(e, true)}
            className="sasa-barcode-regenerate-btn text-[10px] font-medium text-[#515151] hover:text-black underline disabled:opacity-50"
          >
            {loading ? '…' : labels.regenerate}
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={loading || !skuOk}
          onClick={(e) => run(e, false)}
          className="rounded-md border border-dashed border-gray-300 px-2 py-1.5 text-[10px] font-medium text-gray-600 hover:border-[#515151] hover:text-[#515151] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? '…' : labels.generate}
        </button>
      )}
    </div>
  );

  if (variant === 'block') {
    return (
      <div className="flex justify-center py-1" onClick={(e) => e.stopPropagation()}>
        {inner}
      </div>
    );
  }

  return (
    <td className="px-3 py-3 text-center align-middle" onClick={(e) => e.stopPropagation()}>
      {inner}
    </td>
  );
}
