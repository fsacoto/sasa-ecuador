/** Formato PO-##### para mostrar en listas de facturas (misma lógica que verificación PDF). */
export function formatPONumber(invoice: string): string {
  if (invoice && invoice.startsWith('PO-')) {
    return invoice;
  }
  const numbers = invoice.match(/\d+/);
  if (numbers) {
    return `PO-${String(numbers[0]).padStart(5, '0')}`;
  }
  return invoice || 'PO-00000';
}
