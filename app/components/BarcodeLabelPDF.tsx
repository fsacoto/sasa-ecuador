// This is the PDF component for the barcode labels 
xsakmsa

c
asccsa]

cachesas
'use client';

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { PurchaseOrder, InventoryItem } from '../types';

// 40mm x 20mm thermal label
// At 72 DPI: 40mm = 113.39pt, 20mm = 56.69pt
const PAGE_WIDTH = 113.39; // pt (40mm)
const PAGE_HEIGHT = 56.69; // pt (20mm)
const LABEL_WIDTH = 113.39; // pt (40mm)
const LABEL_HEIGHT = 56.69; // pt (20mm)

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    padding: 0,
    fontFamily: 'Helvetica',
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
  },
  label: {
    width: LABEL_WIDTH,
    height: LABEL_HEIGHT,
    padding: 2,
    borderWidth: 0.5,
    borderColor: '#000000',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 2,
    marginBottom: 3,
    minHeight: 6,
  },
  sku: {
    fontSize: 6,
    fontWeight: 'bold',
    color: '#000000',
    fontFamily: 'Helvetica-Bold',
    flexShrink: 0,
  },
  categoryLineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryLine: {
    fontSize: 4,
    color: '#000000',
    fontWeight: 'bold',
  },
  barcodeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
    marginTop: 1,
  },
  barcode: {
    width: 147, // 40% bigger than 105 (105 * 1.4 = 147)
    height: 39, // 40% bigger than 28 (28 * 1.4 = 39.2, rounded to 39)
    objectFit: 'contain',
  },
  descriptionContainer: {
    paddingHorizontal: 3,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxHeight: 8,
  },
  description: {
    fontSize: 5,
    color: '#000000',
    lineHeight: 1.2,
    textAlign: 'center',
    overflow: 'hidden',
  },
});

interface BarcodeLabelPDFProps {
  items: Array<{ order: PurchaseOrder | null; inventoryItem: InventoryItem; quantity: number }>;
}

export default function BarcodeLabelPDF({ items }: BarcodeLabelPDFProps) {
  // Create one page per label (40mm x 20mm)
  // Expand items based on quantity
  const expandedItems: Array<{ order: PurchaseOrder | null; inventoryItem: InventoryItem }> = [];
  items.forEach((item) => {
    for (let i = 0; i < item.quantity; i++) {
      expandedItems.push({ order: item.order, inventoryItem: item.inventoryItem });
    }
  });

  return (
    <Document>
      {expandedItems.map((item, index) => {
        if (!item.inventoryItem || !item.inventoryItem.barcode) {
          return null;
        }

        const { order, inventoryItem } = item;
        const name = order?.description || inventoryItem.name || inventoryItem.description || '';
        // Truncate name if too long
        const truncatedName = name.length > 30 ? name.substring(0, 27) + '...' : name;
        const sku = order?.sku || inventoryItem.sku || '';
        const category = order?.category || inventoryItem.category || '';
        const line = order?.line || inventoryItem.line || '';
        const itemId = order?.id || inventoryItem.id || `item-${index}`;

        return (
          <Page key={`${itemId}-${index}`} size={[PAGE_WIDTH, PAGE_HEIGHT]} style={styles.page}>
            <View style={styles.label}>
              {/* Top Row: SKU on left, Category/Line on right */}
              <View style={styles.topRow}>
                {sku && <Text style={styles.sku}>{sku}</Text>}
                {!sku && <View style={{ width: 1 }} />}
                {(category || line) && (
                  <View style={styles.categoryLineContainer}>
                    {category && <Text style={styles.categoryLine}>{category}</Text>}
                    {category && line && <Text style={[styles.categoryLine, { marginLeft: 1, marginRight: 1 }]}>•</Text>}
                    {line && <Text style={styles.categoryLine}>{line}</Text>}
                  </View>
                )}
              </View>

              {/* Barcode - bigger and centered */}
              <View style={styles.barcodeContainer}>
                <Image
                  src={inventoryItem.barcode}
                  style={styles.barcode}
                  cache={false}
                />
              </View>

              {/* Description - below barcode, centered, better margins */}
              <View style={styles.descriptionContainer}>
                <Text style={styles.description}>{truncatedName}</Text>
              </View>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}

