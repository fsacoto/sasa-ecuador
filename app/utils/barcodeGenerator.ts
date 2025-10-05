import JsBarcode from 'jsbarcode';

/**
 * Generates a barcode image as a base64 string from the given SKU
 * @param sku - The SKU string to encode in the barcode
 * @returns Base64 encoded PNG image of the barcode
 */
export function generateBarcodeFromSKU(sku: string): string {
  // Create a canvas element
  const canvas = document.createElement('canvas');
  
  try {
    // Generate barcode on the canvas
    JsBarcode(canvas, sku, {
      format: 'CODE128',
      width: 2,
      height: 80,
      displayValue: true,
      fontSize: 14,
      margin: 10,
    });
    
    // Convert canvas to base64
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Error generating barcode:', error);
    throw new Error('Failed to generate barcode');
  }
}

/**
 * Validates if a SKU is valid for barcode generation
 * @param sku - The SKU to validate
 * @returns True if valid, false otherwise
 */
export function isValidBarcodeInput(sku: string): boolean {
  // SKU should not be empty and should be alphanumeric with hyphens
  return sku.length > 0 && /^[A-Za-z0-9-]+$/.test(sku);
}
