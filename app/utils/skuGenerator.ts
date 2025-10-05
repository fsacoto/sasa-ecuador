// SKU Generator Utility
// Format: [2 letters from category][2 letters from line][5 random numbers]
// Example: Category "Rings" + Line "Gold" = "RIGO12345"

export function generateSKU(category: string, line: string): string {
  // Get first 2 letters of category (uppercase)
  const categoryCode = (category || 'XX')
    .replace(/[^a-zA-Z]/g, '') // Remove non-letters
    .toUpperCase()
    .padEnd(2, 'X') // Pad with X if too short
    .substring(0, 2);

  // Get first 2 letters of line (uppercase)
  const lineCode = (line || 'XX')
    .replace(/[^a-zA-Z]/g, '') // Remove non-letters
    .toUpperCase()
    .padEnd(2, 'X') // Pad with X if too short
    .substring(0, 2);

  // Generate 5 random numbers
  const randomNumbers = Math.floor(10000 + Math.random() * 90000).toString();

  return `${categoryCode}${lineCode}${randomNumbers}`;
}

// Check if a SKU already exists in the inventory
export function isSkuUnique(sku: string, existingSkus: string[]): boolean {
  return !existingSkus.includes(sku);
}

// Generate a unique SKU by checking against existing ones
export function generateUniqueSKU(
  category: string,
  line: string,
  existingSkus: string[],
  maxAttempts: number = 10
): string {
  let attempts = 0;
  let sku = generateSKU(category, line);

  // Keep generating until we get a unique one (with max attempts safety)
  while (!isSkuUnique(sku, existingSkus) && attempts < maxAttempts) {
    sku = generateSKU(category, line);
    attempts++;
  }

  return sku;
}

// Format SKU for display (optional - adds hyphen for readability)
export function formatSKU(sku: string): string {
  if (sku.length >= 4) {
    return `${sku.substring(0, 4)}-${sku.substring(4)}`;
  }
  return sku;
}
