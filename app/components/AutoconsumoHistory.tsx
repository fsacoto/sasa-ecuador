'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AutoconsumoNote } from '../types';
import { getAllAutoconsumoNotes } from '../services/autoconsumoService';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';
import { useTranslation } from '../context/TranslationContext';
import { usePersistedFilterState } from '../hooks/usePersistedFilterState';
import { useDarkMode } from '../hooks/useDarkMode';
import { formatDateDMY } from '../utils/formatDate';
import AlertDialog from './ui/AlertDialog';
import DateInput from './ui/DateInput';
import MonthYearSelectEs from './ui/MonthYearSelectEs';
import TableSortIcon from './ui/TableSortIcon';
import {
  tableTheadClass,
  tableThAlignClass,
  tableThBaseClass,
  tableThLabelFlexClass,
  tableThSortableClass,
} from './ui/tableHeaderClass';
import { tableRowActionButtonClass } from './ui/tableRowActionClass';
import AutoconsumoDetailsModal from './AutoconsumoDetailsModal';
import AutoconsumoDeleteModal from './AutoconsumoDeleteModal';
import AutoconsumoEditModal from './AutoconsumoEditModal';

type SortKey = 'date' | 'noteNumber' | 'totalCost' | 'recipient';

export default function AutoconsumoHistory() {
  const { user, hasPermission } = useAuth();
  const { inventory } = useInventory();
  const { t } = useTranslation();
  const darkMode = useDarkMode();
  const userId = user?.id;

  const [rows, setRows] = useState<AutoconsumoNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedFilterState('autoconsumo', 'search', '', userId);
  const [dateFrom, setDateFrom] = usePersistedFilterState('autoconsumo', 'dateFrom', '', userId);
  const [dateTo, setDateTo] = usePersistedFilterState('autoconsumo', 'dateTo', '', userId);
  const [filterMonth, setFilterMonth] = usePersistedFilterState('autoconsumo', 'filterMonth', '', userId);
  const [sortKey, setSortKey] = usePersistedFilterState<SortKey>('autoconsumo', 'sortKey', 'date', userId);
  const [sortDir, setSortDir] = usePersistedFilterState<'asc' | 'desc'>(
    'autoconsumo',
    'sortDir',
    'desc',
    userId
  );
  const [showFilters, setShowFilters] = useState(false);

  const [detailsNote, setDetailsNote] = useState<AutoconsumoNote | null>(null);
  const [editNote, setEditNote] = useState<AutoconsumoNote | null>(null);
  const [deleteNote, setDeleteNote] = useState<AutoconsumoNote | null>(null);

  const [alertDialog, setAlertDialog] = useState<{ open: boolean; title?: string; message: string }>({
    open: false,
    message: '',
  });
  const showAlert = (message: string, title?: string) => {
    setAlertDialog({ open: true, message, title });
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAllAutoconsumoNotes();
      setRows(data);
    } catch (e) {
      console.error(e);
      showAlert(t('autoconsumo.loadError'), 'Error');
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = [...rows];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (n) =>
          n.noteNumber.toLowerCase().includes(q) ||
          n.recipient.toLowerCase().includes(q) ||
          n.notes?.toLowerCase().includes(q) ||
          n.items.some(
            (i) => i.sku.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
          )
      );
    }

    if (filterMonth) {
      const [y, m] = filterMonth.split('-').map(Number);
      list = list.filter((n) => n.date.getFullYear() === y && n.date.getMonth() + 1 === m);
    }

    if (dateFrom) {
      const from = new Date(`${dateFrom}T00:00:00`);
      list = list.filter((n) => n.date >= from);
    }
    if (dateTo) {
      const to = new Date(`${dateTo}T23:59:59`);
      list = list.filter((n) => n.date <= to);
    }

    const mult = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortKey === 'date') return mult * (a.date.getTime() - b.date.getTime());
      if (sortKey === 'totalCost') return mult * (a.totalCost - b.totalCost);
      if (sortKey === 'recipient') return mult * a.recipient.localeCompare(b.recipient);
      return mult * a.noteNumber.localeCompare(b.noteNumber);
    });

    return list;
  }, [rows, search, filterMonth, dateFrom, dateTo, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const canDelete = hasPermission('autoconsumo.delete') || hasPermission('autoconsumo.create');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">{t('autoconsumo.historyTitle')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('autoconsumo.historySubtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('autoconsumo.searchPlaceholder')}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              showFilters ? 'border-[#515151] bg-[#515151] text-white' : 'border-gray-300 text-gray-700'
            }`}
          >
            {t('inventory.filters')}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t('salesNotes.monthLabel') || 'Mes'}
              </label>
              <MonthYearSelectEs value={filterMonth} onChange={setFilterMonth} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t('salesNotes.dateFrom') || 'Desde'}
              </label>
              <DateInput
                value={dateFrom}
                onChange={setDateFrom}
                inputClassName="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm flex items-center gap-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t('salesNotes.dateTo') || 'Hasta'}
              </label>
              <DateInput
                value={dateTo}
                onChange={setDateTo}
                inputClassName="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm flex items-center gap-2"
              />
            </div>
          </div>
          {(filterMonth || dateFrom || dateTo || search) && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setFilterMonth('');
                  setDateFrom('');
                  setDateTo('');
                  setSearch('');
                }}
                className="text-sm font-medium text-[#515151] hover:text-black"
              >
                {t('inventory.clearAllFilters')}
              </button>
            </div>
          )}
        </div>
      )}

      <div
        className={`overflow-hidden rounded-xl border ${
          darkMode ? 'border-gray-700 bg-[#151515]' : 'border-gray-200 bg-white'
        }`}
      >
        {loading ? (
          <p className="p-8 text-center text-sm text-gray-500">{t('common.loading')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className={tableTheadClass}>
                <tr>
                  {(
                    [
                      ['noteNumber', t('autoconsumo.colNumber')],
                      ['recipient', t('autoconsumo.recipient')],
                      ['date', t('autoconsumo.date')],
                      ['totalCost', t('autoconsumo.totalExpense')],
                    ] as [SortKey, string][]
                  ).map(([key, label]) => (
                    <th key={key} className={`${tableThBaseClass} ${tableThAlignClass('left')}`}>
                      <button type="button" className={tableThSortableClass} onClick={() => toggleSort(key)}>
                        <span className={tableThLabelFlexClass('left')}>{label}</span>
                        <TableSortIcon columnKey={key} activeKey={sortKey} direction={sortDir} />
                      </button>
                    </th>
                  ))}
                  <th className={`${tableThBaseClass} ${tableThAlignClass('left')}`}>
                    {t('autoconsumo.colItems')}
                  </th>
                  <th className={`${tableThBaseClass} ${tableThAlignClass('right')}`}>
                    {t('sales.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                      {t('autoconsumo.noNotes')}
                    </td>
                  </tr>
                ) : (
                  filtered.map((note) => (
                    <tr key={note.id} className="border-t border-gray-100 hover:bg-gray-50/80">
                      <td className="px-3 py-2.5 font-mono font-medium text-gray-900">{note.noteNumber}</td>
                      <td className="px-3 py-2.5 text-gray-800">{note.recipient}</td>
                      <td className="px-3 py-2.5 tabular-nums text-gray-700">{formatDateDMY(note.date)}</td>
                      <td className="px-3 py-2.5 font-medium tabular-nums text-gray-900">
                        ${Number(note.totalCost || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-gray-600">
                        {note.items.reduce((s, i) => s + i.quantity, 0)} u. / {note.items.length} SKU
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            className={tableRowActionButtonClass}
                            onClick={() => setDetailsNote(note)}
                          >
                            {t('autoconsumo.viewDetails')}
                          </button>
                          <button
                            type="button"
                            className={tableRowActionButtonClass}
                            onClick={() => setEditNote(note)}
                          >
                            {t('common.edit') || 'Editar'}
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              className={`${tableRowActionButtonClass} text-red-700`}
                              onClick={() => setDeleteNote(note)}
                            >
                              {t('common.delete') || 'Eliminar'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailsNote && (
        <AutoconsumoDetailsModal
          note={detailsNote}
          inventory={inventory}
          onClose={() => setDetailsNote(null)}
        />
      )}
      {editNote && (
        <AutoconsumoEditModal
          note={editNote}
          onClose={() => setEditNote(null)}
          onSaved={() => void load()}
        />
      )}
      <AutoconsumoDeleteModal
        open={Boolean(deleteNote)}
        note={deleteNote}
        onClose={() => setDeleteNote(null)}
        onDeleted={() => void load()}
        onError={(msg) => showAlert(msg, 'Error')}
      />

      <AlertDialog
        open={alertDialog.open}
        title={alertDialog.title}
        message={alertDialog.message}
        onClose={() => setAlertDialog({ open: false, message: '' })}
      />
    </div>
  );
}
