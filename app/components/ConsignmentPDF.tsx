'use client';

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { Consignment } from '../types';

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
  consignmentInfoSection: {
    flex: 1,
    alignItems: 'flex-end',
  },
  consignmentTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  consignmentNumber: {
    fontSize: 12,
    color: '#333333',
    marginBottom: 4,
    fontWeight: 'bold',
  },
  consignmentDate: {
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
    width: '8%',
    textAlign: 'left',
    fontSize: 10,
    color: '#333333',
  },
  colSku: {
    width: '20%',
    textAlign: 'left',
    fontSize: 10,
    color: '#333333',
  },
  colDescription: {
    width: '52%',
    textAlign: 'left',
    fontSize: 10,
    color: '#333333',
    paddingLeft: 5,
  },
  colQty: {
    width: '20%',
    textAlign: 'right',
    fontSize: 10,
    color: '#333333',
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
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: '#000000',
    paddingHorizontal: 5,
  },
  statusLabel: {
    fontSize: 12,
    color: '#000000',
    fontWeight: 'bold',
    textAlign: 'left',
  },
  statusValue: {
    fontSize: 12,
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
  signatureLabel: {
    fontSize: 10,
    color: '#333333',
    textAlign: 'center',
    marginTop: 5,
  },
  pageNumber: {
    fontSize: 9,
    color: '#999999',
    textAlign: 'center',
    marginTop: 10,
  },
});

interface ConsignmentPDFProps {
  consignment: Consignment;
  logoSrc?: string;
}

export default function ConsignmentPDF({ consignment, logoSrc = '/sasa.png' }: ConsignmentPDFProps) {
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

  const addressParts = parseAddress(consignment.clientAddress || '');
  const streetAddress = addressParts.length > 2 ? addressParts.slice(0, -2).join(', ') : (consignment.clientAddress || '');
  const city = addressParts.length > 1 ? addressParts[addressParts.length - 2] : '';
  const country = addressParts.length > 0 ? addressParts[addressParts.length - 1] : '';

  // Calculate totals
  const totalItemsDelivered = consignment.items.reduce((sum, item) => sum + item.quantityDelivered, 0);

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

          {/* Right: Consignment Info */}
          <View style={styles.consignmentInfoSection}>
            <Text style={styles.consignmentTitle}>CONSIGNMENT NOTE</Text>
            <Text style={styles.consignmentNumber}>{consignment.consignmentId}</Text>
            <Text style={styles.consignmentDate}>Date Issued: {formatDate(consignment.dateCreated)}</Text>
            
            <View style={styles.customerSection}>
              <Text style={styles.customerLabel}>Client:</Text>
              <Text style={styles.customerName}>{consignment.clientName}</Text>
              {consignment.clientAddress && (
                <Text style={styles.customerAddress}>
                  {streetAddress}
                  {city && `\n${city}`}
                  {country && `, ${country}`}
                </Text>
              )}
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
            <Text style={[styles.colQty, styles.headerText]}>QTY DELIVERED</Text>
          </View>

          {/* Table Rows */}
          {consignment.items.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colNo}>{index + 1}</Text>
              <Text style={styles.colSku}>{item.sku}</Text>
              <Text style={styles.colDescription}>{item.description}</Text>
              <Text style={styles.colQty}>{item.quantityDelivered}</Text>
            </View>
          ))}
        </View>

        {/* Summary Section */}
        <View style={styles.summarySection}>
          <View style={styles.summaryTable}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Items Delivered</Text>
              <Text style={styles.summaryValue}>{totalItemsDelivered}</Text>
            </View>
            
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Status</Text>
              <Text style={styles.statusValue}>{consignment.status}</Text>
            </View>
          </View>
        </View>

        {/* Footer Section */}
        <View style={styles.footer}>
          <Text style={styles.footerNote}>
            This is a consignment delivery note. Items remain property of SASA until sold.
          </Text>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>Client Signature ______________________</Text>
          <Text style={styles.pageNumber}>1 / 1</Text>
        </View>
      </Page>
    </Document>
  );
}

