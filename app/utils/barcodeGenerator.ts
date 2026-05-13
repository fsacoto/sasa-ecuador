'use client';

import * as JsBarcodePkg from 'jsbarcode';
import type { InventoryItem } from '../types';

/**
 * Barcodes via JsBarcode (https://github.com/lindell/JsBarcode).
 * Inline / Inventory: sync PNG data URL (canvas), matching legacy commit 28c1b034.
 * Upload / PO sync: SVG file first, then PNG from canvas.
 */

interface BarcodeRenderOptions {
  format: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  text?: string;
  fontOptions?: string;
  font?: string;
  textAlign?: string;
  textPosition?: string;
  textMargin?: number;
  fontSize?: number;
  background?: string;
  lineColor?: string;
  margin?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  valid?(valid: boolean): void;
}

type JsBarcodeFn = (
  element: HTMLCanvasElement | SVGElement,
  value: string,
  options?: BarcodeRenderOptions
) => void;

function resolveJsBarcodeExport(mod: unknown): JsBarcodeFn {
  const candidates: unknown[] = [
    mod,
    mod && typeof mod === 'object' && 'default' in mod
      ? (mod as { default: unknown }).default
      : undefined,
    mod &&
    typeof mod === 'object' &&
    'default' in mod &&
    typeof (mod as { default: unknown }).default === 'object' &&
    (mod as { default: { default?: unknown } }).default &&
    'default' in (mod as { default: { default?: unknown } }).default
      ? (mod as { default: { default: unknown } }).default.default
      : undefined,
  ];
  const fn = candidates.find((c) => typeof c === 'function');
  if (!fn) {
    throw new Error('JsBarcode: could not resolve a function export from the module');
  }
  return fn as JsBarcodeFn;
}

const JsBarcodeSync: JsBarcodeFn = resolveJsBarcodeExport(JsBarcodePkg);

let jsBarcodePromise: Promise<JsBarcodeFn> | null = null;

function loadJsBarcode(): Promise<JsBarcodeFn> {
  if (!jsBarcodePromise) {
    jsBarcodePromise = Promise.resolve(JsBarcodeSync);
  }
  return jsBarcodePromise;
}

function skuTo11DigitNumber(sku: string): string {
  let hash1 = 0;
  let hash2 = 0;

  for (let i = 0; i < sku.length; i++) {
    const char = sku.charCodeAt(i);
    hash1 = (hash1 << 5) - hash1 + char;
    hash1 = hash1 & hash1;
    hash2 = (hash2 << 3) - hash2 + char * (i + 1);
    hash2 = hash2 & hash2;
  }

  const max11Digit = 99999999999;
  const absHash1 = Math.abs(hash1);
  const absHash2 = Math.abs(hash2);
  const combinedHash =
    ((absHash1 % 1000000) * 100000 + (absHash2 % 100000)) % (max11Digit + 1);

  return combinedHash.toString().padStart(11, '0');
}

function calculateUPCCheckDigit(digits: string): number {
  let sum = 0;
  for (let i = 0; i < 11; i += 2) {
    sum += parseInt(digits[i], 10) * 3;
  }
  for (let i = 1; i < 11; i += 2) {
    sum += parseInt(digits[i], 10);
  }
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

function generateFallbackDigitPayload(sku: string): string {
  const eleven = skuTo11DigitNumber(sku);
  const check = calculateUPCCheckDigit(eleven);
  return eleven + check.toString();
}

function normalizeSkuForBarcode(sku: string): string {
  const t = sku.trim();
  if (!t) return '';
  const ascii = t.replace(/[^\x20-\x7E]/g, '');
  const safe = ascii.replace(/[^A-Za-z0-9\-_.]/g, '');
  return safe.length > 0 ? safe : generateFallbackDigitPayload(sku);
}

function barcodeOptions(sku: string, encodedValue: string): BarcodeRenderOptions {
  const label = sku.length <= 48 ? sku : encodedValue;
  return {
    format: 'CODE128',
    width: 2,
    height: 96,
    displayValue: true,
    fontSize: 14,
    margin: 12,
    marginTop: 8,
    marginBottom: 8,
    background: '#ffffff',
    lineColor: '#000000',
    text: label,
    textAlign: 'center',
  };
}

function withOffscreenSvg<T>(fn: (svg: SVGSVGElement) => T): T {
  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText =
    'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  holder.appendChild(svg);
  document.body.appendChild(holder);
  try {
    return fn(svg);
  } finally {
    document.body.removeChild(holder);
  }
}

/** JsBarcode → SVG string (no canvas). */
function renderBarcodeSvgXml(JsBarcode: JsBarcodeFn, sku: string, value: string): string {
  return withOffscreenSvg((svg) => {
    JsBarcode(svg, value, barcodeOptions(sku, value));
    return new XMLSerializer().serializeToString(svg);
  });
}

function encodeWithFallback(JsBarcode: JsBarcodeFn, sku: string): string {
  const primary = normalizeSkuForBarcode(sku);
  const fallback = generateFallbackDigitPayload(sku);
  try {
    return renderBarcodeSvgXml(JsBarcode, sku, primary);
  } catch (e) {
    console.warn('Barcode encode (primary) failed, fallback digits:', e);
    return renderBarcodeSvgXml(JsBarcode, sku, fallback);
  }
}

/** Preferred: small SVG file, valid image/* for Storage + <img>. */
export async function generateBarcodeSvgFile(sku: string): Promise<File> {
  if (typeof document === 'undefined') {
    throw new Error('Barcode generation requires a browser');
  }
  const JsBarcode = await loadJsBarcode();
  const xml = encodeWithFallback(JsBarcode, sku);
  if (!xml || xml.length < 80) {
    throw new Error('Generated barcode SVG was empty');
  }
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const safeName = sku.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 80);
  return new File([blob], `barcode_${safeName}.svg`, { type: 'image/svg+xml' });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** PNG via canvas (fallback). */
async function generateBarcodePngFile(sku: string): Promise<File> {
  const JsBarcode = await loadJsBarcode();
  const primary = normalizeSkuForBarcode(sku);
  const fallback = generateFallbackDigitPayload(sku);

  const drawCanvas = (value: string): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, barcodeOptions(sku, value));
    if (canvas.width < 2 || canvas.height < 2) {
      throw new Error('JsBarcode produced an empty canvas');
    }
    return canvas;
  };

  let canvas: HTMLCanvasElement;
  try {
    canvas = drawCanvas(primary);
  } catch {
    canvas = drawCanvas(fallback);
  }

  await nextFrame();
  await nextFrame();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.size === 0) {
          reject(new Error('Barcode PNG blob was empty'));
          return;
        }
        const safeName = sku.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 80);
        resolve(
          new File([blob], `barcode_${safeName}.png`, {
            type: 'image/png',
            lastModified: Date.now(),
          })
        );
      },
      'image/png',
      1
    );
  });
}

