import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, query, where, orderBy, QueryDocumentSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { PurchaseOrder, PurchaseOrderStatus } from '../types';

const COLLECTION_NAME = 'purchaseOrders';

// Helper to convert Firestore data to PurchaseOrder
const toPurchaseOrder = (doc: QueryDocumentSnapshot): PurchaseOrder => {
  const data = doc.data();
  return {
    id: doc.id,
    ...(data as Omit<PurchaseOrder, 'id'>),
    purchaseDate: (data.purchaseDate as Timestamp)?.toDate() || new Date(),
    receivedDate: (data.receivedDate as Timestamp)?.toDate(),
    verifiedDate: (data.verifiedDate as Timestamp)?.toDate(),
    createdAt: (data.createdAt as Timestamp)?.toDate() || new Date()
  };
};

// Helper to convert PurchaseOrder to Firestore data
const toFirestore = (order: Omit<PurchaseOrder, 'id' | 'createdAt'> | Partial<PurchaseOrder>) => {
  // Filter out undefined values (Firestore doesn't accept undefined)
  const cleanOrder: Record<string, any> = {};
  Object.keys(order).forEach(key => {
    const value = (order as any)[key];
    if (value !== undefined) {
      cleanOrder[key] = value;
    }
  });
  return cleanOrder;
};

// Get all purchase orders
export async function getPurchaseOrders(): Promise<PurchaseOrder[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy('purchaseDate', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(toPurchaseOrder);
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    throw error;
  }
}

// Get a single purchase order
export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return toPurchaseOrder(docSnap);
    }
    return null;
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    throw error;
  }
}

// Get purchase orders by invoice number
export async function getPurchaseOrdersByInvoice(invoiceNumber: string): Promise<PurchaseOrder[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), where('invoice', '==', invoiceNumber));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(toPurchaseOrder);
  } catch (error) {
    console.error('Error fetching purchase orders by invoice:', error);
    throw error;
  }
}

// Get purchase orders by supplier
export async function getPurchaseOrdersBySupplier(supplierId: string): Promise<PurchaseOrder[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), where('supplierId', '==', supplierId), orderBy('purchaseDate', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(toPurchaseOrder);
  } catch (error) {
    console.error('Error fetching purchase orders by supplier:', error);
    throw error;
  }
}

// Get purchase orders by status
export async function getPurchaseOrdersByStatus(status: PurchaseOrderStatus): Promise<PurchaseOrder[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), where('status', '==', status), orderBy('purchaseDate', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(toPurchaseOrder);
  } catch (error) {
    console.error('Error fetching purchase orders by status:', error);
    throw error;
  }
}

// Add a new purchase order
export async function addPurchaseOrder(order: Omit<PurchaseOrder, 'id' | 'createdAt'>): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), toFirestore(order));
    return docRef.id;
  } catch (error) {
    console.error('Error adding purchase order:', error);
    throw error;
  }
}

// Add multiple purchase orders
export async function addPurchaseOrdersBulk(orders: Omit<PurchaseOrder, 'id' | 'createdAt'>[]): Promise<string[]> {
  try {
    const promises = orders.map(order => addDoc(collection(db, COLLECTION_NAME), toFirestore(order)));
    const docRefs = await Promise.all(promises);
    return docRefs.map(doc => doc.id);
  } catch (error) {
    console.error('Error adding purchase orders in bulk:', error);
    throw error;
  }
}

// Update a purchase order
export async function updatePurchaseOrder(id: string, updates: Partial<PurchaseOrder>): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const { id: _, createdAt: _createdAt, ...updateData } = updates;
    
    // Filter out undefined values (Firestore doesn't accept undefined)
    const cleanUpdates: Record<string, any> = {};
    Object.keys(updateData).forEach(key => {
      const value = (updateData as any)[key];
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    });
    
    await updateDoc(docRef, cleanUpdates);
  } catch (error) {
    console.error('Error updating purchase order:', error);
    throw error;
  }
}

// Delete a purchase order
export async function deletePurchaseOrder(id: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting purchase order:', error);
    throw error;
  }
}

