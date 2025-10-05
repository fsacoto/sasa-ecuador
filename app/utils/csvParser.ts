// CSV/Excel Parser for Bulk Import

export interface ParsedRow {
  [key: string]: string | number;
}

export function parseCSV(csvText: string): ParsedRow[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  // Get headers from first line
  const headers = lines[0].split(/[,\t]/).map(h => h.trim().replace(/^["']|["']$/g, ''));
  
  // Parse data rows
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(/[,\t]/).map(v => v.trim().replace(/^["']|["']$/g, ''));
    
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

export function detectColumnMapping(headers: string[]): {
  [key: string]: string;
} {
  const mapping: { [key: string]: string } = {};
  
  // Common patterns for each field
  const patterns = {
    sku: ['sku', 'item no', 'item number', 'product code', 'code'],
    description: ['description', 'name', 'product name', 'item name', 'desc'],
    quantity: ['qty', 'quantity', 'amount', 'units', 'pcs'],
    costPerUnit: ['price', 'price per unit', 'unit price', 'cost', 'cost per unit', 'unit cost'],
    totalCost: ['total', 'total price', 'total cost', 'amount'],
    supplierSKU: ['supplier sku', 'vendor sku', 'supplier code'],
  };

  headers.forEach((header) => {
    const lowerHeader = header.toLowerCase();
    
    // Check each pattern
    for (const [field, keywords] of Object.entries(patterns)) {
      if (keywords.some(keyword => lowerHeader.includes(keyword))) {
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
