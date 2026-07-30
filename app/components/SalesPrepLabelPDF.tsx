'use client';

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import type { SalesInvoice } from '../types';
import type { PrepLabelData } from '../utils/salesPrepLabelPdf';
import { formatDateDMY } from '../utils/formatDate';
import { toPdfDate } from '../utils/pdfRenderHelpers';

/**
 * Physical thermal prep label: 40mm × 20mm.
 * Used for notas de pedido and consignaciones.
 * Line 1: document title (e.g. Nota de pedido: / Consignación:)
 * Line 2: document number
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

function prepLabelDataFromInvoice(invoice: SalesInvoice): PrepLabelData {
  return {
    documentTitle: 'Nota de pedido:',
    documentNumber: (invoice.invoiceNumber || '').trim() || '—',
    clientName: invoice.clientName || '—',
    date: invoice.date,
    itemsCount: totalItemCount(invoice),
  };
}

interface SalesPrepLabelPDFProps {
  /** Preferred: generic prep label data. */
  data?: PrepLabelData;
  /** Legacy: sales invoice — mapped to PrepLabelData. */
  invoice?: SalesInvoice;
  logoSrc?: string;
}

export default function SalesPrepLabelPDF({
  data,
  invoice,
  logoSrc = '',
}: SalesPrepLabelPDFProps) {
  const label = data ?? (invoice ? prepLabelDataFromInvoice(invoice) : null);
  const documentNumber = (label?.documentNumber || '').trim() || '—';
  const documentTitle = (label?.documentTitle || 'Nota de pedido:').trim() || 'Nota de pedido:';
  const clientName = truncate(label?.clientName || '—', 22);
  const dateLabel = formatDateDMY(toPdfDate(label?.date));
  const itemsCount = label?.itemsCount ?? 0;

  return (
    <Document
      title={`Etiqueta preparación ${documentNumber}`}
      author="SASA"
      subject="Etiqueta de preparación 40x20mm"
    >
      <Page size={[LABEL_W, LABEL_H]} style={styles.page}>
        <View style={styles.label}>
          {logoSrc ? <Image src={logoSrc} style={styles.logo} cache={false} /> : null}
          <View style={styles.body}>
            <Text style={styles.title}>{documentTitle}</Text>
            <Text style={styles.invoiceNumber}>{documentNumber}</Text>
            <Text style={styles.line}>{`Cliente: ${clientName}`}</Text>
            <Text style={styles.line}>{`Fecha: ${dateLabel}`}</Text>
            <Text style={styles.lineStrong}>{`N° de ítems: ${itemsCount}`}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
