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
    justifyContent: 'space-between',
  },
  barcodeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 30,
    marginBottom: 1,
  },
  barcode: {
    width: 105,
    height: 28,
    objectFit: 'contain',
  },
  nameContainer: {
    paddingHorizontal: 2,
    marginBottom: 1,
    minHeight: 6,
    maxHeight: 8,
    flex: 1,
  },
  name: {
    fontSize: 6,
    color: '#000000',
    lineHeight: 1.2,
    overflow: 'hidden',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 2,
    marginTop: 'auto',
  },
  sku: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#000000',
    fontFamily: 'Helvetica-Bold',
  },
  categoryLineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryLine: {
    fontSize: 5,
    color: '#000000',
    fontWeight: 'bold',
  },
});

interface BarcodeLabelPDFProps {
  items: Array<{ order: PurchaseOrder; inventoryItem: InventoryItem | null; quantity: number }>;
}

export default function BarcodeLabelPDF({ items }: BarcodeLabelPDFProps) {
  // Create one page per label (40mm x 20mm)
  // Expand items based on quantity
  const expandedItems: Array<{ order: PurchaseOrder; inventoryItem: InventoryItem | null }> = [];
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
        const name = order.description || inventoryItem.name || '';
        // Truncate name if too long
        const truncatedName = name.length > 30 ? name.substring(0, 27) + '...' : name;

        return (
          <Page key={`${order.id}-${index}`} size={[PAGE_WIDTH, PAGE_HEIGHT]} style={styles.page}>
            <View style={styles.label}>
              {/* Barcode */}
              <View style={styles.barcodeContainer}>
                <Image
                  src={inventoryItem.barcode}
                  style={styles.barcode}
                  cache={false}
                />
              </View>

              {/* Name Section - middle */}
              <View style={styles.nameContainer}>
                <Text style={styles.name}>{truncatedName}</Text>
              </View>

              {/* Bottom Row: SKU on left, Category/Line on right */}
              <View style={styles.bottomRow}>
                <Text style={styles.sku}>{order.sku}</Text>
                <View style={styles.categoryLineContainer}>
                  <Text style={styles.categoryLine}>{order.category || inventoryItem.category}</Text>
                  <Text style={[styles.categoryLine, { marginLeft: 1, marginRight: 1 }]}>•</Text>
                  <Text style={styles.categoryLine}>{order.line || inventoryItem.line}</Text>
                </View>
              </View>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}

