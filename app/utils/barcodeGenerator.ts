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
 * Generates a barcode image as a File object for upload to Firebase Storage
 * @param sku - The SKU string to encode in the barcode
 * @returns Promise that resolves to a File object representing the barcode image
 */
export function generateBarcodeAsFile(sku: string): Promise<File> {
  return new Promise((resolve, reject) => {
    try {
      // Create a canvas element
      const canvas = document.createElement('canvas');
      
      // Generate barcode on the canvas
      JsBarcode(canvas, sku, {
        format: 'CODE128',
        width: 2,
        height: 80,
        displayValue: true,
        fontSize: 14,
        margin: 10,
      });
      
      // Convert canvas to blob, then to File
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create barcode blob'));
          return;
        }
        
        // Create File from Blob with a meaningful name
        const file = new File([blob], `barcode_${sku}.png`, {
          type: 'image/png',
          lastModified: Date.now(),
        });
        resolve(file);
      }, 'image/png');
    } catch (error) {
      console.error('Error generating barcode:', error);
      reject(new Error('Failed to generate barcode'));
    }
  });
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

/**
 * Checks if a barcode is stored as base64 or a Firebase Storage URL
 * @param barcode - The barcode string to check
 * @returns True if it's a Firebase Storage URL, false if it's base64
 */
export function isFirebaseStorageBarcode(barcode: string): boolean {
  // Check if it starts with 'data:' (base64) or 'http://' / 'https://' (URL)
  return barcode.startsWith('http://') || barcode.startsWith('https://');
}

/**
 * Checks if a barcode is base64 encoded
 * @param barcode - The barcode string to check
 * @returns True if it's base64, false otherwise
 */
export function isBase64Barcode(barcode: string): boolean {
  return barcode.startsWith('data:image');
}
