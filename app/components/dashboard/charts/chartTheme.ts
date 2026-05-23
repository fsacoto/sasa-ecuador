/** Paleta para gráficos del dashboard (legible en .app-dark-main) */
export const CHART_COLORS = [
  '#34d399', // emerald-400
  '#38bdf8', // sky-400
  '#fbbf24', // amber-400
  '#a78bfa', // violet-400
  '#fb7185', // rose-400
  '#94a3b8', // slate-400
  '#2dd4bf', // teal-400
  '#f472b6', // pink-400
] as const;

export function colorAt(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

/** Dorados para líneas de mercancía en barras de inventario (Enchapado = oro premium). */
const LINE_BAR_GOLD: Record<string, string> = {
  'enchapado en oro': '#E8C547',
  'oro relleno': '#E8C547',
  'gold filled': '#E8C547',
  'bañado en oro': '#E8C547',
  'banado en oro': '#E8C547',
  'baño en oro': '#9A7224',
  'bano en oro': '#9A7224',
  'oro laminado': '#9A7224',
  'gold plated': '#9A7224',
};

export function lineBarColor(label: string, index: number): string {
  const key = label.trim().toLowerCase();
  return LINE_BAR_GOLD[key] ?? colorAt(index);
}

export const dashboardPanelClass =
  'sasa-dashboard-panel rounded-2xl border border-gray-200/90 bg-white p-4 text-left sm:p-5';

export const dashboardKpiClass =
  'sasa-dashboard-panel rounded-2xl border border-gray-200/90 bg-white p-4 text-left';

/**
 * Jerarquía tipográfica del dashboard:
 * 1 saludo → 2 sección → 3 etiqueta tarjeta → 4 título gráfico → 5 hint
 */

/** 1 — Saludo (Buenas noches, …) */
export const dashboardGreetingClass =
  'text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl';

/** 2 — Título de bloque (Resumen de inventario, Ventas, Estado de órdenes) */
export const dashboardSectionTitleClass =
  'text-lg font-semibold tracking-tight text-gray-900 sm:text-xl';

/** 3 — Etiqueta en tarjetas de métricas (fila superior + KPIs ventas) */
export const dashboardCardLabelClass =
  'text-sm font-medium leading-snug text-gray-500 sm:text-base';

/** 4 — Título de gráfico dentro de un panel (Ventas por día, por categoría, etc.) */
export const dashboardChartTitleClass =
  'text-sm font-semibold text-gray-500';

/** 5 — Texto auxiliar / leyenda pequeña */
export const dashboardHintClass = 'text-xs leading-snug text-gray-500';

/** Valores numéricos destacados */
export const dashboardValueXlClass = 'text-3xl font-semibold tabular-nums tracking-tight text-gray-900';
export const dashboardValueLgClass = 'text-2xl font-semibold tabular-nums tracking-tight text-gray-900';
export const dashboardValueMdClass =
  'text-2xl font-semibold tabular-nums tracking-tight text-gray-900 sm:text-3xl';

/** @deprecated Usar dashboardSectionTitleClass */
export const dashboardSectionHeadingClass = dashboardSectionTitleClass;
/** @deprecated Usar dashboardSectionTitleClass */
export const dashboardSectionHeadingSmClass = dashboardSectionTitleClass;
/** @deprecated Usar dashboardChartTitleClass */
export const dashboardSubheadingClass = dashboardChartTitleClass;
/** @deprecated Usar dashboardCardLabelClass */
export const dashboardTopMetricLabelClass = dashboardCardLabelClass;
/** @deprecated Usar dashboardCardLabelClass */
export const dashboardMetricLabelClass = dashboardCardLabelClass;

/** Colores de estado (órdenes y cobro) — misma semántica en todo el dashboard */
export const STATUS_CHART_COLORS = {
  ordered: '#fbbf24',
  received: '#38bdf8',
  verified: '#34d399',
  paid: '#34d399',
  partial: '#38bdf8',
  unpaid: '#fbbf24',
} as const;
