'use client';

import { useState } from 'react';

type Props = {
  entries: [string, number][];
  totalItems: number;
  t: (key: string) => string;
  emptyLabelKey?: string;
  listAriaLabelKey?: string;
};

export default function DashboardCategoryBreakdown({
  entries,
  totalItems,
  t,
  emptyLabelKey = 'dashboard.categoryEmpty',
  listAriaLabelKey = 'dashboard.inventoryByCategory',
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  if (entries.length === 0 || totalItems === 0) {
    return (
      <p className="text-[11px] text-gray-500">{t(emptyLabelKey)}</p>
    );
  }

  const handleCategoryPress = (category: string) => {
    setSelectedCategory((prev) => (prev === category ? null : category));
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="list"
      aria-label={t(listAriaLabelKey)}
    >
      {entries.map(([category, count]) => {
        const pct = totalItems > 0 ? (count / totalItems) * 100 : 0;
        const isSelected = selectedCategory === category;

        return (
          <button
            key={category}
            type="button"
            role="listitem"
            onClick={() => handleCategoryPress(category)}
            aria-expanded={isSelected}
            aria-label={
              isSelected
                ? `${category}, ${count}, ${pct.toFixed(0)}%`
                : `${category}, ${count}`
            }
            className={`sasa-dashboard-chip inline-flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1 transition-colors ${
              isSelected ? 'sasa-dashboard-chip--active' : ''
            }`}
          >
            <span className="sasa-dashboard-chip-label text-[11px] font-medium">{category}</span>
            <span className="sasa-dashboard-chip-value text-[11px] font-semibold tabular-nums">
              {count}
            </span>
            {isSelected && (
              <span className="sasa-dashboard-chip-muted text-[11px] tabular-nums">
                {pct.toFixed(0)}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
