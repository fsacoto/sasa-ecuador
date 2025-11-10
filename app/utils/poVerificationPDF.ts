import jsPDF from 'jspdf';
import { PurchaseOrder, Supplier } from '../types';

interface GeneratePOVerificationPDFParams {
  orders: PurchaseOrder[];
  supplier: Supplier | null;
  invoiceNumber: string;
  locale: 'en' | 'es';
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

// Format date
function formatDate(date: Date | string, locale: 'en' | 'es'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (locale === 'es') {
    return d.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export async function generatePOVerificationPDF({
  orders,
  supplier,
  invoiceNumber,
  locale
}: GeneratePOVerificationPDFParams): Promise<void> {
  const doc = new jsPDF({ 
    orientation: 'landscape', 
    unit: 'pt', 
    format: 'A4' 
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20; // Reduced margin for more table width
  const usableWidth = pageWidth - (margin * 2);
  const usableHeight = pageHeight - (margin * 2);

  // Translations
  const translations = {
    en: {
      title: 'PURCHASE ORDER VERIFICATION',
      purchaseOrder: 'Purchase Order:',
      supplierInvoice: 'Supplier Invoice:',
      invoiceDate: 'Invoice Date:',
      destinationCountry: 'Destination Country:',
      currentDate: 'Current Date:',
      no: 'NO',
      sku: 'SKU',
      description: 'DESCRIPTION',
      category: 'CATEGORY',
      line: 'LINE',
      qtyOrdered: 'QTY ORDERED',
      qtyReceived: 'QTY RECEIVED',
      notes: 'NOTES',
      check: 'CHECK',
      verifiedBy: 'Verified By:',
      date: 'Date:',
      signature: 'Signature:',
      page: 'Page',
      of: 'of'
    },
    es: {
      title: 'VERIFICACIÓN DE ORDEN DE COMPRA',
      purchaseOrder: 'Orden de Compra:',
      supplierInvoice: 'Factura del Proveedor:',
      invoiceDate: 'Fecha de Factura:',
      destinationCountry: 'País de Destino:',
      currentDate: 'Fecha Actual:',
      no: 'NO',
      sku: 'SKU',
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
      of: 'de'
    }
  };

  const t = translations[locale];
  const poNumber = formatPONumber(invoiceNumber);
  const invoiceDate = formatDate(orders[0].purchaseDate, locale);
  const currentDate = formatDate(new Date(), locale);
  const destinationStock = orders[0].destinationStock;

  // Load logo
  let logoData = '';
  try {
    logoData = await loadLogoAsBase64();
  } catch (error) {
    console.error('Error loading logo:', error);
  }

  let currentY = margin;
  const lineHeight = 14;
  const headerHeight = 80;
  const footerHeight = 120; // Increased for signature spacing
  const tableStartY = 200; // More vertical spacing before table
  const signatureBlockHeight = 80; // Space reserved for signature on last page
  const baseRowHeight = 20; // Base row height, will be adjusted dynamically
  const cellPadding = 8; // Consistent padding for cells
  
  // Calculate table end Y - reserve space for signature on last page
  const tableEndY = pageHeight - margin - footerHeight;

  // Column widths (sums to usableWidth) - CHECK moved to after QTY RECEIVED
  // Fixed widths for short columns, NOTES gets remaining space
  const colWidths = {
    no: usableWidth * 0.04,
    sku: usableWidth * 0.12,
    description: usableWidth * 0.28,
    category: 75, // Fixed width for short content
    line: 75, // Fixed width for short content
    qtyOrdered: 60, // Fixed width for numbers
    qtyReceived: 60, // Fixed width for numbers
    check: usableWidth * 0.05,
    notes: 0 // Will be calculated as remaining space
  };
  
  // Calculate NOTES width as remaining space
  const usedWidth = colWidths.no + colWidths.sku + colWidths.description + 
                    colWidths.category + colWidths.line + colWidths.qtyOrdered + 
                    colWidths.qtyReceived + colWidths.check;
  colWidths.notes = usableWidth - usedWidth;

  let currentPage = 1;
  let totalPages = 1; // Will be calculated after row heights
  const rowHeights: number[] = []; // Array to store calculated row heights

  // Helper function to add a new page
  const addNewPage = () => {
    doc.addPage();
    currentY = margin;
    // Redraw header on new page
    drawHeader();
    // Table header will be drawn in main loop when currentY === tableStartY
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
    doc.text(`${t.destinationCountry} ${destinationStock}`, headerX, currentY, { align: 'right' });
    currentY += lineHeight;
    doc.text(`${t.currentDate} ${currentDate}`, headerX, currentY, { align: 'right' });
  };

  // Draw table header
  const drawTableHeader = (startY: number) => {
    const headerRowHeight = baseRowHeight + 4;
    let x = margin;
    
    // Darker background for header
    doc.setFillColor(230, 230, 230);
    doc.rect(x, startY, usableWidth, headerRowHeight, 'F');
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);

    x = margin;
    // NO column
    doc.text(t.no, x + colWidths.no / 2, startY + headerRowHeight / 2 + 3, { align: 'center' });
    x += colWidths.no;
    // SKU column
    doc.text(t.sku, x + colWidths.sku / 2, startY + headerRowHeight / 2 + 3, { align: 'center' });
    x += colWidths.sku;
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
    x += colWidths.sku;
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

  // Calculate row height based on text content
  const calculateRowHeight = (order: PurchaseOrder): number => {
    doc.setFontSize(9);
    const lineSpacing = 10;
    const minHeight = baseRowHeight;
    
    // Calculate height needed for each column
    const descText = doc.splitTextToSize(order.description || '-', colWidths.description - (cellPadding * 2));
    const skuText = doc.splitTextToSize(order.sku || '-', colWidths.sku - (cellPadding * 2));
    const catText = doc.splitTextToSize(order.category || '-', colWidths.category - (cellPadding * 2));
    const lineText = doc.splitTextToSize(order.line || '-', colWidths.line - (cellPadding * 2));
    
    const maxLines = Math.max(
      descText.length,
      skuText.length,
      catText.length,
      lineText.length,
      1
    );
    
    return Math.max(minHeight, (maxLines * lineSpacing) + (cellPadding * 2));
  };

  // Pre-calculate all row heights
  orders.forEach(order => {
    rowHeights.push(calculateRowHeight(order));
  });

  // Draw table row with dynamic height
  const drawTableRow = (order: PurchaseOrder, rowY: number, globalRowIndex: number, rowHeight: number, isEven: boolean): number => {
    // Alternating row colors
    if (isEven) {
      doc.setFillColor(250, 247, 229); // #FAF7E5
    } else {
      doc.setFillColor(255, 255, 255); // White
    }
    doc.rect(margin, rowY, usableWidth, rowHeight, 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 51, 51);

    let x = margin;
    const textY = rowY + cellPadding + 9;
    
    // NO (use global row index for numbering)
    doc.text(String(globalRowIndex + 1), x + colWidths.no / 2, rowY + rowHeight / 2 + 3, { align: 'center' });
    x += colWidths.no;
    
    // SKU - with proper wrapping
    const skuText = doc.splitTextToSize(order.sku || '-', colWidths.sku - (cellPadding * 2));
    doc.text(skuText, x + cellPadding, textY);
    x += colWidths.sku;
    
    // DESCRIPTION - with proper wrapping and dynamic height
    const descText = doc.splitTextToSize(order.description || '-', colWidths.description - (cellPadding * 2));
    doc.text(descText, x + cellPadding, textY);
    x += colWidths.description;
    
    // CATEGORY - with proper wrapping
    const catText = doc.splitTextToSize(order.category || '-', colWidths.category - (cellPadding * 2));
    doc.text(catText, x + cellPadding, textY);
    x += colWidths.category;
    
    // LINE - with proper wrapping
    const lineText = doc.splitTextToSize(order.line || '-', colWidths.line - (cellPadding * 2));
    doc.text(lineText, x + cellPadding, textY);
    x += colWidths.line;
    
    // QTY ORDERED
    doc.text(String(order.quantity), x + colWidths.qtyOrdered / 2, rowY + rowHeight / 2 + 3, { align: 'center' });
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
    x += colWidths.sku;
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

  // Draw footer
  const drawFooter = () => {
    const footerY = pageHeight - margin - footerHeight;
    
    // Only show verification fields on last page
    if (currentPage === totalPages) {
      // Ensure proper spacing - check if we have enough room
      const signatureStartY = footerY + 10;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 51, 51);

      const footerX = margin + 100;
      let footerCurrentY = signatureStartY;

      // Verified By
      doc.setFont('helvetica', 'bold');
      doc.text(t.verifiedBy, footerX, footerCurrentY);
      doc.setFont('helvetica', 'normal');
      doc.line(footerX + 80, footerCurrentY - 5, footerX + 250, footerCurrentY - 5);
      footerCurrentY += 20;

      // Date
      doc.setFont('helvetica', 'bold');
      doc.text(t.date, footerX, footerCurrentY);
      doc.setFont('helvetica', 'normal');
      doc.line(footerX + 80, footerCurrentY - 5, footerX + 250, footerCurrentY - 5);
      footerCurrentY += 20;

      // Signature
      doc.setFont('helvetica', 'bold');
      doc.text(t.signature, footerX, footerCurrentY);
      doc.setFont('helvetica', 'normal');
      doc.line(footerX + 80, footerCurrentY - 5, footerX + 250, footerCurrentY - 5);
    }

    // Page number (centered at bottom)
    doc.setFontSize(9);
    doc.setTextColor(153, 153, 153);
    const pageText = `${t.page} ${currentPage} ${t.of} ${totalPages}`;
    doc.text(pageText, pageWidth / 2, pageHeight - margin - 10, { align: 'center' });
  };

  // Calculate total pages based on dynamic row heights
  const headerRowHeight = baseRowHeight + 4;
  let pageY = tableStartY + headerRowHeight; // Start after header
  totalPages = 1;
  
  // First pass: calculate pages without signature reservation
  for (let i = 0; i < rowHeights.length; i++) {
    const rowHeight = rowHeights[i];
    if (pageY + rowHeight > tableEndY && i > 0) {
      totalPages++;
      pageY = tableStartY + headerRowHeight;
    }
    pageY += rowHeight;
  }
  
  // Second pass: verify last page has room for signature, add page if needed
  pageY = tableStartY + headerRowHeight;
  let currentCalcPage = 1;
  for (let i = 0; i < rowHeights.length; i++) {
    const rowHeight = rowHeights[i];
    const isLastRow = (i === rowHeights.length - 1);
    const willBeLastPage = (currentCalcPage === totalPages);
    
    // On last page with last row, reserve space for signature
    const effectiveTableEndY = (willBeLastPage && isLastRow)
      ? tableEndY - signatureBlockHeight
      : tableEndY;
    
    if (pageY + rowHeight > effectiveTableEndY && i > 0) {
      currentCalcPage++;
      pageY = tableStartY + headerRowHeight;
      // If we need a new page for the last row, increment total pages
      if (isLastRow && currentCalcPage > totalPages) {
        totalPages = currentCalcPage;
      }
    }
    pageY += rowHeight;
  }

  // Generate PDF with dynamic row heights
  drawHeader();
  
  currentY = tableStartY;
  currentPage = 1;

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const rowHeight = rowHeights[i];
    const isEven = i % 2 === 0;

    // Check if we need a new page (account for header if needed)
    const needsHeader = currentY === tableStartY;
    const spaceNeeded = (needsHeader ? headerRowHeight : 0) + rowHeight;
    
    // On last page, reserve space for signature block
    const effectiveTableEndY = (currentPage === totalPages && i === orders.length - 1) 
      ? tableEndY - signatureBlockHeight 
      : tableEndY;
    
    if (currentY + spaceNeeded > effectiveTableEndY && i > 0) {
      drawFooter();
      addNewPage();
      currentPage++;
      currentY = tableStartY;
    }

    // Draw table header if this is the first row on the page
    if (currentY === tableStartY) {
      drawTableHeader(currentY);
      currentY += headerRowHeight;
    }

    // Draw the row
    drawTableRow(order, currentY, i, rowHeight, isEven);
    currentY += rowHeight;
  }

  // Draw final footer
  drawFooter();

  // Save PDF
  const fileName = `PO-Verification-${poNumber}.pdf`;
  doc.save(fileName);
}

