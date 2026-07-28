'use client';

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import type { SalesInvoice } from '../types';
import { formatDateDMY } from '../utils/formatDate';
import { toPdfDate } from '../utils/pdfRenderHelpers';

/**
 * Physical thermal prep label: 40mm × 20mm for notas de pedido.
 * Line 1: Nota de pedido:
 * Line 2: NOTAV-XXX
 * Then cliente / fecha / ítems. Logo top-right.
 */
const MM = 72 / 25.4;
const LABEL_W = 40 * MM;
const LABEL_H = 20 * MM;

const PAD_X = 1.6 * MM;
const PAD_Y = 1.1 * MM;
const CONTENT_W = LABEL_W - PAD_X * 2;
/** Logo size/placement unchanged. */
const LOGO_W = 9.5 * MM;
const LOGO_H = 3.1 * MM;
const LOGO_GAP = 0.4 * MM;
const TITLE_W = CONTENT_W - LOGO_W - LOGO_GAP;

/** Previous sizes × 1.4 */
const TITLE_SIZE = 6.6 * 1.4; // 9.24
const LINE_SIZE = 5.6 * 1.4; // 7.84

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
    paddingTop: PAD_Y,
    paddingBottom: PAD_Y,
    paddingLeft: PAD_X,
    paddingRight: PAD_X,
    position: 'relative',
  },
  logo: {
    position: 'absolute',
    top: PAD_Y,
    right: PAD_X,
    width: LOGO_W,
    height: LOGO_H,
    objectFit: 'contain',
  },
  body: {
    width: CONTENT_W,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  title: {
    width: TITLE_W,
    fontSize: TITLE_SIZE,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    color: '#000000',
    lineHeight: 1.5,
  },
  invoiceNumber: {
    width: CONTENT_W,
    fontSize: TITLE_SIZE,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    color: '#000000',
    lineHeight: 1.5,
  },
  line: {
    width: CONTENT_W,
    fontSize: LINE_SIZE,
    fontFamily: 'Helvetica',
    color: '#000000',
    lineHeight: 1.5,
  },
  lineStrong: {
    width: CONTENT_W,
    fontSize: LINE_SIZE,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    color: '#000000',
    lineHeight: 1.5,
  },
});

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.substring(0, Math.max(0, max - 1))}…`;
}

function totalItemCount(invoice: SalesInvoice): number {
  return (invoice.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
}

interface SalesPrepLabelPDFProps {
  invoice: SalesInvoice;
  logoSrc?: string;
}

export default function SalesPrepLabelPDF({ invoice, logoSrc = '' }: SalesPrepLabelPDFProps) {
  const invoiceNumber = (invoice.invoiceNumber || '').trim() || '—';
  const clientName = truncate(invoice.clientName || '—', 22);
  const dateLabel = formatDateDMY(toPdfDate(invoice.date));
  const itemsCount = totalItemCount(invoice);

  return (
    <Document
      title={`Etiqueta preparación ${invoiceNumber}`}
      author="SASA"
      subject="Etiqueta de preparación 40x20mm"
    >
      <Page size={[LABEL_W, LABEL_H]} style={styles.page}>
        <View style={styles.label}>
          {logoSrc ? <Image src={logoSrc} style={styles.logo} cache={false} /> : null}
          <View style={styles.body}>
            <Text style={styles.title}>Nota de pedido:</Text>
            <Text style={styles.invoiceNumber}>{invoiceNumber}</Text>
            <Text style={styles.line}>{`Cliente: ${clientName}`}</Text>
            <Text style={styles.line}>{`Fecha: ${dateLabel}`}</Text>
            <Text style={styles.lineStrong}>{`N° de ítems: ${itemsCount}`}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
