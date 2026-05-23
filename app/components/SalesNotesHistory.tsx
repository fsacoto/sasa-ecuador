'use client';

import { useMemo, useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { SalesInvoice, type Client } from '../types';
import { getAllInvoices } from '../services/invoicesService';
import { getAllClients } from '../services/clientsService';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';
import { downloadSalesInvoicePdf } from '../utils/salesInvoicePdf';
import AlertDialog from './ui/AlertDialog';
import MonthYearSelectEs from './ui/MonthYearSelectEs';
import InvoiceEditModal from './InvoiceEditModal';
import SalesInvoiceDeleteModal from './SalesInvoiceDeleteModal';
import TableSortIcon from './ui/TableSortIcon';
import {
  tableTheadClass,
  tableThAlignClass,
  tableThBaseClass,
  tableThLabelFlexClass,
  tableThSortableClass,
  type TableThAlign,
} from './ui/tableHeaderClass';
import { tableRowActionButtonClass } from './ui/tableRowActionClass';
import { formatDateDMY, formatMonthYearLong } from '../utils/formatDate';
import { deliveryStatusBadgeClass, paymentStatusBadgeClass } from '../utils/invoiceStatusStyles';

const SESSION_TRACKING_FOCUS = 'sasa_focus_invoice_tracking_id';

/** Mismo icono de capas que Órdenes de compra → Agrupar por (trazo + grosor explícitos en el path). */
function GroupByLayersIcon({ className = 'h-4 w-4 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  );
}

/** Etiqueta legible tipo «Mayo de 2026» a partir de la clave de orden «2026-05» (mes antes que el año). */
function formatSalesNotesMonthGroupLabel(ymKey: string): string {
  const parts = ymKey.split('-');
  if (parts.length !== 2) return ymKey;
  const y = parseInt(parts[0], 10);
  const mo = parseInt(parts[1], 10);
  if (Number.isNaN(y) || Number.isNaN(mo) || mo < 1 || mo > 12) return ymKey;
  const d = new Date(y, mo - 1, 1);
  const raw = formatMonthYearLong(d);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

type GroupBy = 'none' | 'client' | 'paymentStatus' | 'deliveryStatus' | 'month';

type ColKey = 'comprobante' | 'client' | 'date' | 'total' | 'payment' | 'delivery' | 'actions';

export type SalesNotesHistoryProps = {
  onOpenInTracking: (invoiceId: string) => void;
};

export default function SalesNotesHistory({ onOpenInTracking }: SalesNotesHistoryProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const toolbarRef = useRef<HTMLDivElement>(null);

  const [rows, setRows] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [sortKey, setSortKey] = useState<'date' | 'invoiceNumber' | 'grandTotal'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [editingInvoice, setEditingInvoice] = useState<SalesInvoice | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<SalesInvoice | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<ColKey>>(new Set());

  const [showFilters, setShowFilters] = useState(false);
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const [showColumnsPanel, setShowColumnsPanel] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);

  const [salesNotesActionsMenuId, setSalesNotesActionsMenuId] = useState<string | null>(null);
  const [salesNotesActionsMenuPos, setSalesNotesActionsMenuPos] = useState<{ top: number; left: number } | null>(null);
  const salesNotesActionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const SN_ACTIONS_MENU_MIN_WIDTH = 192;

  const syncSalesNotesActionsMenuPosition = useCallback(() => {
    const btn = salesNotesActionsButtonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const pad = 8;
    let left = r.right - SN_ACTIONS_MENU_MIN_WIDTH;
    left = Math.max(pad, Math.min(left, window.innerWidth - SN_ACTIONS_MENU_MIN_WIDTH - pad));
    setSalesNotesActionsMenuPos({ top: r.bottom + 4, left });
  }, []);

  const closeSalesNotesActionsMenu = useCallback(() => {
    setSalesNotesActionsMenuId(null);
    setSalesNotesActionsMenuPos(null);
    salesNotesActionsButtonRef.current = null;
  }, []);

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
      const country = user?.role === 'sales' ? 'Ecuador' : undefined;
      const [inv, cl] = await Promise.all([getAllInvoices(), getAllClients(country)]);
      setRows(inv);
      setClients(cl);
    } catch (e) {
      console.error(e);
      showAlert(t('salesNotes.loadError'), 'Error');
    } finally {
      setLoading(false);
    }
  }, [user?.role, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!toolbarRef.current?.contains(e.target as Node)) {
        setShowFilters(false);
        setShowGroupPanel(false);
        setShowColumnsPanel(false);
        setShowSearchPanel(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  useEffect(() => {
    const closeOnOutside = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('[data-sales-notes-actions-root]');
      if (!el) closeSalesNotesActionsMenu();
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [closeSalesNotesActionsMenu]);

  useLayoutEffect(() => {
    if (!salesNotesActionsMenuId) {
      setSalesNotesActionsMenuPos(null);
      return;
    }
    syncSalesNotesActionsMenuPosition();
  }, [salesNotesActionsMenuId, syncSalesNotesActionsMenuPosition]);

  useEffect(() => {
    if (!salesNotesActionsMenuId) return;
    const onScrollOrResize = () => syncSalesNotesActionsMenuPosition();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [salesNotesActionsMenuId, syncSalesNotesActionsMenuPosition]);

  const filtered = useMemo(() => {
    let list = [...rows];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.clientName.toLowerCase().includes(q) ||
          inv.items.some((i) => i.sku.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
      );
    }
    if (clientId) {
      if (clientId === 'walk-in') {
        list = list.filter((inv) => !inv.clientId);
      } else {
        list = list.filter((inv) => inv.clientId === clientId);
      }
    }
    if (paymentStatus) list = list.filter((inv) => inv.paymentStatus === paymentStatus);
    if (deliveryStatus) list = list.filter((inv) => inv.deliveryStatus === deliveryStatus);

    if (filterMonth) {
      const [ys, ms] = filterMonth.split('-');
      const y = parseInt(ys, 10);
      const m = parseInt(ms, 10) - 1;
      if (!Number.isNaN(y) && !Number.isNaN(m)) {
        list = list.filter((inv) => {
          const d = new Date(inv.date);
          return d.getFullYear() === y && d.getMonth() === m;
        });
      }
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      list = list.filter((inv) => inv.date >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((inv) => inv.date <= to);
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') cmp = a.date.getTime() - b.date.getTime();
      else if (sortKey === 'invoiceNumber') cmp = a.invoiceNumber.localeCompare(b.invoiceNumber);
      else cmp = a.grandTotal - b.grandTotal;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [
    rows,
    search,
    clientId,
    paymentStatus,
    deliveryStatus,
    filterMonth,
    dateFrom,
    dateTo,
    sortKey,
    sortDir,
  ]);

  const invoiceForSalesNotesActionsMenu = useMemo(
    () => (salesNotesActionsMenuId ? filtered.find((i) => i.id === salesNotesActionsMenuId) : undefined),
    [salesNotesActionsMenuId, filtered]
  );

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ label: '', items: filtered }];
    const map = new Map<string, SalesInvoice[]>();
    for (const inv of filtered) {
      let key = '';
      if (groupBy === 'client') key = inv.clientName || '—';
      else if (groupBy === 'paymentStatus') key = inv.paymentStatus;
      else if (groupBy === 'deliveryStatus') key = inv.deliveryStatus;
      else if (groupBy === 'month') {
        const d = new Date(inv.date);
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inv);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({
        label: groupBy === 'month' ? formatSalesNotesMonthGroupLabel(key) : key,
        items,
      }));
  }, [filtered, groupBy]);

  const toggleSort = (key: typeof sortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('desc');
      return key;
    });
  };

  const activeFiltersCount = [
    clientId,
    paymentStatus,
    deliveryStatus,
    filterMonth,
    dateFrom,
    dateTo,
  ].filter(Boolean).length;

  const paymentLabel = (s: SalesInvoice['paymentStatus']) => {
    if (s === 'Paid') return t('invoiceTracking.paid');
    if (s === 'Partially Paid') return t('invoiceTracking.partial');
    return t('invoiceTracking.unpaid');
  };

  const deliveryLabel = (s: SalesInvoice['deliveryStatus']) => {
    if (s === 'Delivered') return t('invoiceTracking.delivered');
    if (s === 'Partially Delivered') return t('invoiceTracking.partiallyDelivered');
    if (s === 'Canceled') return t('invoiceTracking.canceled');
    return t('invoiceTracking.pending');
  };

  const toggleCol = (key: ColKey) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearFilters = () => {
    setClientId('');
    setPaymentStatus('');
    setDeliveryStatus('');
    setDateFrom('');
    setDateTo('');
    setFilterMonth('');
  };

  const thSortable = (field: typeof sortKey, label: string, align: TableThAlign = 'left') => (
    <th
      className={`${tableThSortableClass} ${tableThAlignClass(align)}`}
      onClick={() => toggleSort(field)}
    >
      <div className={tableThLabelFlexClass(align)}>
        {label}
        <TableSortIcon columnKey={field} activeKey={sortKey} direction={sortDir} />
      </div>
    </th>
  );

  const renderTable = (items: SalesInvoice[], groupLabel: string | undefined, reactKey: string) => (
    <div key={reactKey} className="space-y-2">
      {groupLabel ? (
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {groupBy === 'month' ? `${t('salesNotes.monthLabel')}: ${groupLabel}` : groupLabel}
          <span className="ml-2 font-normal text-gray-400">({items.length})</span>
        </h3>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={tableTheadClass}>
              <tr>
                {!hiddenColumns.has('comprobante') &&
                  thSortable('invoiceNumber', t('salesNotes.comprobante'), 'center')}
                {!hiddenColumns.has('client') && (
                  <th className={`${tableThBaseClass} ${tableThAlignClass('center')}`}>
                    {t('invoiceTracking.client')}
                  </th>
                )}
                {!hiddenColumns.has('date') && thSortable('date', t('invoiceTracking.invoiceDate'), 'center')}
                {!hiddenColumns.has('total') && thSortable('grandTotal', t('invoiceTracking.total'), 'center')}
                {!hiddenColumns.has('payment') && (
                  <th className={`${tableThBaseClass} ${tableThAlignClass('center')}`}>
                    {t('invoiceTracking.paymentStatus')}
                  </th>
                )}
                {!hiddenColumns.has('delivery') && (
                  <th className={`${tableThBaseClass} ${tableThAlignClass('center')}`}>
                    {t('invoiceTracking.deliveryStatus')}
                  </th>
                )}
                {!hiddenColumns.has('actions') && (
                  <th className={`${tableThBaseClass} ${tableThAlignClass('center')}`}>
                    {t('inventory.actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((inv) => (
                <tr key={inv.id} className="transition-colors hover:bg-gray-50">
                  {!hiddenColumns.has('comprobante') && (
                    <td className="whitespace-nowrap px-6 py-4 text-center font-mono text-sm font-semibold text-[#515151]">
                      {inv.invoiceNumber}
                    </td>
                  )}
                  {!hiddenColumns.has('client') && (
                    <td className="px-6 py-4 text-center text-sm text-gray-900">{inv.clientName}</td>
                  )}
                  {!hiddenColumns.has('date') && (
                    <td className="whitespace-nowrap px-6 py-4 text-center text-sm text-gray-600">
                      {formatDateDMY(inv.date)}
                    </td>
                  )}
                  {!hiddenColumns.has('total') && (
                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-900 tabular-nums">
                      ${inv.grandTotal.toFixed(2)}
                    </td>
                  )}
                  {!hiddenColumns.has('payment') && (
                    <td className="px-6 py-4 text-center">
                      <span className={paymentStatusBadgeClass(inv.paymentStatus)}>
                        {paymentLabel(inv.paymentStatus)}
                      </span>
                    </td>
                  )}
                  {!hiddenColumns.has('delivery') && (
                    <td className="px-6 py-4 text-center">
                      <span className={deliveryStatusBadgeClass(inv.deliveryStatus)}>
                        {deliveryLabel(inv.deliveryStatus)}
                      </span>
                    </td>
                  )}
                  {!hiddenColumns.has('actions') && (
                    <td className="whitespace-nowrap px-6 py-4 text-center text-sm">
                      <div className="inline-flex justify-center" data-sales-notes-actions-root>
                        <button
                          type="button"
                          onClick={(e) => {
                            const opening = salesNotesActionsMenuId !== inv.id;
                            if (opening) {
                              salesNotesActionsButtonRef.current = e.currentTarget;
                              setSalesNotesActionsMenuId(inv.id);
                            } else {
                              closeSalesNotesActionsMenu();
                            }
                          }}
                          className={tableRowActionButtonClass}
                          aria-expanded={salesNotesActionsMenuId === inv.id}
                          aria-haspopup="menu"
                        >
                          {t('invoiceTracking.actions')}
                          <svg
                            className="h-3.5 w-3.5 shrink-0 text-gray-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">{t('salesNotes.title')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t('salesNotes.subtitle')}</p>
      </div>

      <div ref={toolbarRef} className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowFilters((v) => !v);
              setShowGroupPanel(false);
              setShowColumnsPanel(false);
              setShowSearchPanel(false);
            }}
            className={`flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm transition-all duration-200 hover:bg-gray-50 hover:shadow-md ${
              showFilters ? 'border-[#515151] bg-[#515151] text-white' : ''
            }`}
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            <span className="font-medium">{t('inventory.filters')}</span>
            {activeFiltersCount > 0 && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowGroupPanel((v) => !v);
              setShowFilters(false);
              setShowColumnsPanel(false);
              setShowSearchPanel(false);
            }}
            className={`flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm transition-all duration-200 hover:bg-gray-50 hover:shadow-md ${
              groupBy !== 'none' ? 'border-[#515151] bg-[#515151] text-white' : ''
            }`}
          >
            <GroupByLayersIcon />
            <span className="font-medium">{t('purchaseOrders.groupBy')}</span>
            {groupBy !== 'none' && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">1</span>
            )}
          </button>
          {showGroupPanel && (
            <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-gray-200 bg-white shadow-lg">
              <div className="p-4">
                <div className="mb-3 text-sm font-medium text-gray-700">{t('purchaseOrders.groupByField')}</div>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setGroupBy('none');
                      setShowGroupPanel(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      groupBy === 'none' ? 'bg-[#515151] text-white' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {t('purchaseOrders.noGrouping')}
                  </button>
                  {(
                    [
                      ['month', t('salesNotes.groupMonth')] as const,
                      ['client', t('salesNotes.groupClient')] as const,
                      ['paymentStatus', t('salesNotes.groupPayment')] as const,
                      ['deliveryStatus', t('salesNotes.groupDelivery')] as const,
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setGroupBy(key);
                        setShowGroupPanel(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                        groupBy === key ? 'bg-[#515151] text-white' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <GroupByLayersIcon />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowColumnsPanel((v) => !v);
              setShowFilters(false);
              setShowGroupPanel(false);
              setShowSearchPanel(false);
            }}
            className={`flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm transition-all duration-200 hover:bg-gray-50 hover:shadow-md ${
              showColumnsPanel ? 'border-[#515151] bg-[#515151] text-white' : ''
            }`}
          >
            <svg
              className={`h-4 w-4 shrink-0 ${hiddenColumns.size > 0 ? 'text-gray-400' : 'text-gray-600'} ${showColumnsPanel ? 'text-current' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
            <span className={`text-sm font-medium ${showColumnsPanel ? '' : 'text-gray-700'}`}>{t('inventory.hideFields')}</span>
            {hiddenColumns.size > 0 && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">
                {hiddenColumns.size}
              </span>
            )}
          </button>
          {showColumnsPanel && (
            <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-lg">
              <div className="p-4">
                <div className="mb-3 text-sm font-medium text-gray-700">{t('inventory.columnVisibility')}</div>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ['comprobante', t('salesNotes.comprobante')],
                      ['client', t('invoiceTracking.client')],
                      ['date', t('invoiceTracking.invoiceDate')],
                      ['total', t('invoiceTracking.total')],
                      ['payment', t('invoiceTracking.paymentStatus')],
                      ['delivery', t('invoiceTracking.deliveryStatus')],
                      ['actions', t('inventory.actions')],
                    ] as [ColKey, string][]
                  ).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">{label}</span>
                      <button
                        type="button"
                        onClick={() => toggleCol(key)}
                        className={`toggle-switch relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#515151] focus:ring-offset-2 ${
                          hiddenColumns.has(key) ? 'toggle-switch-off' : 'toggle-switch-on'
                        }`}
                      >
                        <span
                          className={`toggle-knob inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            hiddenColumns.has(key) ? 'translate-x-1' : 'translate-x-6'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowSearchPanel((v) => !v);
              setShowFilters(false);
              setShowGroupPanel(false);
              setShowColumnsPanel(false);
            }}
            className={`flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm transition-all duration-200 hover:bg-gray-50 hover:shadow-md ${
              showSearchPanel ? 'border-[#515151] bg-[#515151] text-white' : ''
            }`}
            aria-label={t('inventory.search')}
          >
            <svg className="h-4 w-4 shrink-0 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          {showSearchPanel && (
            <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
              <div className="mb-3 text-sm font-medium text-gray-700">{t('inventory.search')}</div>
              <div className="relative">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('salesNotes.searchPlaceholder')}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-transparent focus:ring-2 focus:ring-[#515151]"
                />
                <svg
                  className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-t border-gray-200 bg-gray-50 p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">{t('salesNotes.filterByMonth')}</label>
                <MonthYearSelectEs value={filterMonth} onChange={setFilterMonth} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">{t('salesNotes.dateFrom')}</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-[#515151]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">{t('salesNotes.dateTo')}</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-[#515151]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">{t('salesNotes.filterClient')}</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-[#515151]"
                >
                  <option value="">{t('salesNotes.allClients')}</option>
                  <option value="walk-in">{t('sales.walkInCustomer')}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">{t('invoiceTracking.paymentStatus')}</label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-[#515151]"
                >
                  <option value="">{t('salesNotes.all')}</option>
                  <option value="Unpaid">{t('invoiceTracking.unpaid')}</option>
                  <option value="Partially Paid">{t('invoiceTracking.partial')}</option>
                  <option value="Paid">{t('invoiceTracking.paid')}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">{t('invoiceTracking.deliveryStatus')}</label>
                <select
                  value={deliveryStatus}
                  onChange={(e) => setDeliveryStatus(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-[#515151]"
                >
                  <option value="">{t('salesNotes.all')}</option>
                  <option value="Pending">{t('invoiceTracking.pending')}</option>
                  <option value="Partially Delivered">{t('invoiceTracking.partiallyDelivered')}</option>
                  <option value="Delivered">{t('invoiceTracking.delivered')}</option>
                  <option value="Canceled">{t('invoiceTracking.canceled')}</option>
                </select>
              </div>
            </div>
            {activeFiltersCount > 0 && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm font-medium text-[#515151] hover:text-black"
                >
                  {t('invoiceTracking.clearFilters')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-500">{t('salesNotes.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-500">{t('salesNotes.empty')}</div>
      ) : (
        <div className="space-y-6">
          {grouped.map((g, i) => renderTable(g.items, g.label || undefined, `sn-${groupBy}-${g.label}-${i}`))}
        </div>
      )}

      {salesNotesActionsMenuId &&
        salesNotesActionsMenuPos &&
        invoiceForSalesNotesActionsMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-sales-notes-actions-root
            role="menu"
            className="fixed z-[100] min-w-[12rem] rounded-lg border border-gray-200 bg-white py-1 text-left shadow-lg"
            style={{ top: salesNotesActionsMenuPos.top, left: salesNotesActionsMenuPos.left }}
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                void downloadSalesInvoicePdf(invoiceForSalesNotesActionsMenu).catch(() =>
                  showAlert(t('invoiceTracking.pdfGenerationFailed') || 'PDF error', 'Error')
                );
                closeSalesNotesActionsMenu();
              }}
            >
              <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              {t('invoiceTracking.generatePdf')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setEditingInvoice(invoiceForSalesNotesActionsMenu);
                closeSalesNotesActionsMenu();
              }}
            >
              <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              {t('invoiceTracking.editInvoice')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                sessionStorage.setItem(SESSION_TRACKING_FOCUS, invoiceForSalesNotesActionsMenu.id);
                onOpenInTracking(invoiceForSalesNotesActionsMenu.id);
                closeSalesNotesActionsMenu();
              }}
            >
              <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              {t('salesNotes.openInTracking')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setInvoiceToDelete(invoiceForSalesNotesActionsMenu);
                closeSalesNotesActionsMenu();
              }}
            >
              <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              {t('invoiceTracking.deleteInvoice')}
            </button>
          </div>,
          document.body
        )}

      <InvoiceEditModal
        invoice={editingInvoice}
        onClose={() => setEditingInvoice(null)}
        onSaved={() => {
          setEditingInvoice(null);
          void load();
        }}
      />

      <SalesInvoiceDeleteModal
        open={!!invoiceToDelete}
        invoice={invoiceToDelete}
        onClose={() => setInvoiceToDelete(null)}
        onDeleted={() => {
          setInvoiceToDelete(null);
          showAlert(t('invoiceTracking.invoiceDeleted'), t('common.success'));
          void load();
        }}
        onError={(message) => showAlert(message, t('common.error'))}
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
