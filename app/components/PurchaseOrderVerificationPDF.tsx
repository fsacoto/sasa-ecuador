'use client';

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { PurchaseOrder, Supplier } from '../types';
import { formatDateLong } from '../utils/formatDate';

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    padding: 30,
    fontFamily: 'Helvetica',
    fontSize: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  logoSection: {
    flex: 1,
  },
  logo: {
    width: 100,
    height: 33,
    objectFit: 'contain',
  },
  infoSection: {
    flex: 1,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  infoRow: {
    fontSize: 10,
    color: '#333333',
    marginBottom: 4,
    textAlign: 'right',
  },
  infoLabel: {
    fontWeight: 'bold',
    marginBottom: 2,
  },
  infoValue: {
    fontWeight: 'normal',
  },
  table: {
    marginTop: 20,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    paddingVertical: 8,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    minHeight: 30,
  },
  colNo: {
    width: '4%',
    textAlign: 'left',
    fontSize: 10,
    color: '#333333',
  },
  colSupplierSku: {
    width: '9%',
    textAlign: 'center',
    fontSize: 7,
    color: '#333333',
    paddingHorizontal: 2,
  },
  colInternalSku: {
    width: '9%',
    textAlign: 'center',
    fontSize: 7,
    color: '#333333',
    paddingHorizontal: 2,
  },
  skuHeaderCell: {
    width: '9%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skuHeaderLine: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#000000',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  colDescription: {
    width: '18%',
    textAlign: 'left',
    fontSize: 10,
    color: '#333333',
    paddingLeft: 5,
  },
  colCategory: {
    width: '10%',
    textAlign: 'left',
    fontSize: 10,
    color: '#333333',
    paddingLeft: 5,
  },
  colLine: {
    width: '10%',
    textAlign: 'left',
    fontSize: 10,
    color: '#333333',
    paddingLeft: 5,
  },
  colQtyOrdered: {
    width: '8%',
    textAlign: 'center',
    fontSize: 10,
    color: '#333333',
  },
  colQtyReceived: {
    width: '8%',
    textAlign: 'center',
    fontSize: 10,
    color: '#999999',
  },
  colCheckbox: {
    width: '6%',
    textAlign: 'center',
    fontSize: 10,
    color: '#333333',
  },
  colNotes: {
    width: '18%',
    textAlign: 'left',
    fontSize: 10,
    color: '#999999',
    paddingLeft: 5,
  },
  checkboxBox: {
    width: 12,
    height: 12,
    borderWidth: 1,
    borderColor: '#000000',
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  headerText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000000',
    textTransform: 'uppercase',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 15,
  },
  verificationSection: {
    marginTop: 20,
  },
  verificationRow: {
    flexDirection: 'row',
    marginBottom: 15,
    alignItems: 'flex-end',
  },
  verificationLabel: {
    fontSize: 10,
    color: '#333333',
    fontWeight: 'bold',
    marginRight: 10,
    minWidth: 100,
  },
  verificationLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    marginRight: 20,
    height: 20,
  },
  pageNumber: {
    fontSize: 9,
    color: '#999999',
    textAlign: 'center',
    marginTop: 10,
  },
});

interface PurchaseOrderVerificationPDFProps {
  orders: PurchaseOrder[];
  supplier: Supplier | null;
  logoSrc?: string;
}

// Format PO number from invoice
const formatPONumber = (invoice: string): string => {
  if (invoice && invoice.startsWith('PO-')) {
    return invoice;
  }
  const numbers = invoice.match(/\d+/);
  if (numbers) {
    return `PO-${String(numbers[0]).padStart(5, '0')}`;
  }
  return invoice || 'PO-00000';
};

