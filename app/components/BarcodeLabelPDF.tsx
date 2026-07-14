'use client';

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { PurchaseOrder, InventoryItem } from '../types';
import { displayCategory, displayLine } from '../utils/merchandiseLabels';

/**
 * Physical thermal label: 40mm × 20mm.
 * Proportions matched to print reference:
 *  - top text band ≈ 18% of height
 *  - barcode ≈ 66% of height, ≈ 80% of width (side margins)
 *  - bottom description ≈ 12% of height
 *  - outer quiet zone ≈ 1mm
 */
const MM = 72 / 25.4;
const LABEL_W = 40 * MM;
const LABEL_H = 20 * MM;

const PAD = 1.0 * MM;
const CONTENT_W = LABEL_W - PAD * 2;
const CONTENT_H = LABEL_H - PAD * 2;

// Barcode band +10% vs prior (was ~70% of content → ~77%)
const TOP_BAND_H = CONTENT_H * 0.155;
const DESC_BAND_H = CONTENT_H * 0.105;
const BARCODE_BAND_H = CONTENT_H - TOP_BAND_H - DESC_BAND_H;
const BARCODE_W = CONTENT_W * 0.8;
const BARCODE_H = BARCODE_BAND_H * 0.96;

const TOP_TEXT_SIZE = 4.5 * 1.1; // +10%
const BOTTOM_TEXT_SIZE = 4 * 1.1; // +10%

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    padding: 0,
    fontFamily: 'Helvetica',
    width: LABEL_W,
    height: LABEL_H,
  },
  label: {
    width: LABEL_W,
    height: LABEL_H,
    padding: PAD,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
    height: TOP_BAND_H,
    width: CONTENT_W,
  },
  sku: {
    fontSize: TOP_TEXT_SIZE,
    fontWeight: 'bold',
    color: '#000000',
    fontFamily: 'Helvetica-Bold',
    flexShrink: 1,
    maxWidth: '40%',
  },
  categoryLine: {
    fontSize: TOP_TEXT_SIZE,
    fontWeight: 'bold',
    color: '#000000',
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
    flexShrink: 1,
    maxWidth: '58%',
  },
  barcodeContainer: {
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: CONTENT_W,
    height: BARCODE_BAND_H,
    overflow: 'hidden',
  },
  barcode: {
    width: BARCODE_W,
    height: BARCODE_H,
    objectFit: 'fill',
  },
  descriptionContainer: {
    flexShrink: 0,
    height: DESC_BAND_H,
    width: CONTENT_W,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {
    fontSize: BOTTOM_TEXT_SIZE,
    fontFamily: 'Helvetica',
    fontWeight: 'normal',
    color: '#000000',
    textAlign: 'center',
    lineHeight: 1.05,
  },
});

interface BarcodeLabelPDFProps {
  items: Array<{ order: PurchaseOrder | null; inventoryItem: InventoryItem; quantity: number }>;
  documentTitle?: string;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.substring(0, Math.max(0, max - 1))}…`;
}

export default function BarcodeLabelPDF({
  items,
  documentTitle = 'Etiquetas',
}: BarcodeLabelPDFProps) {
  const expandedItems: Array<{ order: PurchaseOrder | null; inventoryItem: InventoryItem }> = [];
  items.forEach((item) => {
    for (let i = 0; i < item.quantity; i++) {
      expandedItems.push({ order: item.order, inventoryItem: item.inventoryItem });
    }
  });

  const printable = expandedItems.filter((item) => {
    const src = (item.inventoryItem?.barcode || item.order?.barcode || '').trim();
    return src.length > 0;
  });

  return (
    <Document title={documentTitle} author="SASA" subject="Etiquetas 40x20mm">
      {printable.map((item, index) => {
        const barcodeSrc = (
          item.inventoryItem?.barcode ||
          item.order?.barcode ||
          ''
        ).trim();

        const { order, inventoryItem } = item;
        const name = order?.description || inventoryItem.name || inventoryItem.description || '';
        const sku = order?.sku || inventoryItem.sku || '';
        const category = displayCategory(order?.category || inventoryItem.category || '');
        const line = displayLine(order?.line || inventoryItem.line || '');
        const categoryLineText = [category, line].filter(Boolean).join(' • ');
        const itemId = order?.id || inventoryItem.id || `item-${index}`;

        return (
          <Page
            key={`${itemId}-${index}`}
            size={[LABEL_W, LABEL_H]}
            style={styles.page}
          >
            <View style={styles.label}>
              <View style={styles.topRow}>
                {sku ? (
                  <Text style={styles.sku}>{truncate(sku, 14)}</Text>
                ) : (
                  <View style={{ width: 1 }} />
                )}
                {categoryLineText ? (
                  <Text style={styles.categoryLine}>{truncate(categoryLineText, 24)}</Text>
                ) : null}
              </View>

              <View style={styles.barcodeContainer}>
                <Image src={barcodeSrc} style={styles.barcode} cache={false} />
              </View>

              <View style={styles.descriptionContainer}>
                <Text style={styles.description}>{truncate(name, 28)}</Text>
              </View>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
