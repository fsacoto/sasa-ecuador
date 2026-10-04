'use client';

import { useMemo, useState } from 'react';
import type { Client, Consignment, InventoryItem, SalesInvoice } from '../types';
import { useTranslation } from '../context/TranslationContext';
import { useDarkMode } from '../hooks/useDarkMode';
import POModalShell from './ui/POModalShell';
import { formatDateDMY } from '../utils/formatDate';
import { normalizeSalePrice } from '../utils/salePrice';
import {
  getAvailableStock,
  getConsignmentStock,
  getOpenConsignmentsForSku,
  getOpenReservationNotesForSku,
  getReservedStock,
} from '../utils/stockReservation';

export type DuplicateMode = 'all' | 'returned';

export type DuplicateDraftItem = {
  sku: string;
  description: string;
  quantity: number;
  line?: string;
  category?: string;
  unitPriceInput: string;
  imageUrl?: string;
};

export type DuplicateConflict = {
  sku: string;
  description: string;
  requested: number;
  available: number;
  reserved: number;
  onConsignment: number;
  noteLabels: string;
  consignmentLabels: string;
  reason: 'missing' | 'insufficient';
};

interface ConsignmentDuplicateModalProps {
  consignments: Consignment[];
  clients: Client[];
  inventory: InventoryItem[];
  openInvoices: SalesInvoice[];
  submitting?: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    source: Consignment;
    client: Client;
    mode: DuplicateMode;
    items: DuplicateDraftItem[];
    conflicts: DuplicateConflict[];
    createOnlyAvailable: boolean;
  }) => void | Promise<void>;
}

function formatTemplate(template: string, vars: Record<string, string>) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

function statusLabel(
  status: Consignment['status'],
  t: (key: string) => string
): string {
  if (status === 'Open') return t('consignments.statusOpen');
  if (status === 'Partially Closed') return t('consignments.statusPartiallyClosed');
  return t('consignments.statusClosed');
}

function qtyForMode(item: Consignment['items'][number], mode: DuplicateMode): number {
  if (mode === 'returned') {
    return Math.max(0, Math.floor(Number(item.quantityReturned) || 0));
  }
  return Math.max(0, Math.floor(Number(item.quantityDelivered) || 0));
}

