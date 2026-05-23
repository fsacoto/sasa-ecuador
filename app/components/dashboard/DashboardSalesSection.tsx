'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Consignment, SalesInvoice } from '../../types';
import { getAllInvoices } from '../../services/invoicesService';
import { getAllConsignments } from '../../services/consignmentsService';
import DonutChart from './charts/DonutChart';
import ChartLegend from './charts/ChartLegend';
import VerticalBarChart from './charts/VerticalBarChart';
import {
  STATUS_CHART_COLORS,
  colorAt,
  dashboardKpiClass,
  dashboardCardLabelClass,
  dashboardChartTitleClass,
  dashboardHintClass,
  dashboardPanelClass,
  dashboardSectionTitleClass,
  dashboardValueLgClass,
} from './charts/chartTheme';

type SalesPeriodPreset = 'last30' | 'thisMonth' | 'custom';

function toJsDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const maybe = value as { toDate?: () => Date };
  if (typeof maybe.toDate === 'function') {
    const d = maybe.toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function invoiceDate(inv: SalesInvoice): Date | null {
  return toJsDate(inv.date) ?? toJsDate(inv.createdAt);
}

function consignmentDate(c: Consignment): Date {
  return c.dateCreated ?? c.createdAt;
}

function inRange(d: Date, from: Date, to: Date): boolean {
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

type Props = {
  t: (key: string) => string;
};

export default function DashboardSalesSection({ t }: Props) {
  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>([]);
  const [consignments, setConsignments] = useState<Consignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<SalesPeriodPreset>('thisMonth');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getAllInvoices(), getAllConsignments()])
      .then(([inv, csg]) => {
        if (!cancelled) {
          setSalesInvoices(inv);
          setConsignments(csg);
        }
      })
      .catch((err) => console.error('Dashboard sales section:', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const inPeriodInvoices = useMemo(() => {
    if (!periodBounds.valid) return [];
    const { from, to } = periodBounds;
    return salesInvoices.filter((inv) => {
      const d = invoiceDate(inv);
      return d !== null && inRange(d, from, to);
    });
  }, [salesInvoices, periodBounds]);

  const metrics = useMemo(() => {
    if (!periodBounds.valid) {
      return {
        unpaid: 0,
        pendingCollection: 0,
        totalSales: 0,
        notesCount: 0,
        consignmentsCount: 0,
      };
    }
    const { from, to } = periodBounds;
    const csgInPeriod = consignments.filter((c) => inRange(consignmentDate(c), from, to));

    return {
      unpaid: inPeriodInvoices.filter((inv) => inv.paymentStatus === 'Unpaid').length,
      pendingCollection: inPeriodInvoices.reduce((sum, inv) => sum + (inv.remainingBalance || 0), 0),
      totalSales: inPeriodInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0),
      notesCount: inPeriodInvoices.length,
      consignmentsCount: csgInPeriod.length,
    };
  }, [inPeriodInvoices, consignments, periodBounds]);

  const dailySalesBars = useMemo(() => {
    if (!periodBounds.valid) return [];
    const { from, to } = periodBounds;
    const dayMs = 86400000;
    const totalDays = Math.max(1, Math.floor((to.getTime() - from.getTime()) / dayMs) + 1);
    const maxBars = 14;
    const step = totalDays <= maxBars ? 1 : Math.ceil(totalDays / maxBars);
    const result: { label: string; value: number }[] = [];

    for (let offset = 0; offset < totalDays; offset += step) {
      const dayStart = new Date(from);
      dayStart.setDate(from.getDate() + offset);
      const dayEnd = endOfDay(dayStart);
      const label = dayStart.toLocaleDateString('es-EC', { day: 'numeric', month: 'short' });
      let total = 0;
      inPeriodInvoices.forEach((inv) => {
        const d = invoiceDate(inv);
        if (d && d >= startOfDay(dayStart) && d <= dayEnd) {
          total += inv.grandTotal || 0;
        }
      });
      result.push({ label, value: Math.round(total * 100) / 100 });
      if (result.length >= maxBars) break;
    }
    return result;
  }, [inPeriodInvoices, periodBounds]);

  const paymentSlices = useMemo(() => {
    const counts = { Paid: 0, 'Partially Paid': 0, Unpaid: 0 };
    inPeriodInvoices.forEach((inv) => {
      counts[inv.paymentStatus] += 1;
    });
    const labels: Record<keyof typeof counts, string> = {
      Paid: t('dashboard.paymentPaid'),
      'Partially Paid': t('dashboard.paymentPartial'),
      Unpaid: t('dashboard.paymentUnpaid'),
    };
    const colors: Record<keyof typeof counts, string> = {
      Paid: STATUS_CHART_COLORS.paid,
      'Partially Paid': STATUS_CHART_COLORS.partial,
      Unpaid: STATUS_CHART_COLORS.unpaid,
    };
    return (Object.keys(counts) as (keyof typeof counts)[])
      .map((key) => ({
        label: labels[key],
        value: counts[key],
        color: colors[key],
      }))
      .filter((s) => s.value > 0);
  }, [inPeriodInvoices, t]);

  const salesBarItems = dailySalesBars.map((b, i) => ({
    ...b,
    color: colorAt(i),
  }));

  const showCharts = !loading && periodBounds.valid;
  const chartHasDailySales = salesBarItems.some((b) => b.value > 0);
  const hasPeriodActivity = metrics.notesCount > 0 || metrics.totalSales > 0;

  const kpiItems = [
    { label: t('dashboard.unpaidNotes'), value: metrics.unpaid, format: 'count' as const },
    {
      label: t('dashboard.pendingCollection'),
      value: metrics.pendingCollection,
      format: 'currency' as const,
    },
    { label: t('dashboard.totalSales'), value: metrics.totalSales, format: 'currency' as const },
    { label: t('dashboard.salesNotesCount'), value: metrics.notesCount, format: 'count' as const },
    {
      label: t('dashboard.consignmentsCount'),
      value: metrics.consignmentsCount,
      format: 'count' as const,
    },
  ];

  const formatKpi = (n: number, format: 'count' | 'currency') => {
    if (loading || !periodBounds.valid) return '—';
    return format === 'currency' ? `$${n.toFixed(2)}` : String(n);
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className={dashboardSectionTitleClass}>{t('dashboard.salesSectionTitle')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="sasa-sales-period-filter inline-flex items-center gap-0.5 rounded-full p-0.5"
            role="group"
            aria-label={t('dashboard.salesPeriodFilter')}
          >
            <button
              type="button"
              className="sasa-sales-period-btn"
              data-active={period === 'last30' ? 'true' : 'false'}
              onClick={() => setPeriod('last30')}
            >
              {t('dashboard.salesFilterLast30')}
            </button>
            <button
              type="button"
              className="sasa-sales-period-btn"
              data-active={period === 'thisMonth' ? 'true' : 'false'}
              onClick={() => setPeriod('thisMonth')}
            >
              {t('dashboard.salesFilterThisMonth')}
            </button>
            <button
              type="button"
              className="sasa-sales-period-btn"
              data-active={period === 'custom' ? 'true' : 'false'}
              onClick={() => {
                setPeriod('custom');
                if (!customFrom || !customTo) {
                  const now = new Date();
                  const y = now.getFullYear();
                  const m = String(now.getMonth() + 1).padStart(2, '0');
                  const d = String(now.getDate()).padStart(2, '0');
                  setCustomFrom(`${y}-${m}-01`);
                  setCustomTo(`${y}-${m}-${d}`);
                }
              }}
            >
              {t('dashboard.salesFilterCustom')}
            </button>
          </div>
          {period === 'custom' && (
            <div className="sasa-sales-period-dates flex flex-wrap items-center gap-1.5 text-xs">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="sasa-sales-period-date"
                aria-label={t('dashboard.salesFilterFrom')}
              />
              <span className="sasa-sales-period-dates-sep">—</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="sasa-sales-period-date"
                aria-label={t('dashboard.salesFilterTo')}
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {kpiItems.map((kpi) => (
          <div key={kpi.label} className={dashboardKpiClass}>
            <p className={dashboardCardLabelClass}>{kpi.label}</p>
            <p className={`mt-2 ${dashboardValueLgClass}`}>{formatKpi(kpi.value, kpi.format)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-5">
        <div className={`${dashboardPanelClass} flex flex-col lg:col-span-3`}>
          <p className={`mb-4 ${dashboardChartTitleClass}`}>{t('dashboard.salesTrendTitle')}</p>
          {showCharts && chartHasDailySales ? (
            <VerticalBarChart
              items={salesBarItems}
              height={120}
              compact
              formatValue={(n) => (n > 0 ? `$${n.toFixed(0)}` : '')}
              emptyLabel={t('dashboard.salesTrendEmpty')}
            />
          ) : showCharts && hasPeriodActivity ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 py-6 text-center">
              <p className={dashboardValueLgClass}>${metrics.totalSales.toFixed(2)}</p>
              <p className={`max-w-xs ${dashboardHintClass}`}>{t('dashboard.salesPeriodTotalHint')}</p>
            </div>
          ) : (
            <p className="sasa-dashboard-empty py-8 text-center text-xs text-gray-500">
              {loading ? '…' : t('dashboard.salesTrendEmpty')}
            </p>
          )}
        </div>

        <div className={`${dashboardPanelClass} flex flex-col lg:col-span-2`}>
          <p className={`mb-4 ${dashboardChartTitleClass}`}>{t('dashboard.paymentStatusTitle')}</p>
          {showCharts && paymentSlices.length > 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 sm:flex-row sm:items-center">
              <DonutChart
                slices={paymentSlices}
                size={128}
                centerLabel={String(metrics.notesCount)}
                centerSub={t('dashboard.salesNotesShort')}
              />
              <div className="min-w-0 flex-1">
                <ChartLegend items={paymentSlices} showPct maxItems={3} />
                <p className={`mt-3 ${dashboardHintClass}`}>{t('dashboard.donutPaymentHint')}</p>
              </div>
            </div>
          ) : (
            <p className="sasa-dashboard-empty flex flex-1 items-center justify-center py-6 text-center text-xs text-gray-500">
              {loading ? '…' : t('dashboard.salesTrendEmpty')}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
