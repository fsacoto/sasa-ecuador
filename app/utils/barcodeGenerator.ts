import JsBarcode from 'jsbarcode';

/**
 * Converts a SKU string to a deterministic 11-digit number using a hash function
 * @param sku - The SKU string to convert
 * @returns 11-digit number as string
 */
function skuTo11DigitNumber(sku: string): string {
  // Use a more robust hash to ensure we get a good distribution
  // and always produce exactly 11 digits
  let hash1 = 0;
  let hash2 = 0;
  
  for (let i = 0; i < sku.length; i++) {
    const char = sku.charCodeAt(i);
    hash1 = ((hash1 << 5) - hash1) + char;
    hash1 = hash1 & hash1; // Convert to 32-bit integer
    hash2 = ((hash2 << 3) - hash2) + char * (i + 1);
    hash2 = hash2 & hash2;
  }
  
  // Combine both hashes using modulo to ensure we get exactly 11 digits
  // Use modulo to ensure we stay within 11-digit range (0 to 99999999999)
  const max11Digit = 99999999999; // 11 nines
  const absHash1 = Math.abs(hash1);
  const absHash2 = Math.abs(hash2);
  
  // Combine hashes safely using modulo arithmetic
  const combinedHash = ((absHash1 % 1000000) * 100000 + (absHash2 % 100000)) % (max11Digit + 1);
  
  // Convert to string and pad to exactly 11 digits
  return combinedHash.toString().padStart(11, '0');
}

/**
 * Calculates the UPC-A check digit
 * @param digits - 11-digit number as string
 * @returns Check digit (0-9)
 */
function calculateUPCCheckDigit(digits: string): number {
  let sum = 0;
  
  // Sum odd positions (1st, 3rd, 5th, etc.) - multiplied by 3
  for (let i = 0; i < 11; i += 2) {
    sum += parseInt(digits[i]) * 3;
  }
  
  // Sum even positions (2nd, 4th, 6th, etc.)
  for (let i = 1; i < 11; i += 2) {
    sum += parseInt(digits[i]);
  }
  
  // Calculate check digit
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Generates a 12-digit UPC-A barcode number from a SKU
 * @param sku - The SKU string to convert
 * @returns 12-digit UPC-A number as string
 */
function generateUPCAFromSKU(sku: string): string {
  const elevenDigits = skuTo11DigitNumber(sku);
  const checkDigit = calculateUPCCheckDigit(elevenDigits);
  return elevenDigits + checkDigit.toString();
}

/**
 * Generates a barcode image as a base64 string from the given SKU
 * @param sku - The SKU string to encode in the barcode
 * @returns Base64 encoded PNG image of the barcode
 */
export function generateBarcodeFromSKU(sku: string): string {
  // Create a canvas element
  const canvas = document.createElement('canvas');
  
  try {
    // Generate 12-digit UPC-A number from SKU
    const upcNumber = generateUPCAFromSKU(sku);
    
    // Generate barcode on the canvas
    JsBarcode(canvas, upcNumber, {
      format: 'UPC',
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
      
      // Generate 12-digit UPC-A number from SKU
      const upcNumber = generateUPCAFromSKU(sku);
      
      // Generate barcode on the canvas
      JsBarcode(canvas, upcNumber, {
        format: 'UPC',
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
 * Gets the 12-digit UPC-A barcode number for a given SKU
 * @param sku - The SKU string
 * @returns 12-digit UPC-A number as string
 */
export function getUPCAFromSKU(sku: string): string {
  return generateUPCAFromSKU(sku);
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
