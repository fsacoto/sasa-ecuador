'use client';

import { useMemo, useState } from 'react';
import type { Client, Consignment, InventoryItem } from '../types';
import { useTranslation } from '../context/TranslationContext';
import { useDarkMode } from '../hooks/useDarkMode';
import POModalShell from './ui/POModalShell';
import { formatDateDMY } from '../utils/formatDate';
import {
  downloadCombinedConsignmentsPdf,
  downloadConsignmentsPdfsZip,
} from '../utils/consignmentPdf';
import { downloadConsignmentsPrepLabelPdf } from '../utils/salesPrepLabelPdf';

type PrintTab = 'notes' | 'labels';
type PdfMode = 'combined' | 'zip';

interface ConsignmentPrintModalProps {
  consignments: Consignment[];
  clients: Client[];
  inventory: InventoryItem[];
  onClose: () => void;
  onError: (message: string) => void;
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

export default function ConsignmentPrintModal({
  consignments,
  clients,
  inventory,
  onClose,
  onError,
}: ConsignmentPrintModalProps) {
  const { t } = useTranslation();
  const darkMode = useDarkMode();
  const [tab, setTab] = useState<PrintTab>('notes');
  const [pdfMode, setPdfMode] = useState<PdfMode>('combined');
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [markItemOutcomes, setMarkItemOutcomes] = useState(false);
  const [busy, setBusy] = useState(false);

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
      if (clientId && c.clientId !== clientId) return false;
      if (!q) return true;
      return (
        c.consignmentId.toLowerCase().includes(q) ||
        c.clientName.toLowerCase().includes(q) ||
        (c.clientAddress || '').toLowerCase().includes(q)
      );
    });
  }, [sorted, search, clientId]);

  const selectedForPrint = useMemo(
    () => sorted.filter((c) => selectedIds.has(c.id)),
    [sorted, selectedIds]
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFiltered = () => {
    setSelectedIds((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        for (const c of filtered) next.delete(c.id);
        return next;
      }
      const next = new Set(prev);
      for (const c of filtered) next.add(c.id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleGenerate = async () => {
    if (selectedForPrint.length === 0 || busy) return;
    setBusy(true);
    try {
      if (tab === 'notes') {
        const pdfOptions = { markItemOutcomes };
        if (pdfMode === 'combined') {
          await downloadCombinedConsignmentsPdf(selectedForPrint, inventory, pdfOptions);
        } else {
          await downloadConsignmentsPdfsZip(selectedForPrint, inventory, pdfOptions);
        }
      } else {
        await downloadConsignmentsPrepLabelPdf(selectedForPrint);
      }
    } catch (error) {
      console.error('Consignment print modal error:', error);
      onError(
        tab === 'labels'
          ? t('consignments.prepLabelFailed')
          : t('consignments.errorGeneratingPdf')
      );
    } finally {
      setBusy(false);
    }
  };

  const tabBtn = (id: PrintTab, label: string, hint: string) => {
    const active = tab === id;
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        disabled={busy}
        className={`flex-1 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
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

  const generateLabel =
    tab === 'notes'
      ? pdfMode === 'combined'
        ? t('consignments.printModalGenerateCombined')
        : t('consignments.printModalGenerateZip')
      : t('consignments.printModalGenerateLabels');

  return (
    <POModalShell
      title={t('consignments.printModalTitle')}
      titleId="consignment-print-modal-title"
      maxWidthClass="max-w-4xl"
      onClose={busy ? () => undefined : onClose}
    >
      <div className="flex flex-col gap-4 p-5">
        <p className="text-sm text-gray-600">{t('consignments.printModalIntro')}</p>

        <div className="flex flex-col gap-2 sm:flex-row">
          {tabBtn(
            'notes',
            t('consignments.printModalTabNotes'),
            t('consignments.printModalTabNotesHint')
          )}
          {tabBtn(
            'labels',
            t('consignments.printModalTabLabels'),
            t('consignments.printModalTabLabelsHint')
          )}
        </div>

        {tab === 'notes' ? (
          <div className="sasa-modal-section rounded-xl border border-gray-200 p-4">
            <p className="mb-3 text-sm font-semibold text-gray-900">
              {t('consignments.printModalPdfFormat')}
            </p>
            <div className="space-y-1.5" role="radiogroup">
              {(
                [
                  {
                    value: 'combined' as const,
                    label: t('consignments.bulkPrintCombined'),
                    hint: t('consignments.bulkPrintCombinedHint'),
                  },
                  {
                    value: 'zip' as const,
                    label: t('consignments.bulkPrintZip'),
                    hint: t('consignments.bulkPrintZipHint'),
                  },
                ] as const
              ).map((opt) => {
                const selected = pdfMode === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                      selected
                        ? 'border-[#515151] bg-[#515151]/5 ring-1 ring-[#515151]/25'
                        : 'border-transparent hover:border-gray-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="consignment-pdf-mode"
                      value={opt.value}
                      checked={selected}
                      onChange={() => setPdfMode(opt.value)}
                      disabled={busy}
                      className="mt-0.5 h-4 w-4 shrink-0 border-gray-300 text-[#515151] focus:ring-[#515151]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900">{opt.label}</span>
                      <span className="mt-0.5 block text-xs text-gray-500">{opt.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <label
              className={`mt-3 flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                markItemOutcomes
                  ? 'border-[#515151] bg-[#515151]/5 ring-1 ring-[#515151]/25'
                  : 'border-transparent hover:border-gray-200'
              }`}
            >
              <input
                type="checkbox"
                checked={markItemOutcomes}
                onChange={(e) => setMarkItemOutcomes(e.target.checked)}
                disabled={busy}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[#515151] focus:ring-[#515151]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900">
                  {t('consignments.printModalMarkOutcomes')}
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  {t('consignments.printModalMarkOutcomesHint')}
                </span>
              </span>
            </label>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            {t('consignments.printModalLabelsInfo')}
          </div>
        )}

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
              disabled={busy}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#515151] disabled:opacity-60"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
              {t('consignments.client')}
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={busy}
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

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600">
            {formatTemplate(t('consignments.printModalSelectionSummary'), {
              selected: String(selectedForPrint.length),
              visible: String(filtered.length),
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleFiltered}
              disabled={busy || filtered.length === 0}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {allFilteredSelected
                ? t('consignments.printModalDeselectVisible')
                : t('consignments.printModalSelectVisible')}
            </button>
            {selectedForPrint.length > 0 ? (
              <button
                type="button"
                onClick={clearSelection}
                disabled={busy}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {t('consignments.clearSelection')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-[240px] overflow-hidden rounded-xl border border-gray-200">
          <div className="max-h-[min(42vh,360px)] min-h-[240px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-gray-500">
                {consignments.length === 0
                  ? t('consignments.noConsignments')
                  : t('consignments.printModalNoMatch')}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filtered.map((c) => {
                  const checked = selectedIds.has(c.id);
                  const units = c.items.reduce((sum, item) => sum + item.quantityDelivered, 0);
                  return (
                    <li key={c.id}>
                      <label
                        className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors ${
                          checked ? 'bg-[#515151]/[0.04]' : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(c.id)}
                          disabled={busy}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-[#515151] focus:ring-[#515151]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-[#515151]">
                              {c.consignmentId}
                            </span>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">
                              {statusLabel(c.status, t)}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-sm text-gray-900">{c.clientName}</span>
                          <span className="mt-0.5 block text-xs text-gray-500">
                            {formatDateDMY(c.dateCreated)}
                            {' · '}
                            {formatTemplate(t('consignments.printModalUnits'), {
                              count: String(units),
                            })}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={busy || selectedForPrint.length === 0}
            className="sasa-btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                {t('consignments.generatingPdf')}
              </>
            ) : (
              <>
                {generateLabel}
                {selectedForPrint.length > 0 ? (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                    {selectedForPrint.length}
                  </span>
                ) : null}
              </>
            )}
          </button>
        </div>
      </div>
    </POModalShell>
  );
}
