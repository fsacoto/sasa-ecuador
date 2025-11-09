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
        paymentHistory: data.paymentHistory?.map((p: PaymentRecord & { date?: { toDate?: () => Date } }) => ({...p, date: p.date?.toDate() || new Date()})) || []
      } as SalesInvoice;
    }
    return null;
  } catch (error) {
    console.error('Error fetching invoice:', error);
    throw error;
  }
}

// Generate next sequential invoice number
export async function getNextInvoiceNumber(): Promise<string> {
  try {
    const q = query(collection(db, INVOICES_COLLECTION));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      // First invoice
      return 'FAC-00001';
    }
    
    // Get the last invoice number
    let lastNumber = 0;
    snapshot.docs.forEach(doc => {
      const invoiceNumber = doc.data().invoiceNumber;
      if (invoiceNumber && invoiceNumber.startsWith('FAC-')) {
        const numberPart = parseInt(invoiceNumber.replace('FAC-', ''));
        if (!isNaN(numberPart) && numberPart > lastNumber) {
          lastNumber = numberPart;
        }
      }
    });
    
    // Generate next number
    const nextNumber = lastNumber + 1;
    return `FAC-${String(nextNumber).padStart(5, '0')}`;
  } catch (error) {
    console.error('Error generating invoice number:', error);
    // Fallback to timestamp if error
    return `FAC-${Date.now().toString().slice(-5)}`;
  }
}

// Create a new invoice
export async function createInvoice(invoice: Omit<SalesInvoice, 'id' | 'createdAt'>): Promise<SalesInvoice> {
  try {
    const docRef = doc(collection(db, INVOICES_COLLECTION));
    
    // Generate invoice number if not provided or if it's the old format
    let invoiceNumber = invoice.invoiceNumber;
    if (!invoiceNumber || !invoiceNumber.startsWith('FAC-')) {
      invoiceNumber = await getNextInvoiceNumber();
    }
    
    // Filter out undefined values
    const newInvoice: SalesInvoice = {
      ...invoice,
      invoiceNumber: invoiceNumber,
      createdAt: new Date(),
    };

    // Remove undefined fields
    Object.keys(newInvoice).forEach(key => {
      if (newInvoice[key] === undefined) {
        delete newInvoice[key];
      }
    });

    await setDoc(docRef, newInvoice);

    return {
      id: docRef.id,
      ...newInvoice,
    };
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
      if (cleanUpdates[key] === undefined) {
        delete cleanUpdates[key];
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
