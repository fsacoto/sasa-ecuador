'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { SalesInvoice } from '../types';
import { getAllInvoices } from '../services/invoicesService';
import { useInventory } from '../context/InventoryContext';
import { useTranslation } from '../context/TranslationContext';
import { computeSalesProfit, type ProfitByInvoice, type ProfitBySku } from '../utils/salesProfit';
import TableSortIcon from './ui/TableSortIcon';
import {
  tableTheadClass,
  tableThAlignClass,
  tableThBaseClass,
  tableThLabelFlexClass,
  tableThSortableClass,
} from './ui/tableHeaderClass';
import { formatDateDMY } from '../utils/formatDate';
import DateInput from './ui/DateInput';
import { useAuth } from '../context/AuthContext';
import { usePersistedFilterState } from '../hooks/usePersistedFilterState';
import {
  dashboardCardLabelClass,
  dashboardHintClass,
  dashboardKpiClass,
  dashboardPanelClass,
  dashboardSectionTitleClass,
  dashboardValueLgClass,
} from './dashboard/charts/chartTheme';

type PeriodPreset = 'last30' | 'thisMonth' | 'custom';
type ViewTab = 'bySku' | 'byInvoice';

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

type SkuSortKey = 'sku' | 'quantitySold' | 'unitCost' | 'avgSalePrice' | 'revenue' | 'cogs' | 'profit' | 'marginPercent';
type InvoiceSortKey = 'invoiceNumber' | 'clientName' | 'date' | 'revenue' | 'cogs' | 'profit' | 'marginPercent';

