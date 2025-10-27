import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  where,
  orderBy 
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import { SalesInvoice } from '../types';

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
    let q = query(collection(db, INVOICES_COLLECTION), orderBy('date', 'desc'));
    
    if (filters?.clientId) {
      q = query(q, where('clientId', '==', filters.clientId));
    }
    if (filters?.paymentStatus) {
      q = query(q, where('paymentStatus', '==', filters.paymentStatus));
    }
    if (filters?.deliveryStatus) {
      q = query(q, where('deliveryStatus', '==', filters.deliveryStatus));
    }

    const snapshot = await getDocs(q);
    let invoices = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      deliveryDate: doc.data().deliveryDate?.toDate(),
      paymentDate: doc.data().paymentDate?.toDate(),
    })) as SalesInvoice[];

    // Apply date filters if provided
    if (filters?.dateFrom) {
      invoices = invoices.filter(inv => inv.date >= filters.dateFrom!);
    }
    if (filters?.dateTo) {
      invoices = invoices.filter(inv => inv.date <= filters.dateTo!);
    }

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
      } as SalesInvoice;
    }
    return null;
  } catch (error) {
    console.error('Error fetching invoice:', error);
    throw error;
  }
}

// Create a new invoice
export async function createInvoice(invoice: Omit<SalesInvoice, 'id' | 'createdAt'>): Promise<SalesInvoice> {
  try {
    const docRef = doc(collection(db, INVOICES_COLLECTION));
    
    // Filter out undefined values
    const newInvoice: any = {
      ...invoice,
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
    const cleanUpdates: any = { ...updates };
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
