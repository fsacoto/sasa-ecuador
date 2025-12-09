'use client';

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { PurchaseOrder, InventoryItem } from '../types';

// 40mm x 20mm thermal label
// At 72 DPI: 40mm = 113.39pt, 20mm = 56.69pt
// Using slightly smaller to account for margins
const LABEL_WIDTH = 113; // pt
const LABEL_HEIGHT = 57; // pt

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    padding: 0,
    fontFamily: 'Helvetica',
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
    height: 36,
    marginBottom: 1,
  },
  barcode: {
    width: 109,
    height: 34,
    objectFit: 'contain',
  },
  nameContainer: {
    paddingHorizontal: 2,
    marginBottom: 1,
    minHeight: 8,
    maxHeight: 10,
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
  // Calculate how many labels per page (A4: 595pt x 842pt)
  // We'll arrange them in a grid
  const labelsPerRow = Math.floor(595 / LABEL_WIDTH);
  const labelsPerColumn = Math.floor(842 / LABEL_HEIGHT);
  const labelsPerPage = labelsPerRow * labelsPerColumn;

  // Group items into pages
  const pages: Array<Array<{ order: PurchaseOrder; inventoryItem: InventoryItem | null; quantity: number }>> = [];
  for (let i = 0; i < items.length; i += labelsPerPage) {
    pages.push(items.slice(i, i + labelsPerPage));
  }

  return (
    <Document>
      {pages.map((pageItems, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 5 }}>
            {pageItems.map((item, index) => {
              if (!item.inventoryItem || !item.inventoryItem.barcode) {
                return null;
              }

              const { order, inventoryItem } = item;
              const name = order.description || inventoryItem.name || '';
              // Truncate name if too long
              const truncatedName = name.length > 30 ? name.substring(0, 27) + '...' : name;

              return (
                <View key={`${order.id}-${index}`} style={styles.label}>
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
              );
            })}
          </View>
        </Page>
      ))}
    </Document>
  );
}

