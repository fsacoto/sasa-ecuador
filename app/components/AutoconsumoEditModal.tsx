'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AutoconsumoLine, AutoconsumoNote, InventoryItem } from '../types';
import { useInventory } from '../context/InventoryContext';
import { useTranslation } from '../context/TranslationContext';
import { useDarkMode } from '../hooks/useDarkMode';
import { getAvailableStock } from '../utils/stockReservation';
import { filterSellableInventory, hasSellableStock } from '../utils/inventoryStock';
import { resolveSkuUnitCost } from '../utils/landedCostCalculation';
import { saveAutoconsumoEditWithStock } from '../utils/autoconsumoStock';
import ModalPortal from './ui/ModalPortal';
import DateInput from './ui/DateInput';
import AlertDialog from './ui/AlertDialog';

type EditLine = AutoconsumoLine & {
  maxQuantity: number;
  availableStock: number;
  imageUrl?: string;
};

export type AutoconsumoEditModalProps = {
  note: AutoconsumoNote;
  onClose: () => void;
  onSaved: () => void;
};

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AutoconsumoEditModal({ note, onClose, onSaved }: AutoconsumoEditModalProps) {
  const { inventory, purchaseOrders, additionalCosts, updateInventoryItem } = useInventory();
  const { t } = useTranslation();
  const darkMode = useDarkMode();

  const [recipient, setRecipient] = useState(note.recipient);
  const [notes, setNotes] = useState(note.notes || '');
  const [noteDate, setNoteDate] = useState(toDateInputValue(note.date));
  const [lines, setLines] = useState<EditLine[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alertDialog, setAlertDialog] = useState<{ open: boolean; title?: string; message: string }>({
    open: false,
    message: '',
  });

  const showAlert = (message: string, title?: string) => {
    setAlertDialog({ open: true, message, title });
  };

  useEffect(() => {
    const mapped: EditLine[] = (note.items || []).map((line) => {
      const inv = inventory.find((i) => i.sku === line.sku);
      const available = inv ? getAvailableStock(inv) : 0;
      // When editing, current qty on the note is already deducted from stock,
      // so max = available + current qty on this note.
      const currentQty = Math.max(0, Number(line.quantity) || 0);
      return {
        ...line,
        maxQuantity: available + currentQty,
        availableStock: available + currentQty,
        imageUrl: inv?.images?.[0],
      };
    });
    setLines(mapped);
  }, [note, inventory]);

  const resolveCost = (sku: string): number | null => {
    const { unitCost } = resolveSkuUnitCost(sku, inventory, purchaseOrders, additionalCosts);
    return unitCost;
  };

  const totalCost = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.lineCost) || 0), 0),
    [lines]
  );

  const filteredInventory = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const q = searchTerm.toLowerCase();
    return filterSellableInventory(inventory)
      .filter(
        (item) =>
          item.sku.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q)
      )
      .filter((item) => !lines.some((l) => l.sku === item.sku) || getAvailableStock(item) > 0)
      .slice(0, 10);
  }, [searchTerm, inventory, lines]);

  const addProduct = (product: InventoryItem) => {
    if (!hasSellableStock(product) && !lines.some((l) => l.sku === product.sku)) {
      showAlert(t('inventory.noSellableStock'), t('autoconsumo.alertTitle'));
      return;
    }
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.sku === product.sku);
      if (idx >= 0) {
        const next = [...prev];
        const row = next[idx];
        if (row.quantity >= row.maxQuantity) {
          showAlert(`${t('sales.cannotExceedStock')} ${row.maxQuantity}`, t('autoconsumo.alertTitle'));
          return prev;
        }
        const qty = row.quantity + 1;
        next[idx] = {
          ...row,
          quantity: qty,
          lineCost: row.unitCost != null ? row.unitCost * qty : 0,
        };
        return next;
      }
      const unitCost = resolveCost(product.sku);
      const available = getAvailableStock(product);
      return [
        ...prev,
        {
          sku: product.sku,
          description: product.description || product.name,
          line: product.line,
          category: product.category,
          quantity: 1,
          unitCost,
          lineCost: unitCost != null ? unitCost : 0,
          maxQuantity: available,
          availableStock: available,
          imageUrl: product.images?.[0],
        },
      ];
    });
    setSearchTerm('');
    setShowDropdown(false);
  };

  const handleQty = (index: number, quantity: number) => {
    setLines((prev) => {
      const next = [...prev];
      const item = next[index];
      const valid = Math.max(1, Math.min(quantity, item.maxQuantity || quantity));
      next[index] = {
        ...item,
        quantity: valid,
        lineCost: item.unitCost != null ? item.unitCost * valid : 0,
      };
      return next;
    });
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    if (!recipient.trim()) {
      showAlert(t('autoconsumo.pleaseEnterRecipient'), t('autoconsumo.validation'));
      return;
    }
    if (lines.length === 0) {
      showAlert(t('autoconsumo.pleaseAddProducts'), t('autoconsumo.validation'));
      return;
    }
    setSaving(true);
    try {
      const items: AutoconsumoLine[] = lines.map(
        ({ sku, description, quantity, unitCost, lineCost, line, category }) => ({
          sku,
          description,
          quantity,
          unitCost,
          lineCost,
          line,
          category,
        })
      );
      await saveAutoconsumoEditWithStock(
        note.id,
        note,
        {
          recipient: recipient.trim(),
          notes: notes.trim() || undefined,
          date: new Date(`${noteDate}T12:00:00`),
          items,
          totalCost,
        },
        inventory,
        updateInventoryItem
      );
      onSaved();
      onClose();
    } catch (error) {
      console.error('Error editing autoconsumo:', error);
      const msg = error instanceof Error ? error.message : t('autoconsumo.errorUpdating');
      showAlert(msg, 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal>
      <div
        className={`sasa-modal-root ${darkMode ? 'sasa-modal-dark' : ''} sasa-modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm`}
        role="dialog"
        aria-modal="true"
        onClick={onClose}
      >
        <div
          className="sasa-modal-panel max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-[#515151]">
                {t('autoconsumo.editTitle')} · {note.noteNumber}
              </h3>
              <p className="mt-1 text-sm text-gray-500">{t('autoconsumo.editHint')}</p>
            </div>
            <button type="button" onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-600">
              ×
            </button>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('autoconsumo.recipient')} *
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('autoconsumo.date')}</label>
              <DateInput
                value={noteDate}
                onChange={setNoteDate}
                inputClassName="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm flex items-center gap-2"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('autoconsumo.notes')}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="relative mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('sales.searchSku')}</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              placeholder={t('sales.searchSkuPlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            {showDropdown && filteredInventory.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg">
                {filteredInventory.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProduct(product)}
                    className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <span className="font-mono font-semibold text-[#515151]">{product.sku}</span>
                    <span className="truncate text-gray-600">{product.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mb-4 overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">{t('sales.sku')}</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">
                    {t('sales.description')}
                  </th>
                  <th className="px-3 py-2 text-center text-xs uppercase text-gray-500">
                    {t('sales.quantity')}
                  </th>
                  <th className="px-3 py-2 text-right text-xs uppercase text-gray-500">
                    {t('autoconsumo.lineCost')}
                  </th>
                  <th className="px-3 py-2 text-center text-xs uppercase text-gray-500">
                    {t('sales.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((item, index) => (
                  <tr key={item.sku}>
                    <td className="px-3 py-2 font-mono text-xs">{item.sku}</td>
                    <td className="px-3 py-2">{item.description}</td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        min={1}
                        max={item.maxQuantity || undefined}
                        value={item.quantity}
                        onChange={(e) => handleQty(index, parseInt(e.target.value, 10) || 1)}
                        className="w-16 rounded border border-gray-300 px-1 py-1 text-center"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">${item.lineCost.toFixed(2)}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(index)}
                        className="text-sm font-medium text-red-600 hover:text-red-700"
                      >
                        {t('sales.remove')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mb-4 flex justify-between text-sm">
            <span className="text-gray-600">{t('autoconsumo.totalExpense')}</span>
            <span className="font-bold tabular-nums">${totalCost.toFixed(2)}</span>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-[#515151] px-4 py-2 text-sm font-medium text-white hover:bg-[#000000] disabled:opacity-60"
            >
              {saving ? t('common.loading') : t('autoconsumo.saveChanges')}
            </button>
          </div>
        </div>
      </div>

      <AlertDialog
        open={alertDialog.open}
        title={alertDialog.title}
        message={alertDialog.message}
        onClose={() => setAlertDialog({ open: false, message: '' })}
      />
    </ModalPortal>
  );
}
