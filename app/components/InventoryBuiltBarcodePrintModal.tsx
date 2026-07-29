'use client';

import { useMemo, useState } from 'react';
import type { InventoryItem } from '../types';
import { useTranslation } from '../context/TranslationContext';
import POModalShell from './ui/POModalShell';
import {
  buildInventoryBarcodePrintItems,
  labelCountForInventoryFullPrint,
} from '../utils/barcodePrint';

type PrintMode = 'full' | 'one-per-item';

type Props = {
  items: InventoryItem[];
  onClose: () => void;
  onPrint: (
    items: Array<{ order: null; inventoryItem: InventoryItem; quantity: number }>,
    printMode: PrintMode
  ) => void | Promise<void>;
};

export default function InventoryBuiltBarcodePrintModal({ items, onClose, onPrint }: Props) {
  const { t } = useTranslation();
  const [printMode, setPrintMode] = useState<PrintMode>('full');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalLabels = useMemo(() => {
    return items.reduce((sum, item) => {
      return sum + (printMode === 'one-per-item' ? 1 : labelCountForInventoryFullPrint(item));
    }, 0);
  }, [items, printMode]);

  const handlePrint = async () => {
    if (items.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const payload = buildInventoryBarcodePrintItems(items, printMode);
      await onPrint(payload, printMode);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <POModalShell
      title={t('inventory.printBuiltBarcodesTitle') || 'Imprimir códigos de barras'}
      titleId="inventory-built-barcode-print-title"
      maxWidthClass="max-w-lg"
      onClose={onClose}
    >
      <div className="space-y-4 p-4">
        <p className="text-sm text-gray-600">
          {(
            t('inventory.printBuiltBarcodesIntro') ||
            'Se imprimirán etiquetas 40×20 mm para {count} artículo(s) seleccionado(s).'
          ).replace('{count}', String(items.length))}
        </p>

        <div className="sasa-modal-section max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-3">
          {items.map((item) => (
            <div key={item.id} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-mono font-medium text-[#515151]">{item.sku}</span>
              <span className="truncate text-gray-600">{item.name || item.description}</span>
              <span className="shrink-0 tabular-nums text-gray-500">
                {printMode === 'one-per-item' ? 1 : labelCountForInventoryFullPrint(item)}×
              </span>
            </div>
          ))}
        </div>

        <div className="sasa-modal-section space-y-1.5 p-4" role="radiogroup" aria-label="Print mode">
          <p className="mb-2 text-sm font-semibold text-gray-900">
            {t('inventory.printBuiltBarcodesMode') || 'Cantidad de etiquetas'}
          </p>
          <label
            className={`sasa-modal-row flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
              printMode === 'full'
                ? 'border-[#515151] bg-[#515151]/5 ring-1 ring-[#515151]/25'
                : 'border-transparent hover:border-gray-200'
            }`}
          >
            <input
              type="radio"
              name="built-barcode-print-mode"
              checked={printMode === 'full'}
              onChange={() => setPrintMode('full')}
              className="mt-0.5 h-4 w-4 border-gray-300 text-[#515151] focus:ring-[#515151]"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">
                {t('inventory.printBuiltBarcodesFull') || 'Una por unidad en stock'}
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">
                {t('inventory.printBuiltBarcodesFullHint') ||
                  'Igual que el print completo de órdenes de compra.'}
              </span>
            </span>
          </label>
          <label
            className={`sasa-modal-row flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
              printMode === 'one-per-item'
                ? 'border-[#515151] bg-[#515151]/5 ring-1 ring-[#515151]/25'
                : 'border-transparent hover:border-gray-200'
            }`}
          >
            <input
              type="radio"
              name="built-barcode-print-mode"
              checked={printMode === 'one-per-item'}
              onChange={() => setPrintMode('one-per-item')}
              className="mt-0.5 h-4 w-4 border-gray-300 text-[#515151] focus:ring-[#515151]"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">
                {t('inventory.printBuiltBarcodesOne') || 'Una por artículo seleccionado'}
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">
                {t('inventory.printBuiltBarcodesOneHint') ||
                  'Una sola etiqueta por SKU, sin importar el stock.'}
              </span>
            </span>
          </label>
        </div>

        <p className="text-sm text-gray-700">
          {(
            t('inventory.printBuiltBarcodesTotal') ||
            'Total de etiquetas: {total}'
          ).replace('{total}', String(totalLabels))}
        </p>

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={isSubmitting || items.length === 0}
            className="rounded-lg bg-[#515151] px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {isSubmitting
              ? t('inventory.printBuiltBarcodesPrinting') || 'Generando…'
              : t('inventory.printBuiltBarcodesSubmit') || 'Imprimir'}
          </button>
        </div>
      </div>
    </POModalShell>
  );
}