export default function SalesProfitability() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id;
  const { inventory, purchaseOrders, additionalCosts, isLoading: inventoryLoading } = useInventory();

  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [period, setPeriod] = usePersistedFilterState<PeriodPreset>(
    'sales-profitability',
    'period',
    'thisMonth',
    userId
  );
  const [customFrom, setCustomFrom] = usePersistedFilterState('sales-profitability', 'customFrom', '', userId);
  const [customTo, setCustomTo] = usePersistedFilterState('sales-profitability', 'customTo', '', userId);
  const [viewTab, setViewTab] = useState<ViewTab>('bySku');
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  const [skuSort, setSkuSort] = useState<{ key: SkuSortKey; direction: 'asc' | 'desc' }>({
    key: 'profit',
    direction: 'desc',
  });
  const [invoiceSort, setInvoiceSort] = useState<{ key: InvoiceSortKey; direction: 'asc' | 'desc' }>({
    key: 'date',
    direction: 'desc',
  });

  const loadInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const data = await getAllInvoices();
      setInvoices(data);
    } catch (err) {
      console.error('SalesProfitability:', err);
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const periodBounds = useMemo(() => {
    const now = new Date();
    const end = endOfDay(now);
    if (period === 'last30') {
      const from = startOfDay(new Date(now));
      from.setDate(from.getDate() - 29);
      return { from, to: end, valid: true };
    }
    if (period === 'thisMonth') {
      const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      return { from, to: end, valid: true };
    }
    if (!customFrom || !customTo) return { from: end, to: end, valid: false };
    const from = startOfDay(new Date(`${customFrom}T12:00:00`));
    const to = endOfDay(new Date(`${customTo}T12:00:00`));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      return { from: end, to: end, valid: false };
    }
    return { from, to, valid: true };
  }, [period, customFrom, customTo]);

  const profitResult = useMemo(() => {
    if (!periodBounds.valid) {
      return {
        summary: {
          revenue: 0,
          cogs: 0,
          profit: 0,
          marginPercent: 0,
          invoiceCount: 0,
          linesWithMissingCost: 0,
          skusWithMissingCost: 0,
        },
        byInvoice: [] as ProfitByInvoice[],
        bySku: [] as ProfitBySku[],
      };
    }
    return computeSalesProfit(
      invoices,
      inventory,
      purchaseOrders,
      additionalCosts,
      { from: periodBounds.from, to: periodBounds.to }
    );
  }, [invoices, inventory, purchaseOrders, additionalCosts, periodBounds]);

  const toggleSkuSort = (key: SkuSortKey) => {
    setSkuSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' }
    );
  };

  const toggleInvoiceSort = (key: InvoiceSortKey) => {
    setInvoiceSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' }
    );
  };

  const sortedSkus = useMemo(() => {
    const list = [...profitResult.bySku];
    const { key, direction } = skuSort;
    const mult = direction === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const av = a[key] ?? (key === 'unitCost' ? -1 : 0);
      const bv = b[key] ?? (key === 'unitCost' ? -1 : 0);
      if (typeof av === 'string' && typeof bv === 'string') return mult * av.localeCompare(bv);
      return mult * ((av as number) - (bv as number));
    });
    return list;
  }, [profitResult.bySku, skuSort]);

  const sortedInvoices = useMemo(() => {
    const list = [...profitResult.byInvoice];
    const { key, direction } = invoiceSort;
    const mult = direction === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (key === 'date') return mult * (a.date.getTime() - b.date.getTime());
      const av = a[key];
      const bv = b[key];
      if (typeof av === 'string' && typeof bv === 'string') return mult * av.localeCompare(bv);
      return mult * ((av as number) - (bv as number));
    });
    return list;
  }, [profitResult.byInvoice, invoiceSort]);

  const skuTotals = useMemo(() => {
    return sortedSkus.reduce(
      (acc, row) => ({
        quantitySold: acc.quantitySold + row.quantitySold,
        revenue: acc.revenue + row.revenue,
        cogs: acc.cogs + row.cogs,
        profit: acc.profit + row.profit,
      }),
      { quantitySold: 0, revenue: 0, cogs: 0, profit: 0 }
    );
  }, [sortedSkus]);

  const loading = loadingInvoices || inventoryLoading;

  const periodButtonClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-gray-900 text-white'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`;

  const tabButtonClass = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
      active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
      <div>
        <h1 className={dashboardSectionTitleClass}>{t('salesProfitability.title')}</h1>
        <p className={`mt-1 ${dashboardHintClass}`}>{t('salesProfitability.subtitle')}</p>
      </div>

      <div className={`${dashboardPanelClass} flex flex-wrap items-center gap-3`}>
        <span className="text-sm font-medium text-gray-600">{t('salesProfitability.period')}</span>
        <button type="button" className={periodButtonClass(period === 'thisMonth')} onClick={() => setPeriod('thisMonth')}>
          {t('salesProfitability.periodThisMonth')}
        </button>
        <button type="button" className={periodButtonClass(period === 'last30')} onClick={() => setPeriod('last30')}>
          {t('salesProfitability.periodLast30')}
        </button>
        <button type="button" className={periodButtonClass(period === 'custom')} onClick={() => setPeriod('custom')}>
          {t('salesProfitability.periodCustom')}
        </button>
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <DateInput
              value={customFrom}
              onChange={setCustomFrom}
              inputClassName="min-w-[9rem] rounded-lg border border-gray-300 px-2 py-1.5 text-sm flex items-center gap-2"
            />
            <span className="text-gray-400">—</span>
            <DateInput
              value={customTo}
              onChange={setCustomTo}
              inputClassName="min-w-[9rem] rounded-lg border border-gray-300 px-2 py-1.5 text-sm flex items-center gap-2"
            />
          </div>
        )}
      </div>

      {!periodBounds.valid && period === 'custom' && (
        <p className="text-sm text-amber-700">{t('salesProfitability.selectDateRange')}</p>
      )}

      {profitResult.summary.linesWithMissingCost > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('salesProfitability.missingCostWarning')
            .replace('{lines}', String(profitResult.summary.linesWithMissingCost))
            .replace('{skus}', String(profitResult.summary.skusWithMissingCost))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={dashboardKpiClass}>
          <p className={dashboardCardLabelClass}>{t('salesProfitability.kpiRevenue')}</p>
          <p className={`mt-1 ${dashboardValueLgClass}`}>{formatUsd(profitResult.summary.revenue)}</p>
        </div>
        <div className={dashboardKpiClass}>
          <p className={dashboardCardLabelClass}>{t('salesProfitability.kpiCogs')}</p>
          <p className={`mt-1 ${dashboardValueLgClass}`}>{formatUsd(profitResult.summary.cogs)}</p>
        </div>
        <div className={dashboardKpiClass}>
          <p className={dashboardCardLabelClass}>{t('salesProfitability.kpiProfit')}</p>
          <p className={`mt-1 ${dashboardValueLgClass} text-emerald-700`}>
            {formatUsd(profitResult.summary.profit)}
          </p>
        </div>
        <div className={dashboardKpiClass}>
          <p className={dashboardCardLabelClass}>{t('salesProfitability.kpiMargin')}</p>
          <p className={`mt-1 ${dashboardValueLgClass}`}>{formatPct(profitResult.summary.marginPercent)}</p>
          <p className={`mt-1 ${dashboardHintClass}`}>
            {t('salesProfitability.invoiceCount').replace(
              '{count}',
              String(profitResult.summary.invoiceCount)
            )}
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200 pb-1">
        <button type="button" className={tabButtonClass(viewTab === 'bySku')} onClick={() => setViewTab('bySku')}>
          {t('salesProfitability.tabByArticle')}
        </button>
        <button
          type="button"
          className={tabButtonClass(viewTab === 'byInvoice')}
          onClick={() => setViewTab('byInvoice')}
        >
          {t('salesProfitability.tabByInvoice')}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      ) : viewTab === 'bySku' ? (
        <div className={`${dashboardPanelClass} overflow-x-auto`}>
          <table className="min-w-full text-sm">
            <thead className={tableTheadClass}>
              <tr>
                {(
                  [
                    ['sku', t('salesProfitability.colSku')],
                    ['quantitySold', t('salesProfitability.colQty')],
                    ['unitCost', t('salesProfitability.colUnitCost')],
                    ['avgSalePrice', t('salesProfitability.colAvgPrice')],
                    ['revenue', t('salesProfitability.colRevenue')],
                    ['cogs', t('salesProfitability.colCogs')],
                    ['profit', t('salesProfitability.colProfit')],
                    ['marginPercent', t('salesProfitability.colMargin')],
                  ] as [SkuSortKey, string][]
                ).map(([key, label]) => (
                  <th key={key} className={`${tableThBaseClass} ${tableThAlignClass('left')}`}>
                    <button
                      type="button"
                      className={tableThSortableClass}
                      onClick={() => toggleSkuSort(key)}
                    >
                      <span className={tableThLabelFlexClass('left')}>{label}</span>
                      <TableSortIcon columnKey={key} activeKey={skuSort.key} direction={skuSort.direction} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedSkus.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
                    {t('salesProfitability.noData')}
                  </td>
                </tr>
              ) : (
                <>
                  {sortedSkus.map((row) => (
                    <tr key={row.sku} className="border-t border-gray-100 hover:bg-gray-50/80">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-gray-900">{row.sku}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[200px]">{row.description}</div>
                        {!row.hasCost && (
                          <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                            {t('salesProfitability.noCost')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{row.quantitySold}</td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {row.unitCost != null ? formatUsd(row.unitCost) : '—'}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{formatUsd(row.avgSalePrice)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatUsd(row.revenue)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatUsd(row.cogs)}</td>
                      <td className="px-3 py-2.5 tabular-nums font-medium text-emerald-700">
                        {formatUsd(row.profit)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{formatPct(row.marginPercent)}</td>
                    </tr>
                  ))}
                  {sortedSkus.length > 0 && (
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                      <td className="px-3 py-2.5">{t('salesProfitability.totals')}</td>
                      <td className="px-3 py-2.5 tabular-nums">{skuTotals.quantitySold}</td>
                      <td className="px-3 py-2.5">—</td>
                      <td className="px-3 py-2.5">—</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatUsd(skuTotals.revenue)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatUsd(skuTotals.cogs)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-emerald-700">{formatUsd(skuTotals.profit)}</td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {skuTotals.revenue > 0
                          ? formatPct((skuTotals.profit / skuTotals.revenue) * 100)
                          : '—'}
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={`${dashboardPanelClass} overflow-x-auto`}>
          <table className="min-w-full text-sm">
            <thead className={tableTheadClass}>
              <tr>
                <th className={`${tableThBaseClass} w-8`} />
                {(
                  [
                    ['invoiceNumber', t('salesProfitability.colInvoice')],
                    ['clientName', t('salesProfitability.colClient')],
                    ['date', t('salesProfitability.colDate')],
                    ['revenue', t('salesProfitability.colRevenue')],
                    ['cogs', t('salesProfitability.colCogs')],
                    ['profit', t('salesProfitability.colProfit')],
                    ['marginPercent', t('salesProfitability.colMargin')],
                  ] as [InvoiceSortKey, string][]
                ).map(([key, label]) => (
                  <th key={key} className={`${tableThBaseClass} ${tableThAlignClass('left')}`}>
                    <button
                      type="button"
                      className={tableThSortableClass}
                      onClick={() => toggleInvoiceSort(key)}
                    >
                      <span className={tableThLabelFlexClass('left')}>{label}</span>
                      <TableSortIcon
                        columnKey={key}
                        activeKey={invoiceSort.key}
                        direction={invoiceSort.direction}
                      />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
                    {t('salesProfitability.noData')}
                  </td>
                </tr>
              ) : (
                sortedInvoices.map((inv) => {
                  const expanded = expandedInvoiceId === inv.invoiceId;
                  return (
                    <Fragment key={inv.invoiceId}>
                      <tr
                        className="border-t border-gray-100 hover:bg-gray-50/80 cursor-pointer"
                        onClick={() =>
                          setExpandedInvoiceId(expanded ? null : inv.invoiceId)
                        }
                      >
                        <td className="px-2 py-2.5 text-gray-400">{expanded ? '▼' : '▶'}</td>
                        <td className="px-3 py-2.5 font-medium">{inv.invoiceNumber}</td>
                        <td className="px-3 py-2.5">{inv.clientName}</td>
                        <td className="px-3 py-2.5">{formatDateDMY(inv.date)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{formatUsd(inv.revenue)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{formatUsd(inv.cogs)}</td>
                        <td className="px-3 py-2.5 tabular-nums font-medium text-emerald-700">
                          {formatUsd(inv.profit)}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {formatPct(inv.marginPercent)}
                          {inv.linesWithMissingCost > 0 && (
                            <span className="ml-1 inline-block rounded bg-amber-100 px-1 py-0.5 text-xs text-amber-800">
                              {t('salesProfitability.partialCost')}
                            </span>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-gray-50/50">
                          <td colSpan={8} className="px-4 py-3">
                            <table className="min-w-full text-xs">
                              <thead>
                                <tr className="text-left text-gray-500">
                                  <th className="pb-2 pr-4">{t('salesProfitability.colSku')}</th>
                                  <th className="pb-2 pr-4">{t('salesProfitability.colQty')}</th>
                                  <th className="pb-2 pr-4">{t('salesProfitability.colUnitCost')}</th>
                                  <th className="pb-2 pr-4">{t('salesProfitability.colRevenue')}</th>
                                  <th className="pb-2 pr-4">{t('salesProfitability.colCogs')}</th>
                                  <th className="pb-2 pr-4">{t('salesProfitability.colProfit')}</th>
                                  <th className="pb-2">{t('salesProfitability.colMargin')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {inv.lines.map((line, idx) => (
                                  <tr key={`${line.sku}-${idx}`} className="border-t border-gray-200/80">
                                    <td className="py-2 pr-4">
                                      <span className="font-medium">{line.sku}</span>
                                      <span className="block text-gray-500">{line.description}</span>
                                    </td>
                                    <td className="py-2 pr-4 tabular-nums">{line.quantity}</td>
                                    <td className="py-2 pr-4 tabular-nums">
                                      {line.unitCost != null ? formatUsd(line.unitCost) : '—'}
                                    </td>
                                    <td className="py-2 pr-4 tabular-nums">{formatUsd(line.lineNetRevenue)}</td>
                                    <td className="py-2 pr-4 tabular-nums">
                                      {line.cogs != null ? formatUsd(line.cogs) : '—'}
                                    </td>
                                    <td className="py-2 pr-4 tabular-nums text-emerald-700">
                                      {line.profit != null ? formatUsd(line.profit) : '—'}
                                    </td>
                                    <td className="py-2 tabular-nums">
                                      {line.marginPercent != null ? formatPct(line.marginPercent) : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
