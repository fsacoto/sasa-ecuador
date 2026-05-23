'use client';

import { colorAt } from './chartTheme';

export type HBarItem = { label: string; value: number; color?: string };

type Props = {
  items: HBarItem[];
  emptyLabel?: string;
  maxBars?: number;
};

export default function HorizontalBarChart({
  items,
  emptyLabel = '—',
  maxBars = 6,
}: Props) {
  const visible = items.slice(0, maxBars);
  const maxVal = Math.max(...visible.map((x) => x.value), 1);

  if (visible.length === 0 || visible.every((x) => x.value === 0)) {
    return <p className="py-6 text-center text-xs text-gray-500">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-3" role="img">
      {visible.map((item, i) => {
        const pct = (item.value / maxVal) * 100;
        return (
          <div key={`${item.label}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-medium text-gray-500 sm:text-sm">{item.label}</span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-900 sm:text-sm">
                  {item.value}
                </span>
              </div>
              <div className="sasa-chart-track h-2 overflow-hidden rounded-full bg-gray-100/80">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: item.color ?? colorAt(i),
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
