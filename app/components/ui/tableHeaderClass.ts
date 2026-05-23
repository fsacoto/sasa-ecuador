/** Clases de encabezado de tabla (referencia: Inventario). */
export const tableTheadClass = 'bg-gray-50 border-b border-gray-200';

export const tableThBaseClass =
  'px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider';

export const tableThSortableClass = `${tableThBaseClass} cursor-pointer hover:bg-gray-100 transition-colors`;

export type TableThAlign = 'left' | 'center' | 'right';

export function tableThAlignClass(align: TableThAlign): string {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

export function tableThLabelFlexClass(align: TableThAlign): string {
  const base = 'flex items-center gap-1';
  if (align === 'center') return `${base} justify-center`;
  if (align === 'right') return `${base} justify-end`;
  return base;
}
