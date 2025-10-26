import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { PurchaseOrder, PurchaseOrderStatus } from '../types';

const COLLECTION_NAME = 'purchaseOrders';

// Helper to convert Firestore data to PurchaseOrder
const toPurchaseOrder = (doc: any): PurchaseOrder => ({
  id: doc.id,
  ...doc.data(),
  purchaseDate: doc.data().purchaseDate?.toDate() || new Date(),
  receivedDate: doc.data().receivedDate?.toDate(),
  verifiedDate: doc.data().verifiedDate?.toDate(),
  createdAt: doc.data().createdAt?.toDate() || new Date()
});

// Helper to convert PurchaseOrder to Firestore data
const toFirestore = (order: Omit<PurchaseOrder, 'id' | 'createdAt'> | Partial<PurchaseOrder>) => {
  const data: any = { ...order };
  return data;
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
    const { id: _, createdAt, ...updateData } = updates;
    await updateDoc(docRef, toFirestore(updateData));
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

