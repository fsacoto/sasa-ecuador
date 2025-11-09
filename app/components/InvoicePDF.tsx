'use client';

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { SalesInvoice } from '../types';

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
  invoiceInfoSection: {
    flex: 1,
    alignItems: 'flex-end',
  },
  invoiceTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  invoiceNumber: {
    fontSize: 12,
    color: '#333333',
    marginBottom: 4,
    fontWeight: 'bold',
  },
  invoiceDate: {
    fontSize: 10,
    color: '#666666',
    marginBottom: 15,
  },
  customerSection: {
    marginTop: 10,
    alignItems: 'flex-end',
  },
  customerLabel: {
    fontSize: 10,
    color: '#666666',
    marginBottom: 4,
    fontWeight: 'bold',
  },
  customerName: {
    fontSize: 11,
    color: '#000000',
    marginBottom: 2,
    fontWeight: 'medium',
  },
  customerAddress: {
    fontSize: 10,
    color: '#666666',
    lineHeight: 1.4,
    textAlign: 'right',
    maxWidth: 200,
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
  },
  colNo: {
    width: '6%',
    textAlign: 'left',
    fontSize: 10,
    color: '#333333',
  },
  colSku: {
    width: '15%',
    textAlign: 'left',
    fontSize: 10,
    color: '#333333',
    paddingLeft: 5,
  },
  colDescription: {
    width: '33%',
    textAlign: 'left',
    fontSize: 10,
    color: '#333333',
    paddingLeft: 5,
  },
  colQty: {
    width: '10%',
    textAlign: 'left',
    fontSize: 10,
    color: '#333333',
  },
  colPrice: {
    width: '18%',
    textAlign: 'right',
    fontSize: 10,
    color: '#333333',
  },
  colSubtotal: {
    width: '18%',
    textAlign: 'right',
    fontSize: 10,
    color: '#333333',
    fontWeight: 'medium',
  },
  headerText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000000',
    textTransform: 'uppercase',
  },
  summarySection: {
    marginTop: 20,
    alignItems: 'flex-end',
    width: '100%',
  },
  summaryTable: {
    width: 250,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 5,
  },
  summaryLabel: {
    fontSize: 10,
    color: '#666666',
    textAlign: 'left',
  },
  summaryValue: {
    fontSize: 10,
    color: '#333333',
    textAlign: 'right',
    fontWeight: 'normal',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: '#000000',
    paddingHorizontal: 5,
  },
  totalLabel: {
    fontSize: 12,
    color: '#000000',
    fontWeight: 'bold',
    textAlign: 'left',
  },
  totalValue: {
    fontSize: 14,
    color: '#000000',
    fontWeight: 'bold',
    textAlign: 'right',
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
  footerNote: {
    fontSize: 10,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 10,
    fontStyle: 'italic',
  },
  signatureLine: {
    marginTop: 40,
    marginBottom: 10,
    borderTopWidth: 1,
    borderTopColor: '#000000',
    width: 200,
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  pageNumber: {
    fontSize: 9,
    color: '#999999',
    textAlign: 'center',
    marginTop: 10,
  },
});

interface InvoicePDFProps {
  invoice: SalesInvoice;
  logoSrc?: string;
}

export default function InvoicePDF({ invoice, logoSrc = '/sasa.png' }: InvoicePDFProps) {
  // Format date
  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Parse client address
  const parseAddress = (address: string) => {
    if (!address) return '';
    const parts = address.split(', ');
    return parts;
  };

  const addressParts = parseAddress(invoice.clientAddress);
  const streetAddress = addressParts.length > 2 ? addressParts.slice(0, -2).join(', ') : invoice.clientAddress;
  const city = addressParts.length > 1 ? addressParts[addressParts.length - 2] : '';
  const country = addressParts.length > 0 ? addressParts[addressParts.length - 1] : '';

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

          {/* Right: Invoice Info */}
          <View style={styles.invoiceInfoSection}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
            <Text style={styles.invoiceDate}>Date Issued: {formatDate(invoice.date)}</Text>
            
            <View style={styles.customerSection}>
              <Text style={styles.customerLabel}>Issued to:</Text>
              <Text style={styles.customerName}>{invoice.clientName}</Text>
              <Text style={styles.customerAddress}>
                {streetAddress}
                {city && `\n${city}`}
                {country && `, ${country}`}
              </Text>
            </View>
          </View>
        </View>

        {/* Product Table Section */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.colNo, styles.headerText]}>NO</Text>
            <Text style={[styles.colSku, styles.headerText]}>SKU</Text>
            <Text style={[styles.colDescription, styles.headerText]}>DESCRIPTION</Text>
            <Text style={[styles.colQty, styles.headerText]}>QTY</Text>
            <Text style={[styles.colPrice, styles.headerText]}>PRICE</Text>
            <Text style={[styles.colSubtotal, styles.headerText]}>SUBTOTAL</Text>
          </View>

          {/* Table Rows */}
          {invoice.items.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colNo}>{index + 1}</Text>
              <Text style={styles.colSku}>{item.sku || '-'}</Text>
              <Text style={styles.colDescription}>{item.description || '-'}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colPrice}>${item.unitPrice.toFixed(2)}</Text>
              <Text style={styles.colSubtotal}>${item.totalPrice.toFixed(2)}</Text>
            </View>
          ))}
        </View>

        {/* Summary Section */}
        <View style={styles.summarySection}>
          <View style={styles.summaryTable}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>${invoice.subtotal.toFixed(2)}</Text>
            </View>
            
            {invoice.discountTotal > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  Discount {invoice.discountType === 'percentage' ? `(${invoice.discountValue}%)` : ''}
                </Text>
                <Text style={styles.summaryValue}>-${invoice.discountTotal.toFixed(2)}</Text>
              </View>
            )}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalValue}>${invoice.grandTotal.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Footer Section */}
        <View style={styles.footer}>
          <Text style={styles.footerNote}>Thank you for your purchase.</Text>
          <View style={styles.signatureLine} />
          <Text style={styles.pageNumber}>1 / 1</Text>
        </View>
      </Page>
    </Document>
  );
}

