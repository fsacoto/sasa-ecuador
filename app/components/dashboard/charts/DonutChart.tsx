'use client';

import { colorAt } from './chartTheme';

export type DonutSlice = {
  label: string;
  value: number;
  color?: string;
};

const TRACK_STROKE = 'rgba(255, 255, 255, 0.12)';

type Props = {
  slices: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerSub?: string;
  emptyLabel?: string;
};

export default function DonutChart({
  slices,
  size = 160,
  strokeWidth = 22,
  centerLabel,
  centerSub,
  emptyLabel = '—',
}: Props) {
  const activeSlices = slices.filter((s) => s.value > 0);
  const total = activeSlices.reduce((s, x) => s + x.value, 0);
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  /** Pequeño hueco entre segmentos cuando hay más de uno */
  const segmentGap = activeSlices.length > 1 ? 3 : 0;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2" style={{ width: size, height: size }}>
        <svg className="sasa-chart-svg" width={size} height={size} aria-hidden>
          <circle
            data-chart-track
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={TRACK_STROKE}
            strokeWidth={strokeWidth}
          />
        </svg>
        <p className="text-center text-xs text-gray-500">{emptyLabel}</p>
      </div>
    );
  }

  let cumulative = 0;

  return (
    <div className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg className="sasa-chart-svg" width={size} height={size} role="img" aria-label={centerLabel}>
        <circle
          data-chart-track
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={TRACK_STROKE}
          strokeWidth={strokeWidth}
        />
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {activeSlices.map((slice, i) => {
            const pct = slice.value / total;
            const dash = Math.max(0, pct * circumference - segmentGap);
            const offset = cumulative;
            cumulative += pct * circumference;
            const segmentColor = slice.color ?? colorAt(i);

            return (
              <circle
                key={`${slice.label}-${i}`}
                data-chart-segment
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={segmentColor}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                style={{ ['--sasa-chart-segment-color' as string]: segmentColor }}
              />
            );
          })}
        </g>
      </svg>
      {(centerLabel || centerSub) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
          {centerLabel && (
            <span className="text-xl font-semibold leading-none tabular-nums text-gray-900">{centerLabel}</span>
          )}
          {centerSub && (
            <span className="mt-0.5 max-w-[5.5rem] text-[10px] font-medium leading-tight text-gray-500">
              {centerSub}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