export default function PurchaseOrderVerificationPDF({ 
  orders, 
  supplier, 
  logoSrc = '/sasa.png' 
}: PurchaseOrderVerificationPDFProps) {
  const formatDate = (date: Date | string) => formatDateLong(typeof date === 'string' ? new Date(date) : date);

  if (!orders || orders.length === 0) {
    return (
      <Document>
        <Page size="A4" style={styles.page}>
          <Text>No orders found</Text>
        </Page>
      </Document>
    );
  }

  const invoiceNumber = orders[0].invoice;
  const poNumber = formatPONumber(invoiceNumber);
  const today = formatDate(new Date());
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header Section */}
        <View style={styles.header}>
          {/* Left: SASA Logo */}
          <View style={styles.logoSection}>
            <Image 
              src={logoSrc} 
              style={styles.logo}
              cache={false}
            />
          </View>

          {/* Right: PO Info */}
          <View style={styles.infoSection}>
            <Text style={styles.title}>PURCHASE ORDER VERIFICATION</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Purchase Order Number:</Text>
              <Text style={styles.infoValue}>{poNumber}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supplier Invoice Number:</Text>
              <Text style={styles.infoValue}>{invoiceNumber || '-'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supplier Name:</Text>
              <Text style={styles.infoValue}>{supplier?.name || '-'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Date:</Text>
              <Text style={styles.infoValue}>{today}</Text>
            </View>
          </View>
        </View>

        {/* Table Section */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.colNo, styles.headerText]}>NO</Text>
            <View style={styles.skuHeaderCell}>
              <Text style={styles.skuHeaderLine}>SKU</Text>
              <Text style={styles.skuHeaderLine}>SUPPLIER</Text>
            </View>
            <View style={styles.skuHeaderCell}>
              <Text style={styles.skuHeaderLine}>SKU</Text>
              <Text style={styles.skuHeaderLine}>INTERNAL</Text>
            </View>
            <Text style={[styles.colDescription, styles.headerText]}>DESCRIPTION</Text>
            <Text style={[styles.colCategory, styles.headerText]}>CATEGORY</Text>
            <Text style={[styles.colLine, styles.headerText]}>LINE</Text>
            <Text style={[styles.colQtyOrdered, styles.headerText]}>QTY ORDERED</Text>
            <Text style={[styles.colQtyReceived, styles.headerText]}>QTY RECEIVED</Text>
            <Text style={[styles.colCheckbox, styles.headerText]}>✓</Text>
            <Text style={[styles.colNotes, styles.headerText]}>NOTES</Text>
          </View>

          {/* Table Rows - All items in invoice */}
          {orders.map((order, index) => (
            <View key={order.id} style={styles.tableRow}>
              <Text style={styles.colNo}>{index + 1}</Text>
              <Text style={styles.colSupplierSku} wrap={false}>{order.supplierSKU || '-'}</Text>
              <Text style={styles.colInternalSku} wrap={false}>{order.sku || '-'}</Text>
              <Text style={styles.colDescription}>{order.description || '-'}</Text>
              <Text style={styles.colCategory}>{order.category || '-'}</Text>
              <Text style={styles.colLine}>{order.line || '-'}</Text>
              <Text style={styles.colQtyOrdered}>{order.quantity}</Text>
              <Text style={styles.colQtyReceived}></Text>
              <View style={styles.colCheckbox}>
                <View style={styles.checkboxBox} />
              </View>
              <Text style={styles.colNotes}></Text>
            </View>
          ))}
        </View>

        {/* Footer Section */}
        <View style={styles.footer}>
          <View style={styles.verificationSection}>
            <View style={styles.verificationRow}>
              <Text style={styles.verificationLabel}>Verified By:</Text>
              <View style={styles.verificationLine} />
            </View>
            <View style={styles.verificationRow}>
              <Text style={styles.verificationLabel}>Date:</Text>
              <View style={styles.verificationLine} />
            </View>
            <View style={styles.verificationRow}>
              <Text style={styles.verificationLabel}>Signature:</Text>
              <View style={styles.verificationLine} />
            </View>
          </View>
          <Text style={styles.pageNumber}>1 / 1</Text>
        </View>
      </Page>
    </Document>
  );
}
