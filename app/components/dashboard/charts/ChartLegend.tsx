'use client';

import { colorAt } from './chartTheme';

type Item = { label: string; value: number; color?: string; pct?: number };

type Props = {
  items: Item[];
  showPct?: boolean;
  maxItems?: number;
};

export default function ChartLegend({ items, showPct = true, maxItems = 8 }: Props) {
  const visible = items.slice(0, maxItems);
  const total = items.reduce((s, x) => s + x.value, 0);

  return (
    <ul className="flex min-w-0 flex-1 flex-col gap-1.5" role="list">
      {visible.map((item, i) => {
        const pct = item.pct ?? (total > 0 ? (item.value / total) * 100 : 0);
        return (
          <li key={`${item.label}-${i}`} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: item.color ?? colorAt(i) }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-gray-500">{item.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-gray-900">{item.value}</span>
            {showPct && (
              <span className="w-9 shrink-0 text-right tabular-nums text-gray-500">{pct.toFixed(0)}%</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
