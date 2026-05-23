'use client';

import { colorAt } from './chartTheme';

export type VBarItem = { label: string; value: number; color?: string };

type Props = {
  items: VBarItem[];
  height?: number;
  formatValue?: (n: number) => string;
  emptyLabel?: string;
  compact?: boolean;
};

export default function VerticalBarChart({
  items,
  height = 140,
  formatValue = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0)),
  emptyLabel = '—',
  compact = false,
}: Props) {
  const maxVal = Math.max(...items.map((x) => x.value), 0);
  const chartHeight = compact ? Math.min(height, 100) : height;
  const barArea = chartHeight - 28;

  if (items.length === 0) {
    return (
      <div
        className="sasa-dashboard-empty flex items-center justify-center rounded-lg border border-dashed border-gray-200/60 px-3 text-center text-xs text-gray-500"
        style={{ minHeight: compact ? 72 : chartHeight }}
      >
        {emptyLabel}
      </div>
    );
  }

  if (maxVal === 0) {
    return (
      <div
        className="sasa-dashboard-empty flex items-end justify-between gap-1 sm:gap-2 opacity-60"
        style={{ height: chartHeight }}
        role="img"
        aria-label={emptyLabel}
      >
        {items.map((item, i) => (
          <div key={`${item.label}-${i}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div className="h-1 w-full max-w-[2.5rem] rounded-t bg-gray-300/40 sm:max-w-[3rem]" />
            <span className="max-w-full truncate text-center text-[9px] text-gray-500">{item.label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-end justify-between gap-1 sm:gap-2" style={{ height: chartHeight }} role="img">
      {items.map((item, i) => {
        const h = maxVal > 0 ? Math.max(4, (item.value / maxVal) * barArea) : 4;
        return (
          <div
            key={`${item.label}-${i}`}
            className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
          >
            <span className="text-[9px] font-medium tabular-nums text-gray-500 sm:text-[10px]">
              {item.value > 0 ? formatValue(item.value) : ''}
            </span>
            <div
              className="w-full max-w-[2.5rem] rounded-t-md transition-all duration-500 sm:max-w-[3rem]"
              style={{
                height: h,
                backgroundColor: item.color ?? colorAt(i),
                opacity: item.value > 0 ? 1 : 0.25,
              }}
              title={`${item.label}: ${item.value}`}
            />
            <span className="max-w-full truncate text-center text-[9px] text-gray-500">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}
