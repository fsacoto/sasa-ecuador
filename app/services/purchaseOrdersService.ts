import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, query, where, orderBy, QueryDocumentSnapshot, Timestamp, deleteField } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { PurchaseOrder, PurchaseOrderStatus } from '../types';
import { cleanupPurchaseOrderAssets } from './firebaseDeleteAssets';

const COLLECTION_NAME = 'purchaseOrders';

/** Firestore / imports may use different casing; keep a single canonical status in the app. */
export function normalizePurchaseOrderStatus(raw: unknown): PurchaseOrder['status'] {
  const s = String(raw ?? 'Ordered').trim().toLowerCase();
  if (s === 'shipped' || s === 'received') return 'Received';
  if (s === 'verified') return 'Verified';
  if (s === 'ordered') return 'Ordered';
  const t = String(raw ?? 'Ordered').trim();
  if (t === 'Shipped') return 'Received';
  if (t === 'Ordered' || t === 'Received' || t === 'Verified') return t;
  return 'Ordered';
}

// Helper to convert Firestore data to PurchaseOrder (drops legacy `destinationStock`)
const toPurchaseOrder = (docSnap: QueryDocumentSnapshot): PurchaseOrder => {
  const data = docSnap.data();
  const { destinationStock: _legacyDest, ...rest } = data as Record<string, unknown>;
  return {
    id: docSnap.id,
    ...(rest as Omit<PurchaseOrder, 'id'>),
    status: normalizePurchaseOrderStatus(data.status),
    purchaseDate: (data.purchaseDate as Timestamp)?.toDate() || new Date(),
    receivedDate: (data.receivedDate as Timestamp)?.toDate(),
    verifiedDate: (data.verifiedDate as Timestamp)?.toDate(),
    lastScannedAt: (data.lastScannedAt as Timestamp)?.toDate(),
    quantityScanned:
      typeof data.quantityScanned === 'number' && !Number.isNaN(data.quantityScanned)
        ? data.quantityScanned
        : undefined,
    supplierClaimStatus:
      data.supplierClaimStatus === 'pending' || data.supplierClaimStatus === 'resolved'
        ? data.supplierClaimStatus
        : 'none',
    createdAt: (data.createdAt as Timestamp)?.toDate() || new Date()
  };
};

// Helper to convert PurchaseOrder to Firestore data
const toFirestore = (order: Omit<PurchaseOrder, 'id' | 'createdAt'> | Partial<PurchaseOrder>) => {
  // Filter out undefined values (Firestore doesn't accept undefined); never persist legacy destination
  const cleanOrder: Record<string, unknown> = {};
  Object.keys(order).forEach(key => {
    if (key === 'destinationStock') return;
    const value = (order as Record<string, unknown>)[key];
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
    
    await updateDoc(docRef, { ...cleanUpdates, destinationStock: deleteField() });
  } catch (error) {
    console.error('Error updating purchase order:', error);
    throw error;
  }
}

// Delete a purchase order and its Storage assets (images, verification media, etc.)
export async function deletePurchaseOrder(id: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      await cleanupPurchaseOrderAssets(toPurchaseOrder(docSnap));
    }
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting purchase order:', error);
    throw error;
  }
}

/** Update many orders in parallel; one UI merge should follow in context. */
export async function updatePurchaseOrdersBulk(
  updates: Array<{ id: string; orderUpdate: Partial<PurchaseOrder> }>
): Promise<void> {
  const unique = updates.filter((entry) => entry.id && Object.keys(entry.orderUpdate).length > 0);
  if (unique.length === 0) return;
  try {
    await Promise.all(
      unique.map(({ id, orderUpdate }) => updatePurchaseOrder(id, orderUpdate))
    );
  } catch (error) {
    console.error('Error updating purchase orders in bulk:', error);
    throw error;
  }
}

/** Delete many orders in parallel; one UI update should follow in context. */
export async function deletePurchaseOrdersBulk(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return;
  try {
    await Promise.all(
      unique.map(async (id) => {
        const docRef = doc(db, COLLECTION_NAME, id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          await cleanupPurchaseOrderAssets(toPurchaseOrder(docSnap));
        }
        await deleteDoc(docRef);
      })
    );
  } catch (error) {
    console.error('Error deleting purchase orders in bulk:', error);
    throw error;
  }
}

