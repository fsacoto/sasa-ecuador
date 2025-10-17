// SKU Generator Utility
// Format: [2 letters from category][1st letter of 1st word of line][1st letter of 2nd word of line][5 random numbers]
// Example: Category "Necklace" + Line "Gold Plated" = "NEGP12345"

export function generateSKU(category: string, line: string): string {
  // Get first 2 letters of category (uppercase)
  const categoryCode = (category || 'XX')
    .replace(/[^a-zA-Z]/g, '') // Remove non-letters
    .toUpperCase()
    .padEnd(2, 'X') // Pad with X if too short
    .substring(0, 2);

  // Get first letter of first word and first letter of second word from line
  const lineWords = (line || 'XX XX')
    .replace(/[^a-zA-Z\s]/g, '') // Remove non-letters except spaces
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0);

  let lineCode = 'XX';
  if (lineWords.length >= 2) {
    // First letter of first word + first letter of second word
    lineCode = (lineWords[0].charAt(0) + lineWords[1].charAt(0)).toUpperCase();
  } else if (lineWords.length === 1) {
    // If only one word, use first two letters
    lineCode = lineWords[0].substring(0, 2).toUpperCase().padEnd(2, 'X');
  }

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