/**
 * File for upload: SVG first (most reliable), then PNG.
 */
export async function generateBarcodeAsFile(sku: string): Promise<File> {
  try {
    return await generateBarcodeSvgFile(sku);
  } catch (e) {
    console.warn('SVG barcode failed, using PNG:', e);
    return generateBarcodePngFile(sku);
  }
}

/**
 * PNG data URL for inline display and persisting on the item (canvas + toDataURL),
 * same approach as commit 28c1b034 — synchronous, no Storage upload.
 */
export function generateBarcodeFromSKU(sku: string): string {
  if (typeof document === 'undefined') {
    throw new Error('Barcode generation requires a browser');
  }
  const primary = normalizeSkuForBarcode(sku);
  const fallback = generateFallbackDigitPayload(sku);
  const draw = (value: string): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    JsBarcodeSync(canvas, value, barcodeOptions(sku, value));
    if (canvas.width < 2 || canvas.height < 2) {
      throw new Error('JsBarcode produced an empty canvas');
    }
    return canvas;
  };
  let canvas: HTMLCanvasElement;
  try {
    canvas = draw(primary);
  } catch (e) {
    console.warn('Barcode encode (primary) failed, fallback digits:', e);
    canvas = draw(fallback);
  }
  return canvas.toDataURL('image/png');
}

/** Extension to use in Storage path */
export function barcodeStorageExtension(file: File): 'svg' | 'png' {
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    return 'svg';
  }
  return 'png';
}

/** Any non-empty SKU after trim — encoding normalizes unsafe characters */
export function isValidBarcodeInput(sku: string): boolean {
  return typeof sku === 'string' && sku.trim().length > 0;
}

export function getUPCAFromSKU(sku: string): string {
  return generateFallbackDigitPayload(sku);
}

/**
 * Resolves a scanner read to an inventory row using the same rules as label generation
 * (CODE128 primary = normalized SKU, fallback = 12-digit UPC payload). Also matches internal
 * SKU, supplier SKU, case-insensitive where appropriate.
 */
export function findInventoryItemByBarcodeScan(
  inventory: InventoryItem[],
  scannedRaw: string
): InventoryItem | null {
  const scanned = scannedRaw.trim();
  if (!scanned) return null;
  const lower = scanned.toLowerCase();

  for (const item of inventory) {
    const normalized = normalizeSkuForBarcode(item.sku);
    if (normalized && (normalized === scanned || normalized.toLowerCase() === lower)) {
      return item;
    }
    const skuTrim = item.sku.trim();
    if (skuTrim === scanned || skuTrim.toLowerCase() === lower) {
      return item;
    }
    if (generateFallbackDigitPayload(item.sku) === scanned) {
      return item;
    }
    const sup = item.supplierSKU?.trim();
    if (sup && (sup === scanned || sup.toLowerCase() === lower)) {
      return item;
    }
  }
  return null;
}

export function isFirebaseStorageBarcode(barcode: string): boolean {
  return barcode.startsWith('http://') || barcode.startsWith('https://');
}

export function isBase64Barcode(barcode: string): boolean {
  return barcode.startsWith('data:image');
}
