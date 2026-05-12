// CSV/Excel Parser for Bulk Import

export interface ParsedRow {
  [key: string]: string | number;
}

// Helper function to split CSV line respecting quotes
function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      // Handle escaped quotes ("")
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if ((char === ',' || char === '\t') && !inQuotes) {
      // End of field
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  result.push(current.trim());
  
  return result;
}

export function parseCSV(csvText: string): ParsedRow[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  // Get headers from first line
  const headers = splitCSVLine(lines[0]).map(h => h.replace(/^["']|["']$/g, ''));
  
  // Parse data rows
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]).map(v => v.replace(/^["']|["']$/g, ''));
    
    if (values.length === headers.length) {
      const row: ParsedRow = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      rows.push(row);
    }
  }
  
  return rows;
}

/** Normalize header for matching (lowercase, strip common accents). */
function normalizeHeaderForMatch(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function detectColumnMapping(headers: string[]): {
  [key: string]: string;
} {
  const mapping: { [key: string]: string } = {};

  /**
   * Order matters: more specific keys first (e.g. supplier SKU before generic "supplier").
   * Internal SKU is never auto-mapped — it is generated or taken from inventory after import.
   */
  const patterns: Record<string, string[]> = {
    invoice: [
      'invoice',
      'invoice number',
      'invoice no',
      'order number',
      'po number',
      'po#',
      'factura',
      'numero de factura',
      'nro factura',
    ],
    supplierSKU: [
      'sku proveedor',
      'sku del proveedor',
      'sku supplier',
      'supplier sku',
      'vendor sku',
      'supplier code',
      'codigo proveedor',
      'codigo del proveedor',
      'ref proveedor',
      'referencia proveedor',
      'ref. proveedor',
    ],
    supplier: [
      'supplier name',
      'supplier',
      'vendor name',
      'vendor',
      'proveedor',
      'nombre proveedor',
      'nombre del proveedor',
    ],
    description: [
      'description',
      'name',
      'product name',
      'item name',
      'desc',
      'descripcion',
      'nombre',
      'articulo',
    ],
    totalCost: [
      'total cost',
      'total price',
      'coste total',
      'costo total',
      'importe total',
      'total linea',
      'total line',
      'subtotal',
    ],
    quantity: ['qty', 'quantity', 'amount', 'units', 'pcs', 'cantidad', 'unidades'],
    costPerUnit: [
      'price per unit',
      'unit price',
      'cost per unit',
      'unit cost',
      'precio unitario',
      'coste unitario',
      'costo unitario',
      'costo por unidad',
      'coste por unidad',
      'precio por unidad',
      'p. unit',
      'pu ',
    ],
    category: ['category', 'cat', 'type', 'product type', 'item type', 'categoria', 'rubro'],
    line: ['line', 'collection', 'series', 'product line', 'style', 'linea', 'coleccion'],
  };

  headers.forEach((header) => {
    const lowerHeader = header.toLowerCase();
    const norm = normalizeHeaderForMatch(header);
    const trimmed = lowerHeader.trim();

    // Short headers: unit cost (avoid matching "total cost" etc. — totalCost is listed first above)
    if (
      ['cost', 'price', 'precio', 'coste', 'costo', 'pvp'].includes(trimmed) &&
      !lowerHeader.includes('total')
    ) {
      mapping[header] = 'costPerUnit';
      return;
    }

    for (const [field, keywords] of Object.entries(patterns)) {
      const hit = keywords.some((keyword) => {
        const k = keyword.toLowerCase();
        const kn = normalizeHeaderForMatch(keyword);
        return lowerHeader.includes(k) || norm.includes(kn);
      });
      if (hit) {
        mapping[header] = field;
        break;
      }
    }
  });

  return mapping;
}

export function cleanNumericValue(value: string | number): number {
  if (typeof value === 'number') return value;
  
  // Remove currency symbols, commas, and other non-numeric characters
  const cleaned = value.toString()
    .replace(/[$€£¥₹,]/g, '')
    .replace(/[^\d.-]/g, '')
    .trim();
  
  return parseFloat(cleaned) || 0;
}
