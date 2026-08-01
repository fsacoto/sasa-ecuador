'use client';

import { Document, Page, Text, View, Image, StyleSheet, Svg, Path, Line } from '@react-pdf/renderer';
import { Consignment, ConsignmentStatus } from '../types';
import esMessages from '../locales/es.json';
import { toPdfDate } from '../utils/pdfRenderHelpers';
import { formatDateLong } from '../utils/formatDate';
import { formatSalePriceDisplay, normalizeSalePrice } from '../utils/salePrice';

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
  consignmentInfoSection: {
    flex: 1,
    alignItems: 'flex-end',
  },
  consignmentTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
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
    paddingVertical: 6,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    minHeight: 66,
    alignItems: 'center',
  },
  colNo: {
    width: '6%',
    textAlign: 'left',
    fontSize: 10,
    color: '#333333',
  },
  colPhotoHeader: {
    width: '16%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colPhotoCell: {
    width: '16%',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  photoBox: {
    width: 48,
    height: 48,
    borderWidth: 1,
    borderColor: '#D7D7D7',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#F7F7F7',
    flexShrink: 0,
  },
  /** Fixed px — % width/height lets react-pdf use intrinsic image size and break the row. */
  photoImage: {
    width: 46,
    height: 46,
    objectFit: 'contain',
  },
  photoPlaceholderIcon: {
    width: 22,
    height: 22,
  },
  photoPlaceholderLabel: {
    marginTop: 2,
    fontSize: 5.5,
    color: '#A3A3A3',
    textAlign: 'center',
  },
  colSku: {
    width: '14%',
    textAlign: 'left',
    fontSize: 10,
    color: '#333333',
  },
  colDescription: {
    width: '30%',
    textAlign: 'left',
    fontSize: 10,
    color: '#333333',
    paddingLeft: 5,
  },
  colQty: {
    width: '16%',
    textAlign: 'right',
    fontSize: 10,
    color: '#333333',
  },
  colPrice: {
    width: '18%',
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
  /** Single consignment (legacy). */
  consignment?: Consignment;
  /** One or more consignments — each starts on a new page. */
  consignments?: Consignment[];
  logoSrc?: string;
  productImagesBySku?: Record<string, string>;
}

function PhotoPlaceholder() {
  return (
    <View>
      <Svg viewBox="0 0 24 24" style={styles.photoPlaceholderIcon}>
        <Path
          d="M4.5 6.5h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16V8A1.5 1.5 0 0 1 4.5 6.5z"
          stroke="#B8B8B8"
          strokeWidth={1.2}
          fill="none"
        />
        <Path
          d="M6.5 15l3.2-3.1 2.2 2.1 2.3-2.2 3.3 3.2"
          stroke="#B8B8B8"
          strokeWidth={1.2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path d="M9 10a1.2 1.2 0 1 1 0-.01" fill="#B8B8B8" />
        <Line x1="6" y1="18" x2="18" y2="6" stroke="#C6C6C6" strokeWidth={1.1} />
      </Svg>
      <Text style={styles.photoPlaceholderLabel}>SIN FOTO</Text>
    </View>
  );
}

function statusLabelEs(status: ConsignmentStatus, tr: (k: string) => string): string {
  switch (status) {
    case 'Open':
      return tr('pdf.consignment.statusOpen');
    case 'Partially Closed':
      return tr('pdf.consignment.statusPartiallyClosed');
    case 'Closed':
      return tr('pdf.consignment.statusClosed');
    default:
      return status;
  }
}

function ConsignmentNotePages({
  consignment,
  logoSrc,
  productImagesBySku,
  t,
}: {
  consignment: Consignment;
  logoSrc: string;
  productImagesBySku: Record<string, string>;
  t: (key: string) => string;
}) {
  const formatDate = (date: unknown) => formatDateLong(toPdfDate(date));

  const parseAddress = (address: string): string[] => {
    if (!address) return [];
    return address.split(', ');
  };

  const addressParts = parseAddress(consignment.clientAddress || '');
  const streetAddress =
    addressParts.length > 2
      ? addressParts.slice(0, -2).join(', ')
      : consignment.clientAddress || '';
  const city = addressParts.length > 1 ? addressParts[addressParts.length - 2] : '';
  const country = addressParts.length > 0 ? addressParts[addressParts.length - 1] : '';
  const totalItemsDelivered = consignment.items.reduce(
    (sum, item) => sum + item.quantityDelivered,
    0
  );

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View style={styles.logoSection}>
          {logoSrc ? (
            <Image src={logoSrc} style={styles.logo} cache={false} />
          ) : (
            <View style={[styles.logo, { backgroundColor: '#f0f0f0' }]} />
          )}
        </View>

        <View style={styles.consignmentInfoSection}>
          <Text style={styles.consignmentTitle} wrap={false}>
            {t('pdf.consignment.title')}
          </Text>
          <Text style={styles.consignmentNumber}>{consignment.consignmentId}</Text>
          <Text style={styles.consignmentDate}>
            {t('pdf.consignment.dateIssued')}: {formatDate(consignment.dateCreated)}
          </Text>

          <View style={styles.customerSection}>
            <Text style={styles.customerLabel}>{t('pdf.consignment.client')}:</Text>
            <Text style={styles.customerName}>{consignment.clientName}</Text>
            {consignment.clientAddress ? (
              <Text style={styles.customerAddress}>
                {streetAddress}
                {city && `\n${city}`}
                {country && `, ${country}`}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.colNo, styles.headerText]}>{t('pdf.consignment.no')}</Text>
          <View style={styles.colPhotoHeader}>
            <Text style={styles.headerText}>{t('pdf.consignment.photo')}</Text>
          </View>
          <Text style={[styles.colSku, styles.headerText]}>{t('pdf.consignment.sku')}</Text>
          <Text style={[styles.colDescription, styles.headerText]}>
            {t('pdf.consignment.description')}
          </Text>
          <Text style={[styles.colQty, styles.headerText]}>
            {t('pdf.consignment.qtyDelivered')}
          </Text>
          <Text style={[styles.colPrice, styles.headerText]}>{t('pdf.consignment.price')}</Text>
        </View>

        {consignment.items.map((item, index) => (
          <View key={index} style={styles.tableRow} wrap={false}>
            <Text style={styles.colNo}>{index + 1}</Text>
            <View style={styles.colPhotoCell}>
              <View style={styles.photoBox}>
                {productImagesBySku[item.sku] ? (
                  <Image
                    src={productImagesBySku[item.sku]}
                    style={styles.photoImage}
                    cache={false}
                  />
                ) : (
                  <PhotoPlaceholder />
                )}
              </View>
            </View>
            <Text style={styles.colSku}>{item.sku}</Text>
            <Text style={styles.colDescription}>{item.description}</Text>
            <Text style={styles.colQty}>{item.quantityDelivered}</Text>
            <Text style={styles.colPrice}>
              {formatSalePriceDisplay(normalizeSalePrice(item.unitPrice))}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.summarySection}>
        <View style={styles.summaryTable}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('pdf.consignment.totalItemsDelivered')}</Text>
            <Text style={styles.summaryValue}>{totalItemsDelivered}</Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>{t('pdf.consignment.status')}</Text>
            <Text style={styles.statusValue}>{statusLabelEs(consignment.status, t)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerNote}>{t('pdf.consignment.footerNote')}</Text>
        <View style={styles.signatureLine} />
        <Text style={styles.signatureLabel}>{t('pdf.consignment.clientSignature')}</Text>
      </View>
    </Page>
  );
}

export default function ConsignmentPDF({
  consignment,
  consignments,
  logoSrc = '/sasa.png',
  productImagesBySku = {},
}: ConsignmentPDFProps) {
  const t = (key: string) => translate(key);
  const list =
    consignments && consignments.length > 0
      ? consignments
      : consignment
        ? [consignment]
        : [];

  const title =
    list.length === 1
      ? `Consignación ${list[0].consignmentId}`
      : `Consignaciones (${list.length})`;

  return (
    <Document title={title} author="SASA" subject="Notas de consignación">
      {list.map((c) => (
        <ConsignmentNotePages
          key={c.id || c.consignmentId}
          consignment={c}
          logoSrc={logoSrc}
          productImagesBySku={productImagesBySku}
          t={t}
        />
      ))}
    </Document>
  );
}

