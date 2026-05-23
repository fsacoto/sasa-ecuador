'use client';

type TableSortIconProps = {
  columnKey: string;
  activeKey: string;
  direction: 'asc' | 'desc';
};

/** Iconos de orden iguales a Inventario: ⇅ inactivo, chevron arriba/abajo activo. */
export default function TableSortIcon({ columnKey, activeKey, direction }: TableSortIconProps) {
  if (activeKey !== columnKey) {
    return (
      <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
        />
      </svg>
    );
  }
  if (direction === 'asc') {
    return (
      <svg className="h-4 w-4 shrink-0 text-[#515151]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 shrink-0 text-[#515151]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
