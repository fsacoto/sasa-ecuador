'use client';

import DonutChart from './charts/DonutChart';
import ChartLegend from './charts/ChartLegend';
import HorizontalBarChart from './charts/HorizontalBarChart';
import {
  colorAt,
  lineBarColor,
  dashboardChartTitleClass,
  dashboardHintClass,
  dashboardPanelClass,
  dashboardSectionTitleClass,
  dashboardValueMdClass,
} from './charts/chartTheme';

type Props = {
  t: (key: string) => string;
  inventoryValue: number;
  categoryEntries: [string, number][];
  lineEntries: [string, number][];
  totalItems: number;
  showValue: boolean;
};

function iconClass(extra?: string) {
  return ['h-4 w-4 shrink-0 text-gray-500', extra].filter(Boolean).join(' ');
}

function IconGlobe({ className }: { className?: string }) {
  return (
    <svg className={iconClass(className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path strokeLinecap="round" d="M2 12h20" />
    </svg>
  );
}

function IconTag({ className }: { className?: string }) {
  return (
    <svg className={iconClass(className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
      />
    </svg>
  );
}

function IconLayers({ className }: { className?: string }) {
  return (
    <svg className={iconClass(className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}

export default function DashboardInventoryVisual({
  t,
  inventoryValue,
  categoryEntries,
  lineEntries,
  totalItems,
  showValue,
}: Props) {
  const categorySlices = categoryEntries.map(([label, value], i) => ({
    label,
    value,
    color: colorAt(i),
  }));

  const lineBars = lineEntries.map(([label, value], i) => ({
    label,
    value,
    color: lineBarColor(label, i),
  }));

  return (
    <section className={dashboardPanelClass}>
      <h2 className={`mb-4 ${dashboardSectionTitleClass}`}>
        {t('dashboard.inventoryOverviewTitle')}
      </h2>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start lg:gap-4">
        {showValue && (
          <div className="lg:col-span-3">
            <div className="mb-2 flex items-center gap-2">
              <IconGlobe />
              <p className={dashboardChartTitleClass}>{t('dashboard.inventoryValue')}</p>
            </div>
            <p className={dashboardValueMdClass}>${inventoryValue.toFixed(2)}</p>
            <p className={`mt-1 ${dashboardHintClass}`}>{t('dashboard.inventoryValueHint')}</p>
          </div>
        )}

        <div
          className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4 ${
            showValue ? 'lg:col-span-5' : 'lg:col-span-6'
          }`}
        >
          <DonutChart
            slices={categorySlices}
            size={showValue ? 120 : 128}
            strokeWidth={18}
            centerLabel={String(totalItems)}
            centerSub={t('dashboard.items')}
            emptyLabel={t('dashboard.categoryEmpty')}
          />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <IconTag />
              <p className={dashboardChartTitleClass}>{t('dashboard.inventoryByCategory')}</p>
            </div>
            <ChartLegend items={categorySlices} showPct maxItems={6} />
          </div>
        </div>

        <div className={`min-w-0 ${showValue ? 'lg:col-span-4' : 'lg:col-span-6'}`}>
          <div className="mb-2 flex items-center gap-2">
            <IconLayers />
            <p className={dashboardChartTitleClass}>{t('dashboard.inventoryByLine')}</p>
          </div>
          <HorizontalBarChart items={lineBars} emptyLabel={t('dashboard.lineEmpty')} maxBars={6} />
        </div>
      </div>
    </section>
  );
}