export default function ConsignmentDuplicateModal({
  consignments,
  clients,
  inventory,
  openInvoices,
  submitting = false,
  onClose,
  onConfirm,
}: ConsignmentDuplicateModalProps) {
  const { t } = useTranslation();
  const darkMode = useDarkMode();
  const [search, setSearch] = useState('');
  const [clientFilterId, setClientFilterId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<DuplicateMode>('all');
  const [createOnlyAvailable, setCreateOnlyAvailable] = useState(false);

  const sorted = useMemo(() => {
    return [...consignments].sort((a, b) => {
      const da = a.dateCreated instanceof Date ? a.dateCreated : new Date(a.dateCreated);
      const db = b.dateCreated instanceof Date ? b.dateCreated : new Date(b.dateCreated);
      return db.getTime() - da.getTime();
    });
  }, [consignments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((c) => {
      if (clientFilterId && c.clientId !== clientFilterId) return false;
      if (!q) return true;
      return (
        c.consignmentId.toLowerCase().includes(q) ||
        c.clientName.toLowerCase().includes(q) ||
        (c.clientAddress || '').toLowerCase().includes(q)
      );
    });
  }, [sorted, search, clientFilterId]);

  const selected = useMemo(
    () => sorted.find((c) => c.id === selectedId) ?? null,
    [sorted, selectedId]
  );

  const client = useMemo(() => {
    if (!selected) return null;
    return clients.find((c) => c.id === selected.clientId) ?? null;
  }, [clients, selected]);

  const preview = useMemo(() => {
    if (!selected) {
      return {
        requestedItems: [] as DuplicateDraftItem[],
        okItems: [] as DuplicateDraftItem[],
        conflicts: [] as DuplicateConflict[],
      };
    }

    const invBySku = new Map(inventory.map((item) => [item.sku.trim(), item] as const));
    const requestedItems: DuplicateDraftItem[] = [];
    const okItems: DuplicateDraftItem[] = [];
    const conflicts: DuplicateConflict[] = [];

    for (const line of selected.items || []) {
      const qty = qtyForMode(line, mode);
      if (qty <= 0) continue;

      const sku = (line.sku || '').trim();
      if (!sku) continue;

      const unitPrice = normalizeSalePrice(line.unitPrice);
      const inv = invBySku.get(sku);
      const draft: DuplicateDraftItem = {
        sku,
        description: line.description || inv?.description || inv?.name || sku,
        quantity: qty,
        line: line.line || inv?.line,
        category: line.category || inv?.category,
        unitPriceInput: unitPrice != null ? unitPrice.toFixed(2) : '',
        imageUrl: inv?.images?.[0],
      };
      requestedItems.push(draft);

      const available = inv ? getAvailableStock(inv) : 0;
      const reserved = inv ? getReservedStock(inv) : 0;
      const onConsignment = inv ? getConsignmentStock(inv) : 0;
      const notes = getOpenReservationNotesForSku(openInvoices, sku);
      const noteLabels = notes.map((n) => `${n.invoiceNumber} (${n.quantity})`).join(', ');
      const otherConsignments = getOpenConsignmentsForSku(consignments, sku);
      const consignmentLabels = otherConsignments
        .map((c) => `${c.consignmentId} (${c.quantity})`)
        .join(', ');

      if (!inv || available < qty) {
        conflicts.push({
          sku,
          description: draft.description,
          requested: qty,
          available,
          reserved,
          onConsignment,
          noteLabels,
          consignmentLabels,
          reason: !inv ? 'missing' : 'insufficient',
        });
      } else {
        okItems.push(draft);
      }
    }

    return { requestedItems, okItems, conflicts };
  }, [selected, mode, inventory, openInvoices, consignments]);

  const totalRequestedUnits = preview.requestedItems.reduce((s, i) => s + i.quantity, 0);
  const totalOkUnits = preview.okItems.reduce((s, i) => s + i.quantity, 0);
  const hasConflicts = preview.conflicts.length > 0;
  const hasOkItems = preview.okItems.length > 0;
  const canSubmit =
    Boolean(selected && client) &&
    preview.requestedItems.length > 0 &&
    (!hasConflicts || (createOnlyAvailable && hasOkItems));

  const handlePrimaryClick = async () => {
    if (!canSubmit || !selected || !client || submitting) return;

    const items = hasConflicts ? preview.okItems : preview.requestedItems;
    if (items.length === 0) return;

    await onConfirm({
      source: selected,
      client,
      mode,
      items,
      conflicts: preview.conflicts,
      createOnlyAvailable: hasConflicts && createOnlyAvailable,
    });
  };

  const modeTile = (id: DuplicateMode, label: string, hint: string) => {
    const active = mode === id;
    return (
      <button
        type="button"
        onClick={() => {
          setMode(id);
          setCreateOnlyAvailable(false);
        }}
        disabled={submitting}
        className={`rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
          active
            ? 'border-[#515151] bg-[#515151]/5 ring-1 ring-[#515151]/25'
            : darkMode
              ? 'border-white/15 hover:bg-white/5'
              : 'border-gray-200 hover:bg-gray-50'
        }`}
      >
        <div className="text-sm font-semibold text-gray-900">{label}</div>
        <div className="mt-0.5 text-xs text-gray-500">{hint}</div>
      </button>
    );
  };

  return (
    <POModalShell
      title={t('consignments.duplicateModalTitle')}
      titleId="consignment-duplicate-modal-title"
      maxWidthClass="max-w-4xl"
      onClose={submitting ? () => undefined : onClose}
      headerExtra={
        <p className="mt-1 text-sm text-gray-500">{t('consignments.duplicateModalIntro')}</p>
      }
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {modeTile(
            'all',
            t('consignments.duplicateModeAll'),
            t('consignments.duplicateModeAllHint')
          )}
          {modeTile(
            'returned',
            t('consignments.duplicateModeReturned'),
            t('consignments.duplicateModeReturnedHint')
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
              {t('consignments.printModalSearch')}
            </label>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('consignments.printModalSearchPh')}
              disabled={submitting}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#515151] disabled:opacity-60"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
              {t('consignments.client')}
            </label>
            <select
              value={clientFilterId}
              onChange={(e) => setClientFilterId(e.target.value)}
              disabled={submitting}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-[#515151] disabled:opacity-60"
            >
              <option value="">{t('salesNotes.allClients')}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="min-h-[200px] overflow-hidden rounded-xl border border-gray-200">
          <div className="max-h-[min(32vh,280px)] min-h-[200px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-gray-500">
                {consignments.length === 0
                  ? t('consignments.noConsignments')
                  : t('consignments.printModalNoMatch')}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100" role="listbox">
                {filtered.map((c) => {
                  const checked = selectedId === c.id;
                  const units =
                    mode === 'returned'
                      ? c.items.reduce((sum, item) => sum + (Number(item.quantityReturned) || 0), 0)
                      : c.items.reduce((sum, item) => sum + (Number(item.quantityDelivered) || 0), 0);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={checked}
                        disabled={submitting}
                        onClick={() => {
                          setSelectedId(c.id);
                          setCreateOnlyAvailable(false);
                        }}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                          checked
                            ? 'bg-[#515151]/8'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            checked
                              ? 'border-[#515151] bg-[#515151]'
                              : 'border-gray-300 bg-white'
                          }`}
                          aria-hidden
                        >
                          {checked ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-white" />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-mono text-sm font-semibold text-[#515151]">
                              {c.consignmentId}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatDateDMY(c.dateCreated)}
                            </span>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                              {statusLabel(c.status, t)}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-sm text-gray-900">{c.clientName}</span>
                          <span className="mt-0.5 block text-xs text-gray-500">
                            {formatTemplate(t('consignments.printModalUnits'), {
                              count: String(units),
                            })}
                            {mode === 'returned'
                              ? ` · ${t('consignments.duplicateReturnedUnitsHint')}`
                              : ` · ${t('consignments.duplicateAllUnitsHint')}`}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {selected ? (
          <div className="sasa-modal-section space-y-3 rounded-xl border border-gray-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {t('consignments.duplicatePreviewTitle')}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {formatTemplate(t('consignments.duplicatePreviewSummary'), {
                    consignmentId: selected.consignmentId,
                    skus: String(preview.requestedItems.length),
                    units: String(totalRequestedUnits),
                  })}
                </p>
              </div>
              {!client ? (
                <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
                  {t('consignments.duplicateClientMissing')}
                </p>
              ) : null}
            </div>

            {preview.requestedItems.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                {mode === 'returned'
                  ? t('consignments.duplicateNoReturnedItems')
                  : t('consignments.duplicateNoItems')}
              </p>
            ) : (
              <>
                <div className="max-h-[180px] overflow-y-auto rounded-lg border border-gray-100">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">{t('consignments.sku')}</th>
                        <th className="px-3 py-2 text-left font-medium">
                          {t('consignments.description')}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t('consignments.quantity')}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t('consignments.available')}
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          {t('consignments.status')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.requestedItems.map((item) => {
                        const conflict = preview.conflicts.find((c) => c.sku === item.sku);
                        const inv = inventory.find((i) => i.sku === item.sku);
                        const available = inv ? getAvailableStock(inv) : 0;
                        return (
                          <tr
                            key={item.sku}
                            className={conflict ? 'bg-red-50/60' : 'bg-white'}
                          >
                            <td className="px-3 py-2 font-mono text-xs font-semibold text-[#515151]">
                              {item.sku}
                            </td>
                            <td className="max-w-[220px] truncate px-3 py-2 text-gray-700">
                              {item.description}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                              {item.quantity}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                              {available}
                            </td>
                            <td className="px-3 py-2">
                              {conflict ? (
                                <span className="text-xs font-medium text-red-700">
                                  {t('consignments.duplicateLineConflict')}
                                </span>
                              ) : (
                                <span className="text-xs font-medium text-emerald-700">
                                  {t('consignments.duplicateLineOk')}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {hasConflicts ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm font-semibold text-red-900">
                      {formatTemplate(t('consignments.duplicateConflictsTitle'), {
                        count: String(preview.conflicts.length),
                      })}
                    </p>
                    <p className="mt-1 text-xs text-red-800">
                      {t('consignments.duplicateConflictsIntro')}
                    </p>
                    <ul className="mt-3 space-y-2">
                      {preview.conflicts.map((c) => (
                        <li
                          key={c.sku}
                          className="rounded-lg border border-red-200/80 bg-white/70 px-3 py-2 text-xs text-red-900"
                        >
                          <div className="font-mono font-semibold">{c.sku}</div>
                          <div className="mt-0.5 text-red-800/90">{c.description}</div>
                          <div className="mt-1.5 space-y-0.5 text-red-800">
                            <div>
                              {c.reason === 'missing'
                                ? t('consignments.duplicateConflictMissing')
                                : formatTemplate(t('consignments.duplicateConflictInsufficient'), {
                                    requested: String(c.requested),
                                    available: String(c.available),
                                  })}
                            </div>
                            {c.reserved > 0 ? (
                              <div>
                                {formatTemplate(t('consignments.duplicateConflictReserved'), {
                                  reserved: String(c.reserved),
                                  notes: c.noteLabels || '—',
                                })}
                              </div>
                            ) : null}
                            {c.onConsignment > 0 ? (
                              <div>
                                {formatTemplate(t('consignments.duplicateConflictOnConsignment'), {
                                  qty: String(c.onConsignment),
                                  consignments: c.consignmentLabels || '—',
                                })}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>

                    {hasOkItems ? (
                      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-red-200 bg-white px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={createOnlyAvailable}
                          onChange={(e) => setCreateOnlyAvailable(e.target.checked)}
                          disabled={submitting}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[#515151] focus:ring-[#515151]"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900">
                            {formatTemplate(t('consignments.duplicateCreateOnlyAvailable'), {
                              skus: String(preview.okItems.length),
                              units: String(totalOkUnits),
                            })}
                          </span>
                          <span className="mt-0.5 block text-xs text-gray-500">
                            {t('consignments.duplicateCreateOnlyAvailableHint')}
                          </span>
                        </span>
                      </label>
                    ) : (
                      <p className="mt-3 text-xs font-medium text-red-800">
                        {t('consignments.duplicateNoAvailableItems')}
                      </p>
                    )}

                    {!createOnlyAvailable && hasOkItems ? (
                      <p className="mt-3 text-xs text-amber-900">
                        {t('consignments.duplicateMustResolveConflicts')}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                    {t('consignments.duplicateNoConflicts')}
                  </p>
                )}
              </>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handlePrimaryClick()}
            disabled={submitting || !canSubmit}
            className="rounded-lg bg-[#515151] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#000000] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? t('consignments.creatingConsignment')
              : t('consignments.duplicateCreateButton')}
          </button>
        </div>
      </div>
    </POModalShell>
  );
}
