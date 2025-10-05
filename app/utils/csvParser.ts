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

export function detectColumnMapping(headers: string[]): {
  [key: string]: string;
} {
  const mapping: { [key: string]: string } = {};
  
  // Common patterns for each field
  const patterns = {
    invoice: ['invoice', 'invoice number', 'invoice no', 'order number', 'po number', 'po#'],
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
