/** Formato OC-##### para mostrar en listas de facturas (órdenes de compra). */
export function formatPONumber(invoice: string): string {
  const raw = (invoice || '').trim();
  if (!raw) {
    return 'OC-00000';
  }
  if (raw.startsWith('OC-')) {
    return raw;
  }
  if (raw.startsWith('PO-')) {
    return `OC-${raw.slice(3)}`;
  }
  const numbers = raw.match(/\d+/);
  if (numbers) {
    return `OC-${String(numbers[0]).padStart(5, '0')}`;
  }
  return raw;
}
