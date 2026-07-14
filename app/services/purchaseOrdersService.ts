import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, query, where, orderBy, QueryDocumentSnapshot, Timestamp, deleteField } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { PurchaseOrder, PurchaseOrderStatus } from '../types';
import { landedCostPerSaleableUnit, normalizeUnitsPerPackInput } from '../utils/purchaseOrderPack';

export type PurchaseOrderFieldUpdate = Omit<
  Partial<PurchaseOrder>,
  'unitsPerPack' | 'labelsPrintedCount'
> & {
  unitsPerPack?: number | null;
  labelsPrintedCount?: number | null;
};

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

/** Fields that may be cleared with `null` → Firestore deleteField(). */
const NULLABLE_DELETE_FIELDS = new Set(['unitsPerPack', 'labelsPrintedCount']);

// Update a purchase order
export async function updatePurchaseOrder(id: string, updates: PurchaseOrderFieldUpdate): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const { id: _, createdAt: _createdAt, ...updateData } = updates;
    
    // Filter out undefined; null on nullable fields → deleteField (clear pack / printed count)
    const cleanUpdates: Record<string, unknown> = {};
    Object.keys(updateData).forEach((key) => {
      const value = (updateData as Record<string, unknown>)[key];
      if (value === undefined) return;
      if (value === null && NULLABLE_DELETE_FIELDS.has(key)) {
        cleanUpdates[key] = deleteField();
        return;
      }
      if (value !== null) {
        cleanUpdates[key] = value;
      }
    });
    
    await updateDoc(docRef, { ...cleanUpdates, destinationStock: deleteField() });
  } catch (error) {
    console.error('Error updating purchase order:', error);
    throw error;
  }
}

export type PackUnitsUpdate = { orderId: string; unitsPerPack: number | null };

/**
 * Build Firestore patches for box/set (unitsPerPack). null clears the field.
 * Also refreshes landedCostPerUnit from totalLandedCost ÷ saleable units.
 * Caller should persist via updatePurchaseOrdersBulk / context.
 */
export function buildPackUnitsOrderUpdates(
  updates: PackUnitsUpdate[],
  ordersById: Map<string, PurchaseOrder>
): Array<{ id: string; orderUpdate: PurchaseOrderFieldUpdate }> {
  const prepared: Array<{ id: string; orderUpdate: PurchaseOrderFieldUpdate }> = [];

  for (const { orderId, unitsPerPack } of updates) {
    const existing = ordersById.get(orderId);
    if (!existing) continue;

    const normalized = normalizeUnitsPerPackInput(unitsPerPack);
    const nextForCost: PurchaseOrder = { ...existing };
    if (normalized == null) {
      delete nextForCost.unitsPerPack;
    } else {
      nextForCost.unitsPerPack = normalized;
    }

    prepared.push({
      id: orderId,
      orderUpdate: {
        unitsPerPack: normalized,
        landedCostPerUnit: landedCostPerSaleableUnit(nextForCost),
      },
    });
  }

  return prepared;
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

/** Update many orders in parallel; one UI merge should follow in context. */
export async function updatePurchaseOrdersBulk(
  updates: Array<{ id: string; orderUpdate: PurchaseOrderFieldUpdate }>
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
    await Promise.all(unique.map((id) => deletePurchaseOrder(id)));
  } catch (error) {
    console.error('Error deleting purchase orders in bulk:', error);
    throw error;
  }
}

