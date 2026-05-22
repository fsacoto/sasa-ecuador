import jsPDF from 'jspdf';
import { PurchaseOrder, Supplier } from '../types';
import { formatDateLong } from './formatDate';

interface GeneratePOVerificationPDFParams {
  orders: PurchaseOrder[];
  supplier: Supplier | null;
  invoiceNumber: string;
}

// Load logo as base64 (we'll need to handle this)
async function loadLogoAsBase64(): Promise<string> {
  // Try to load the logo from public folder
  try {
    const response = await fetch('/sasa.png');
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error loading logo:', error);
    return '';
  }
}

// Format PO number
function formatPONumber(invoice: string): string {
  if (invoice && invoice.startsWith('PO-')) {
    return invoice;
  }
  const numbers = invoice.match(/\d+/);
  if (numbers) {
    return `PO-${String(numbers[0]).padStart(5, '0')}`;
  }
  return invoice || 'PO-00000';
}

export async function generatePOVerificationPDF({
  orders,
  supplier,
  invoiceNumber,
}: GeneratePOVerificationPDFParams): Promise<void> {
  const doc = new jsPDF({ 
    orientation: 'landscape', 
    unit: 'pt', 
    format: 'A4' 
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40; // Horizontal and vertical margins for balanced layout
  const usableWidth = pageWidth - (margin * 2);
  const usableHeight = pageHeight - (margin * 2);

  const t = {
    title: 'VERIFICACIÓN DE ORDEN DE COMPRA',
    purchaseOrder: 'Orden de Compra:',
    supplierInvoice: 'Factura del Proveedor:',
    invoiceDate: 'Fecha de Factura:',
    destinationCountry: 'País de Destino:',
    currentDate: 'Fecha Actual:',
    no: 'NO',
    supplierSkuLine1: 'SKU',
    supplierSkuLine2: 'PROVEEDOR',
    internalSkuLine1: 'SKU',
    internalSkuLine2: 'INTERNO',
    description: 'DESCRIPCIÓN',
    category: 'CATEGORÍA',
    line: 'LÍNEA',
    qtyOrdered: 'CANT. PEDIDA',
    qtyReceived: 'CANT. RECIBIDA',
    notes: 'NOTAS',
    check: 'CHECK',
    verifiedBy: 'Verificado Por:',
    date: 'Fecha:',
    signature: 'Firma:',
    page: 'Página',
    of: 'de',
  };

  const poNumber = formatPONumber(invoiceNumber);
  const invoiceDate = formatDateLong(orders[0].purchaseDate);
  const currentDate = formatDateLong(new Date());
  // Load logo
  let logoData = '';
  try {
    logoData = await loadLogoAsBase64();
  } catch (error) {
    console.error('Error loading logo:', error);
  }

  let currentY = margin;
  const lineHeight = 14;
  const signatureBlockHeight = 72;
  const firstPageTableStartY = 118;
  const continuationPageTableStartY = margin;
  const cellPadding = 10;
  const paddingTop = 10;
  const paddingBottom = 10;
  const footerBottomMargin = 52;
  const footerLineGap = 12;
  const gapBetweenTableAndFooter = 40;

  const headerRowHeight = 24 + paddingTop + paddingBottom;
  const fixedRowHeight = 22;

  const footerReservedHeight = footerBottomMargin + footerLineGap;
  const signatureReservedHeight =
    signatureBlockHeight + gapBetweenTableAndFooter + footerReservedHeight;

  const maxTableBodyBottomContinuation =
    pageHeight - margin - footerReservedHeight;
  const maxTableBodyBottomLastPage =
    pageHeight - margin - signatureReservedHeight;

  const tableStartYForPage = (pageIndex: number) =>
    pageIndex === 1 ? firstPageTableStartY : continuationPageTableStartY;

  const maxTableBodyBottomForPage = (pageIndex: number, total: number) =>
    pageIndex === total ? maxTableBodyBottomLastPage : maxTableBodyBottomContinuation;

  // Column widths (sums to usableWidth) - CHECK moved to after QTY RECEIVED
  // Fixed widths for short columns, NOTES gets remaining space
  const colWidths = {
    no: usableWidth * 0.04,
    supplierSku: usableWidth * 0.10,
    internalSku: usableWidth * 0.10,
    description: usableWidth * 0.23,
    category: 68,
    line: 95,
    qtyOrdered: 60,
    qtyReceived: 60,
    check: usableWidth * 0.05,
    notes: 0
  };
  
  // Calculate NOTES width as remaining space
  const usedWidth = colWidths.no + colWidths.supplierSku + colWidths.internalSku + colWidths.description + 
                    colWidths.category + colWidths.line + colWidths.qtyOrdered + 
                    colWidths.qtyReceived + colWidths.check;
  colWidths.notes = usableWidth - usedWidth;

  let currentPage = 1;
  let totalPages = 1;
  let lastTableBottomY = firstPageTableStartY;

  const addNewPage = () => {
    doc.addPage();
    currentPage++;
    currentY = continuationPageTableStartY;
  };

  const needsNewPageForRow = (rowHeight: number, pageIndex: number, pages: number) => {
    const startY = tableStartYForPage(pageIndex);
    const maxBottom = maxTableBodyBottomForPage(pageIndex, pages);
    const headerNeeded = currentY === startY ? headerRowHeight : 0;
    return currentY + headerNeeded + rowHeight > maxBottom;
  };

  // Draw header
  const drawHeader = () => {
    currentY = margin;

    // Logo (left side)
    if (logoData) {
      try {
        doc.addImage(logoData, 'PNG', margin, currentY, 100, 33);
      } catch (error) {
        console.error('Error adding logo image:', error);
      }
    }

    // Header info (right side) - aligned with right margin
    const headerX = pageWidth - margin; // Aligned to right margin
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(t.title, headerX, currentY + 10, { align: 'right' });
    currentY += 20;

    // Add proportional vertical spacing before metadata block
    currentY += 12; // Additional spacing for visual balance

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${t.purchaseOrder} ${poNumber}`, headerX, currentY, { align: 'right' });
    currentY += lineHeight;
    doc.text(`${t.supplierInvoice} ${invoiceNumber}`, headerX, currentY, { align: 'right' });
    currentY += lineHeight;
    doc.text(`${t.invoiceDate} ${invoiceDate}`, headerX, currentY, { align: 'right' });
    currentY += lineHeight;
    doc.text(`${t.destinationCountry} Ecuador`, headerX, currentY, { align: 'right' });
    currentY += lineHeight;
    doc.text(`${t.currentDate} ${currentDate}`, headerX, currentY, { align: 'right' });
  };

  const SKU_HEADER_FONT_SIZE = 8;
  const SKU_CELL_FONT_SIZE = 7;
  const SKU_CELL_MIN_FONT_SIZE = 5.5;

  /** Two-line centered header (e.g. SKU / PROVEEDOR). */
  const drawTwoLineColumnHeader = (
    line1: string,
    line2: string,
    colX: number,
    colWidth: number,
    startY: number,
    rowHeight: number
  ) => {
    const centerX = colX + colWidth / 2;
    const baseY = startY + rowHeight / 2 - 3;
    doc.setFontSize(SKU_HEADER_FONT_SIZE);
    doc.setFont('helvetica', 'bold');
    doc.text(line1, centerX, baseY, { align: 'center' });
    doc.text(line2, centerX, baseY + 9, { align: 'center' });
  };

  /** Single-line cell; shrinks font if needed to avoid wrapping. */
  const drawSingleLineCell = (
    value: string,
    colX: number,
    colWidth: number,
    rowCenterY: number,
    baseFontSize = SKU_CELL_FONT_SIZE,
    minFontSize = SKU_CELL_MIN_FONT_SIZE
  ) => {
    const text = (value || '-').trim() || '-';
    const maxW = colWidth - cellPadding * 2;
    let fontSize = baseFontSize;
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'normal');
    let textWidth = doc.getTextWidth(text);
    while (textWidth > maxW && fontSize > minFontSize) {
      fontSize -= 0.5;
      doc.setFontSize(fontSize);
      textWidth = doc.getTextWidth(text);
    }
    doc.text(text, colX + cellPadding, rowCenterY + 3);
    doc.setFontSize(9);
  };

  const drawSingleLineSkuCell = (
    value: string,
    colX: number,
    colWidth: number,
    rowCenterY: number
  ) => drawSingleLineCell(value, colX, colWidth, rowCenterY);

  // Draw table header
  const drawTableHeader = (startY: number) => {
    // Use the headerRowHeight calculated above (includes padding)
    let x = margin;
    
    // Fondo cabecera: gris un poco más oscuro que las filas (245) para jerarquía clara
    doc.setFillColor(212, 212, 212);
    doc.rect(x, startY, usableWidth, headerRowHeight, 'F');
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);

    x = margin;
    // NO column
    doc.text(t.no, x + colWidths.no / 2, startY + headerRowHeight / 2 + 3, { align: 'center' });
    x += colWidths.no;
    // Supplier SKU column (two lines)
    drawTwoLineColumnHeader(t.supplierSkuLine1, t.supplierSkuLine2, x, colWidths.supplierSku, startY, headerRowHeight);
    x += colWidths.supplierSku;
    // Internal SKU column (two lines)
    drawTwoLineColumnHeader(t.internalSkuLine1, t.internalSkuLine2, x, colWidths.internalSku, startY, headerRowHeight);
    x += colWidths.internalSku;
    doc.setFontSize(10);
    // DESCRIPTION column
    doc.text(t.description, x + colWidths.description / 2, startY + headerRowHeight / 2 + 3, { align: 'center' });
    x += colWidths.description;
    // CATEGORY column
    doc.text(t.category, x + colWidths.category / 2, startY + headerRowHeight / 2 + 3, { align: 'center' });
    x += colWidths.category;
    // LINE column
    doc.text(t.line, x + colWidths.line / 2, startY + headerRowHeight / 2 + 3, { align: 'center' });
    x += colWidths.line;
    // QTY ORDERED column - wrapped to two lines
    const qtyOrderedLines = t.qtyOrdered.split(' ');
    const qtyOrderedX = x + colWidths.qtyOrdered / 2;
    const qtyOrderedY = startY + headerRowHeight / 2 - 3;
    doc.text(qtyOrderedLines[0] || 'QTY', qtyOrderedX, qtyOrderedY, { align: 'center' });
    if (qtyOrderedLines.length > 1) {
      doc.text(qtyOrderedLines[1] || 'ORDERED', qtyOrderedX, qtyOrderedY + 10, { align: 'center' });
    }
    x += colWidths.qtyOrdered;
    // QTY RECEIVED column - wrapped to two lines
    const qtyReceivedLines = t.qtyReceived.split(' ');
    const qtyReceivedX = x + colWidths.qtyReceived / 2;
    const qtyReceivedY = startY + headerRowHeight / 2 - 3;
    doc.text(qtyReceivedLines[0] || 'QTY', qtyReceivedX, qtyReceivedY, { align: 'center' });
    if (qtyReceivedLines.length > 1) {
      doc.text(qtyReceivedLines[1] || 'RECEIVED', qtyReceivedX, qtyReceivedY + 10, { align: 'center' });
    }
    x += colWidths.qtyReceived;
    // CHECK column
    doc.text(t.check, x + colWidths.check / 2, startY + headerRowHeight / 2 + 3, { align: 'center' });
    x += colWidths.check;
    // NOTES column
    doc.text(t.notes, x + colWidths.notes / 2, startY + headerRowHeight / 2 + 3, { align: 'center' });

    // Draw thin borders around header
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    // Top border
    doc.line(margin, startY, margin + usableWidth, startY);
    // Bottom border
    doc.line(margin, startY + headerRowHeight, margin + usableWidth, startY + headerRowHeight);
    // Left border
    doc.line(margin, startY, margin, startY + headerRowHeight);
    // Right border
    doc.line(margin + usableWidth, startY, margin + usableWidth, startY + headerRowHeight);
    // Vertical lines
    x = margin;
    doc.line(x, startY, x, startY + headerRowHeight);
    x += colWidths.no;
    doc.line(x, startY, x, startY + headerRowHeight);
    x += colWidths.supplierSku;
    doc.line(x, startY, x, startY + headerRowHeight);
    x += colWidths.internalSku;
    doc.line(x, startY, x, startY + headerRowHeight);
    x += colWidths.description;
    doc.line(x, startY, x, startY + headerRowHeight);
    x += colWidths.category;
    doc.line(x, startY, x, startY + headerRowHeight);
    x += colWidths.line;
    doc.line(x, startY, x, startY + headerRowHeight);
    x += colWidths.qtyOrdered;
    doc.line(x, startY, x, startY + headerRowHeight);
    x += colWidths.qtyReceived;
    doc.line(x, startY, x, startY + headerRowHeight);
    x += colWidths.check;
    doc.line(x, startY, x, startY + headerRowHeight);
    doc.line(margin + usableWidth, startY, margin + usableWidth, startY + headerRowHeight);
  };

  // Note: We use fixed row height for all rows to ensure exactly 15 rows per page
  // Text wrapping (noWrap: false equivalent) is handled by splitTextToSize
  // Vertical alignment (valign: 'middle') is handled in drawTableRow

  // Draw table row with dynamic height
  const drawTableRow = (order: PurchaseOrder, rowY: number, globalRowIndex: number, rowHeight: number, isEven: boolean): number => {
    // Filas alternas: gris muy claro (cabecera ~212 — más oscuro)
    if (isEven) {
      doc.setFillColor(245, 245, 245);
    } else {
      doc.setFillColor(255, 255, 255); // White
    }
    doc.rect(margin, rowY, usableWidth, rowHeight, 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 51, 51);

    let x = margin;
    // Helper function to calculate vertically centered Y position for multi-line text
    // Uses lineHeight of 1.1-1.2 for proper spacing (valign: 'middle')
    const getCenteredTextY = (textLines: string[], rowCenterY: number): number => {
      if (textLines.length === 1) {
        return rowCenterY + 3; // Single line: center + small offset for baseline
      }
      // Multi-line: center the block of text with lineHeight of 1.2
      const lineHeight = 1.2;
      const lineSpacing = 10 * lineHeight; // Apply line height multiplier
      const totalTextHeight = (textLines.length - 1) * lineSpacing;
      return rowCenterY - (totalTextHeight / 2) + 3;
    };
    
    const rowCenterY = rowY + rowHeight / 2;
    
    // NO (use global row index for numbering) - vertically centered
    doc.text(String(globalRowIndex + 1), x + colWidths.no / 2, rowCenterY + 3, { align: 'center' });
    x += colWidths.no;
    
    // Supplier SKU — single line, smaller font
    drawSingleLineSkuCell(order.supplierSKU, x, colWidths.supplierSku, rowCenterY);
    x += colWidths.supplierSku;
    
    // Internal SKU — single line, smaller font
    drawSingleLineSkuCell(order.sku, x, colWidths.internalSku, rowCenterY);
    x += colWidths.internalSku;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    // DESCRIPTION - with proper wrapping (noWrap: false), vertically centered
    const descText = doc.splitTextToSize(order.description || '-', colWidths.description - (cellPadding * 2));
    const descTextY = getCenteredTextY(descText, rowCenterY);
    doc.text(descText, x + cellPadding, descTextY);
    x += colWidths.description;
    
    // CATEGORY - with proper wrapping (noWrap: false), vertically centered
    const catText = doc.splitTextToSize(order.category || '-', colWidths.category - (cellPadding * 2));
    const catTextY = getCenteredTextY(catText, rowCenterY);
    doc.text(catText, x + cellPadding, catTextY);
    x += colWidths.category;
    
    // LINE — single line, wider column; shrink font if needed
    drawSingleLineCell(order.line || '-', x, colWidths.line, rowCenterY, 9, 7);
    x += colWidths.line;
    
    // QTY ORDERED - vertically centered
    doc.text(String(order.quantity), x + colWidths.qtyOrdered / 2, rowCenterY + 3, { align: 'center' });
    x += colWidths.qtyOrdered;
    
    // QTY RECEIVED (blank)
    x += colWidths.qtyReceived;
    
    // CHECK column - empty checkbox square (moved here, after QTY RECEIVED)
    const checkboxSize = 10;
    const checkboxX = x + colWidths.check / 2 - checkboxSize / 2;
    const checkboxY = rowY + rowHeight / 2 - checkboxSize / 2;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(checkboxX, checkboxY, checkboxSize, checkboxSize);
    x += colWidths.check;
    
    // NOTES (blank)
    x += colWidths.notes;

    // Draw thin borders around all cells
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    // Top border
    doc.line(margin, rowY, margin + usableWidth, rowY);
    // Bottom border
    doc.line(margin, rowY + rowHeight, margin + usableWidth, rowY + rowHeight);
    // Vertical lines
    x = margin;
    doc.line(x, rowY, x, rowY + rowHeight); // Left border
    x += colWidths.no;
    doc.line(x, rowY, x, rowY + rowHeight);
    x += colWidths.supplierSku;
    doc.line(x, rowY, x, rowY + rowHeight);
    x += colWidths.internalSku;
    doc.line(x, rowY, x, rowY + rowHeight);
    x += colWidths.description;
    doc.line(x, rowY, x, rowY + rowHeight);
    x += colWidths.category;
    doc.line(x, rowY, x, rowY + rowHeight);
    x += colWidths.line;
    doc.line(x, rowY, x, rowY + rowHeight);
    x += colWidths.qtyOrdered;
    doc.line(x, rowY, x, rowY + rowHeight);
    x += colWidths.qtyReceived;
    doc.line(x, rowY, x, rowY + rowHeight);
    x += colWidths.check;
    doc.line(x, rowY, x, rowY + rowHeight);
    doc.line(margin + usableWidth, rowY, margin + usableWidth, rowY + rowHeight); // Right border
    
    return rowHeight;
  };

  const drawPageNumber = () => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(153, 153, 153);
    const pageText = `${t.page} ${currentPage} ${t.of} ${totalPages}`;
    const footerBaseY = pageHeight - footerBottomMargin + 10;
    doc.text(pageText, pageWidth / 2, footerBaseY, { align: 'center' });
    doc.text(poNumber, pageWidth / 2, footerBaseY + footerLineGap, { align: 'center' });
  };

  /** Firma debajo de la tabla; esquina inferior izquierda si hay espacio libre. */
  const drawSignatureBlock = (tableBottomY: number) => {
    const lineSpacing = 20;
    const signatureLineCount = 3;
    const footerX = margin;
    const labelOffset = 72;
    const lineEndX = margin + 220;
    const cornerY =
      pageHeight -
      footerBottomMargin -
      footerLineGap -
      18 -
      (signatureLineCount - 1) * lineSpacing;

    let footerCurrentY = Math.max(
      tableBottomY + gapBetweenTableAndFooter,
      cornerY
    );

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 51, 51);

    doc.setFont('helvetica', 'bold');
    doc.text(t.verifiedBy, footerX, footerCurrentY);
    doc.setFont('helvetica', 'normal');
    doc.line(footerX + labelOffset, footerCurrentY - 5, lineEndX, footerCurrentY - 5);
    footerCurrentY += lineSpacing;

    doc.setFont('helvetica', 'bold');
    doc.text(t.date, footerX, footerCurrentY);
    doc.setFont('helvetica', 'normal');
    doc.line(footerX + labelOffset, footerCurrentY - 5, lineEndX, footerCurrentY - 5);
    footerCurrentY += lineSpacing;

    doc.setFont('helvetica', 'bold');
    doc.text(t.signature, footerX, footerCurrentY);
    doc.setFont('helvetica', 'normal');
    doc.line(footerX + labelOffset, footerCurrentY - 5, lineEndX, footerCurrentY - 5);
  };

  const simulatePageCount = (assumedTotal: number | null): number => {
    let pages = 1;
    let y = firstPageTableStartY;
    for (let i = 0; i < orders.length; i++) {
      const startY = tableStartYForPage(pages);
      const isLastPage =
        assumedTotal !== null && pages >= assumedTotal;
      const maxBottom = isLastPage
        ? maxTableBodyBottomLastPage
        : maxTableBodyBottomContinuation;
      const headerNeeded = y === startY ? headerRowHeight : 0;
      if (y + headerNeeded + fixedRowHeight > maxBottom) {
        pages++;
        y = continuationPageTableStartY;
      }
      if (y === tableStartYForPage(pages)) {
        y += headerRowHeight;
      }
      y += fixedRowHeight;
    }
    return pages;
  };

  const countTotalPages = (): number => {
    let pages = simulatePageCount(null);
    const MAX_PAGE_COUNT_ITERATIONS = 50;
    for (let i = 0; i < MAX_PAGE_COUNT_ITERATIONS; i++) {
      const withLastPageReserve = simulatePageCount(pages);
      if (withLastPageReserve <= pages) {
        return pages;
      }
      pages = withLastPageReserve;
    }
    return pages;
  };

  totalPages = countTotalPages();

  drawHeader();
  currentY = firstPageTableStartY;
  currentPage = 1;

  const MAX_RENDER_PAGES = 500;
  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const rowHeight = fixedRowHeight;
    const isEven = i % 2 === 0;

    let pageBreakGuard = 0;
    while (
      needsNewPageForRow(rowHeight, currentPage, totalPages) &&
      pageBreakGuard < MAX_RENDER_PAGES
    ) {
      drawPageNumber();
      addNewPage();
      lastTableBottomY = continuationPageTableStartY;
      pageBreakGuard++;
    }

    const pageTableStartY = tableStartYForPage(currentPage);
    if (currentY === pageTableStartY) {
      drawTableHeader(currentY);
      currentY += headerRowHeight;
    }

    drawTableRow(order, currentY, i, rowHeight, isEven);
    currentY += rowHeight;
    lastTableBottomY = currentY;
  }

  drawSignatureBlock(lastTableBottomY);
  drawPageNumber();

  // Save PDF
  const fileName = `PO-Verification-${poNumber}.pdf`;
  doc.save(fileName);
}

