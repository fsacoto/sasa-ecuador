'use client';

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { SalesInvoice } from '../types';
import esMessages from '../locales/es.json';
import { pdfMoney, toPdfDate } from '../utils/pdfRenderHelpers';
import { formatDateLong } from '../utils/formatDate';

const translate = (key: string): string => {
  const keys = key.split('.');
  let value: unknown = esMessages;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return key;
    }
  }

  return typeof value === 'string' ? value : key;
};

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
  const t = (key: string) => translate(key);
  const formatDate = (date: unknown) => formatDateLong(toPdfDate(date));

  // Parse client address
  const parseAddress = (address: string): string[] => {
    if (!address) return [];
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
            {logoSrc ? (
              <Image src={logoSrc} style={styles.logo} cache={false} />
            ) : (
              <View style={[styles.logo, { backgroundColor: '#f0f0f0' }]} />
            )}
          </View>

          {/* Right: Invoice Info */}
          <View style={styles.invoiceInfoSection}>
            <Text style={styles.invoiceTitle} wrap={false}>
              {t('pdf.invoice.title')}
            </Text>
            <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
            <Text style={styles.invoiceDate}>{t('pdf.invoice.dateIssued')}: {formatDate(invoice.date)}</Text>
            
            <View style={styles.customerSection}>
              <Text style={styles.customerLabel}>{t('pdf.invoice.issuedTo')}:</Text>
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
            <Text style={[styles.colNo, styles.headerText]}>{t('pdf.invoice.no')}</Text>
            <Text style={[styles.colSku, styles.headerText]}>{t('pdf.invoice.sku')}</Text>
            <Text style={[styles.colDescription, styles.headerText]}>{t('pdf.invoice.description')}</Text>
            <Text style={[styles.colQty, styles.headerText]}>{t('pdf.invoice.qty')}</Text>
            <Text style={[styles.colPrice, styles.headerText]}>{t('pdf.invoice.price')}</Text>
            <Text style={[styles.colSubtotal, styles.headerText]}>{t('pdf.invoice.subtotal')}</Text>
          </View>

          {/* Table Rows */}
          {invoice.items.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colNo}>{index + 1}</Text>
              <Text style={styles.colSku}>{item.sku || '-'}</Text>
              <Text style={styles.colDescription}>{item.description || '-'}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colPrice}>${pdfMoney(item.unitPrice)}</Text>
              <Text style={styles.colSubtotal}>${pdfMoney(item.totalPrice)}</Text>
            </View>
          ))}
        </View>

        {/* Summary Section */}
        <View style={styles.summarySection}>
          <View style={styles.summaryTable}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('pdf.invoice.subtotalLabel')}</Text>
              <Text style={styles.summaryValue}>${pdfMoney(invoice.subtotal)}</Text>
            </View>
            
            {invoice.discountTotal > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {t('pdf.invoice.discount')} {invoice.discountType === 'percentage' ? `(${invoice.discountValue}%)` : ''}
                </Text>
                <Text style={styles.summaryValue}>-${pdfMoney(invoice.discountTotal)}</Text>
              </View>
            )}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('pdf.invoice.total')}</Text>
              <Text style={styles.totalValue}>${pdfMoney(invoice.grandTotal)}</Text>
            </View>
          </View>
        </View>

        {/* Footer Section */}
        <View style={styles.footer}>
          <Text style={styles.footerNote}>{t('pdf.invoice.thankYou')}</Text>
          <View style={styles.signatureLine} />
          <Text style={styles.pageNumber}>1 / 1</Text>
        </View>
      </Page>
    </Document>
  );
}

