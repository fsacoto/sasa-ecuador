import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  where
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import { SalesInvoice, PaymentRecord } from '../types';

const INVOICES_COLLECTION = 'invoices';

// Get all invoices
export async function getAllInvoices(filters?: {
  clientId?: string;
  paymentStatus?: string;
  deliveryStatus?: string;
  dateFrom?: Date;
  dateTo?: Date;
}): Promise<SalesInvoice[]> {
  try {
    // Start with base query - no ordering yet to avoid index issues
    let q = query(collection(db, INVOICES_COLLECTION));
    
    if (filters?.clientId) {
      // Handle walk-in customer filter
      if (filters.clientId === 'walk-in') {
        q = query(q, where('clientId', '==', ''));
      } else {
        q = query(q, where('clientId', '==', filters.clientId));
      }
    }
    if (filters?.paymentStatus) {
      q = query(q, where('paymentStatus', '==', filters.paymentStatus));
    }
    if (filters?.deliveryStatus) {
      q = query(q, where('deliveryStatus', '==', filters.deliveryStatus));
    }

    const snapshot = await getDocs(q);
    let invoices = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // Safely convert dates
      let invoiceDate: Date;
      let createdDate: Date;
      
      try {
        invoiceDate = data.date?.toDate() || new Date();
        createdDate = data.createdAt?.toDate() || new Date();
      } catch (e) {
        console.error('Date conversion error:', e);
        invoiceDate = new Date();
        createdDate = new Date();
      }
      
      return {
        id: doc.id,
        ...data,
        date: invoiceDate,
        createdAt: createdDate,
        deliveryDate: data.deliveryDate?.toDate?.() || undefined,
        paymentDate: data.paymentDate?.toDate?.() || undefined,
        paymentHistory: (data.paymentHistory || []).map((p: PaymentRecord & { date?: { toDate?: () => Date } }) => ({
          ...p, 
          date: p.date?.toDate?.() || new Date()
        }))
      };
    }) as SalesInvoice[];

    // Apply date filters if provided
    if (filters?.dateFrom) {
      invoices = invoices.filter(inv => inv.date >= filters.dateFrom!);
    }
    if (filters?.dateTo) {
      invoices = invoices.filter(inv => inv.date <= filters.dateTo!);
    }

    // Sort by createdAt descending (in-memory sort)
    invoices.sort((a, b) => {
      const aTime = a.createdAt.getTime();
      const bTime = b.createdAt.getTime();
      return bTime - aTime;
    });

    return invoices;
  } catch (error) {
    console.error('Error fetching invoices:', error);
    throw error;
  }
}

// Get a single invoice
export async function getInvoice(invoiceId: string): Promise<SalesInvoice | null> {
  try {
    const docRef = doc(db, INVOICES_COLLECTION, invoiceId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        date: data.date?.toDate() || new Date(),
        createdAt: data.createdAt?.toDate() || new Date(),
        deliveryDate: data.deliveryDate?.toDate(),
        paymentDate: data.paymentDate?.toDate(),
        paymentHistory: data.paymentHistory?.map((p: PaymentRecord & { date?: { toDate?: () => Date } }) => ({...p, date: (p.date && typeof p.date === 'object' && 'toDate' in p.date && typeof p.date.toDate === 'function') ? p.date.toDate() : (p.date instanceof Date ? p.date : new Date())})) || []
      } as SalesInvoice;
    }
    return null;
  } catch (error) {
    console.error('Error fetching invoice:', error);
    throw error;
  }
}

/** Extrae el correlativo numérico de FAC-xxxxx o NOTAV-xxx (histórico + nuevo). */
function extractSalesNoteSequence(invoiceNumber: unknown): number | null {
  if (typeof invoiceNumber !== 'string') return null;
  const m = invoiceNumber.match(/^(?:FAC|NOTAV)-(\d+)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isNaN(n) ? null : n;
}

// Generate next sequential nota de venta number (NOTAV-001, … continúa la serie respecto a FAC- antiguos)
export async function getNextInvoiceNumber(): Promise<string> {
  try {
    const q = query(collection(db, INVOICES_COLLECTION));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return 'NOTAV-001';
    }

    let lastNumber = 0;
    snapshot.docs.forEach((d) => {
      const n = extractSalesNoteSequence(d.data().invoiceNumber);
      if (n !== null && n > lastNumber) lastNumber = n;
    });

    const nextNumber = lastNumber + 1;
    return `NOTAV-${String(nextNumber).padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating invoice number:', error);
    return `NOTAV-${Date.now().toString().slice(-3)}`;
  }
}

// Create a new invoice
export async function createInvoice(invoice: Omit<SalesInvoice, 'id' | 'createdAt'>): Promise<SalesInvoice> {
  try {
    const docRef = doc(collection(db, INVOICES_COLLECTION));
    
    let invoiceNumber = invoice.invoiceNumber;
    const validSeq =
      typeof invoiceNumber === 'string' &&
      /^(FAC|NOTAV)-\d+$/i.test(invoiceNumber);
    if (!invoiceNumber || invoiceNumber === 'TEMP' || !validSeq) {
      invoiceNumber = await getNextInvoiceNumber();
    }
    
    // Filter out undefined values
    const newInvoice: Omit<SalesInvoice, 'id'> = {
      ...invoice,
      invoiceNumber: invoiceNumber,
      createdAt: new Date(),
    };

    // Remove undefined fields
    Object.keys(newInvoice).forEach(key => {
      if ((newInvoice as Record<string, unknown>)[key] === undefined) {
        delete (newInvoice as Record<string, unknown>)[key];
      }
    });

    await setDoc(docRef, newInvoice);

    return {
      id: docRef.id,
      ...newInvoice,
    } as SalesInvoice;
  } catch (error) {
    console.error('Error creating invoice:', error);
    throw error;
  }
}

// Update an invoice
export async function updateInvoice(invoiceId: string, updates: Partial<SalesInvoice>): Promise<void> {
  try {
    const docRef = doc(db, INVOICES_COLLECTION, invoiceId);
    
    // Filter out undefined values
    const cleanUpdates: Partial<SalesInvoice> = { ...updates };
    Object.keys(cleanUpdates).forEach(key => {
      if ((cleanUpdates as Record<string, unknown>)[key] === undefined) {
        delete (cleanUpdates as Record<string, unknown>)[key];
      }
    });

    await setDoc(docRef, cleanUpdates, { merge: true });
  } catch (error) {
    console.error('Error updating invoice:', error);
    throw error;
  }
}

// Delete an invoice
export async function deleteInvoice(invoiceId: string): Promise<void> {
  try {
    const docRef = doc(db, INVOICES_COLLECTION, invoiceId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting invoice:', error);
    throw error;
  }
}
