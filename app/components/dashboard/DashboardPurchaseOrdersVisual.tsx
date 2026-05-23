'use client';

import type { PurchaseOrder, PurchaseOrderStatus } from '../../types';
import DonutChart from './charts/DonutChart';
import ChartLegend from './charts/ChartLegend';
import VerticalBarChart from './charts/VerticalBarChart';
import {
  STATUS_CHART_COLORS,
  colorAt,
  dashboardPanelClass,
  dashboardChartTitleClass,
  dashboardSectionTitleClass,
} from './charts/chartTheme';

const STATUS_ORDER: PurchaseOrderStatus[] = ['Ordered', 'Received', 'Verified'];

const STATUS_COLORS: Record<PurchaseOrderStatus, string> = {
  Ordered: STATUS_CHART_COLORS.ordered,
  Received: STATUS_CHART_COLORS.received,
  Verified: STATUS_CHART_COLORS.verified,
};

type Props = {
  t: (key: string) => string;
  purchaseOrders: PurchaseOrder[];
};

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

function IconPurchaseOrder({ className }: { className?: string }) {
  return (
    <svg
      className={['h-4 w-4 shrink-0 text-gray-500', className].filter(Boolean).join(' ')}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

export default function DashboardPurchaseOrdersVisual({ t, purchaseOrders }: Props) {
  const statusCounts: Record<PurchaseOrderStatus, number> = {
    Ordered: 0,
    Received: 0,
    Verified: 0,
  };

  purchaseOrders.forEach((o) => {
    if (o.status in statusCounts) statusCounts[o.status as PurchaseOrderStatus] += 1;
  });

  const statusLabel = (s: PurchaseOrderStatus) => {
    if (s === 'Ordered') return t('purchaseOrders.statusOrdered');
    if (s === 'Received') return t('purchaseOrders.statusReceived');
    return t('purchaseOrders.statusVerified');
  };

  const slices = STATUS_ORDER.map((status) => ({
    label: statusLabel(status),
    value: statusCounts[status],
    color: STATUS_COLORS[status],
  })).filter((s) => s.value > 0);

  const allSlices =
    slices.length > 0
      ? slices
      : STATUS_ORDER.map((status) => ({
          label: statusLabel(status),
          value: 0,
          color: STATUS_COLORS[status],
        }));

  const now = new Date();
  const monthlyBars = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
    const short = d.toLocaleDateString('es-EC', { month: 'short' });
    return { monthKey, label: short.charAt(0).toUpperCase() + short.slice(1), count: 0 };
  });

  purchaseOrders.forEach((o) => {
    const created = toJsDate(o.createdAt);
    if (!created) return;
    const key = `${created.getFullYear()}-${created.getMonth()}`;
    const bucket = monthlyBars.find((b) => b.monthKey === key);
    if (bucket) bucket.count += 1;
  });

  const barItems = monthlyBars.map((b, i) => ({
    label: b.label,
    value: b.count,
    color: colorAt(i),
  }));

  const total = purchaseOrders.length;

  return (
    <div className={dashboardPanelClass}>
      <div className="mb-4 flex items-center gap-2">
        <IconPurchaseOrder />
        <h2 className={dashboardSectionTitleClass}>{t('dashboard.orderStatusDistribution')}</h2>
      </div>

      <div className="flex items-start gap-4">
        <DonutChart
          slices={slices.length > 0 ? slices : allSlices}
          size={112}
          strokeWidth={18}
          centerLabel={String(total)}
          centerSub={t('dashboard.purchaseOrdersShort')}
          emptyLabel={t('dashboard.noOrdersChart')}
        />
        <div className="min-w-0 flex-1 pt-0.5">
          <ChartLegend items={slices.length > 0 ? slices : allSlices} showPct maxItems={3} />
        </div>
      </div>

      <div className="mt-4 border-t border-gray-200/80 pt-4">
        <p className={`mb-2 ${dashboardChartTitleClass}`}>{t('dashboard.ordersCreatedTrend')}</p>
        <VerticalBarChart
          items={barItems}
          height={72}
          compact
          emptyLabel={t('dashboard.noOrdersChart')}
        />
      </div>
    </div>
  );
}
