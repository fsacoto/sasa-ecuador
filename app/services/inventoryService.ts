import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, query, where, orderBy, limit, QueryDocumentSnapshot, Timestamp, runTransaction, serverTimestamp, DocumentSnapshot } from 'firebase/firestore';
import { db, auth } from '../utils/firebase';
import { InventoryItem, InventoryCountry, InventoryTransfer, InventoryTransferItem } from '../types';

const COLLECTION_NAME = 'inventory';
const TRANSFERS_COLLECTION_NAME = 'inventoryTransfers';

// Helper to convert Firestore data to InventoryItem
const toInventoryItem = (doc: QueryDocumentSnapshot): InventoryItem => {
  const data = doc.data();
  return {
    id: doc.id,
    ...(data as Omit<InventoryItem, 'id'>),
    createdAt: (data.createdAt as Timestamp)?.toDate() || new Date()
  };
};

// Helper to convert InventoryItem to Firestore data
const toFirestore = (item: Omit<InventoryItem, 'id' | 'createdAt'> | Partial<InventoryItem>) => {
  return item;
};

// Get all inventory items
export async function getInventoryItems(): Promise<InventoryItem[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy('name'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(toInventoryItem);
  } catch (error) {
    console.error('Error fetching inventory items:', error);
    throw error;
  }
}

// Get a single inventory item
export async function getInventoryItem(id: string): Promise<InventoryItem | null> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return toInventoryItem(docSnap);
    }
    return null;
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    throw error;
  }
}

// Get inventory item by SKU
export async function getInventoryItemBySKU(sku: string): Promise<InventoryItem | null> {
  try {
    const q = query(collection(db, COLLECTION_NAME), where('sku', '==', sku), limit(1));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return toInventoryItem(querySnapshot.docs[0]);
    }
    return null;
  } catch (error) {
    console.error('Error fetching inventory item by SKU:', error);
    throw error;
  }
}

// Add a new inventory item
export async function addInventoryItem(item: Omit<InventoryItem, 'id' | 'createdAt'>): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), toFirestore(item));
    return docRef.id;
  } catch (error) {
    console.error('Error adding inventory item:', error);
    throw error;
  }
}

// Add multiple inventory items
export async function addInventoryItemsBulk(items: Omit<InventoryItem, 'id' | 'createdAt'>[]): Promise<string[]> {
  try {
    const promises = items.map(item => addDoc(collection(db, COLLECTION_NAME), toFirestore(item)));
    const docRefs = await Promise.all(promises);
    return docRefs.map(doc => doc.id);
  } catch (error) {
    console.error('Error adding inventory items in bulk:', error);
    throw error;
  }
}

// Update an inventory item
export async function updateInventoryItem(id: string, updates: Partial<InventoryItem>): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const { id: _, createdAt: _createdAt, ...updateData } = updates;
    await updateDoc(docRef, updateData);
  } catch (error) {
    console.error('Error updating inventory item:', error);
    throw error;
  }
}

// Delete an inventory item
export async function deleteInventoryItem(id: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    throw error;
  }
}

// Search inventory items by name or SKU
export async function searchInventoryItems(searchTerm: string): Promise<InventoryItem[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy('name'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs
      .map(toInventoryItem)
      .filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchTerm.toLowerCase())
      );
  } catch (error) {
    console.error('Error searching inventory items:', error);
    throw error;
  }
}

// Get inventory items by category
export async function getInventoryItemsByCategory(category: string): Promise<InventoryItem[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), where('category', '==', category), orderBy('name'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(toInventoryItem);
  } catch (error) {
    console.error('Error fetching inventory items by category:', error);
    throw error;
  }
}

// Get inventory items by line
export async function getInventoryItemsByLine(line: string): Promise<InventoryItem[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), where('line', '==', line), orderBy('name'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(toInventoryItem);
  } catch (error) {
    console.error('Error fetching inventory items by line:', error);
    throw error;
  }
}

// Generate unique transaction ID
function generateTransactionId(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `TRF-${timestamp}-${random}`;
}

// Helper to convert Firestore transfer data to InventoryTransfer
type InventoryTransferDoc = {
  transactionId: string;
  items: Array<{
    itemId: string;
    sku: string;
    name: string;
    quantity: number;
    fromCountry: InventoryCountry;
    toCountry: InventoryCountry;
    resultingEcuadorStock?: number;
    resultingUsaStock?: number;
  }>;
  note?: string;
  createdAt?: Timestamp;
  createdBy?: { uid: string; name?: string } | null;
};

const toInventoryTransfer = (snap: QueryDocumentSnapshot | DocumentSnapshot): InventoryTransfer => {
  const data = ((snap.data() || {}) as Partial<InventoryTransferDoc>);
  
  // Handle legacy format (single item transfers)
  if ((data as any).itemId) {
    const legacy = data as any;
    return {
      id: snap.id,
      transactionId: legacy.transactionId || generateTransactionId(),
      items: [{
        itemId: legacy.itemId || '',
        sku: legacy.sku || '',
        name: legacy.name || '',
        quantity: legacy.quantity || 0,
        fromCountry: (legacy.fromCountry || 'Ecuador') as InventoryCountry,
        toCountry: (legacy.toCountry || 'USA') as InventoryCountry,
        resultingEcuadorStock: legacy.resultingEcuadorStock,
        resultingUsaStock: legacy.resultingUsaStock
      }],
      note: legacy.note,
      createdAt: legacy.createdAt?.toDate?.() || new Date(0),
      createdBy: legacy.createdBy || undefined
    };
  }
  
  return {
    id: snap.id,
    transactionId: data.transactionId || generateTransactionId(),
    items: data.items || [],
    note: data.note,
    createdAt: data.createdAt?.toDate?.() || new Date(0),
    createdBy: data.createdBy || undefined
  };
};

// Get inventory transfer history
export async function getInventoryTransfers(options?: {
  limitCount?: number;
  transactionId?: string;
}): Promise<InventoryTransfer[]> {
  try {
    const limitCount = options?.limitCount ?? 200;
    const base = collection(db, TRANSFERS_COLLECTION_NAME);

    const q = options?.transactionId
      ? query(base, where('transactionId', '==', options.transactionId), limit(1))
      : query(base, orderBy('createdAt', 'desc'), limit(limitCount));

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(toInventoryTransfer);
  } catch (error: unknown) {
    // Handle permission errors gracefully - return empty array if collection doesn't exist or user lacks permissions
    if (error && typeof error === 'object' && 'code' in error) {
      const firebaseError = error as { code: string; message: string };
      if (firebaseError.code === 'permission-denied' || firebaseError.code === 'unauthenticated') {
        console.warn('Permission denied or unauthenticated when fetching transfers:', firebaseError.message);
        return []; // Return empty array instead of throwing
      }
    }
    console.error('Error fetching inventory transfers:', error);
    throw error;
  }
}

// Move inventory between countries (bulk transfer with single transaction ID)
export async function moveInventoryBetweenCountries(params: {
  items: Array<{
    itemId: string;
    fromCountry: InventoryCountry;
    toCountry: InventoryCountry;
    quantity: number;
  }>;
  note?: string;
  movedBy?: { uid: string; name?: string };
}): Promise<InventoryTransfer> {
  const { items, note, movedBy } = params;

  if (!items || items.length === 0) throw new Error('At least one item is required');
  
  // Validate all items
  for (const item of items) {
    if (!item.itemId) throw new Error('itemId is required for all items');
    if (item.fromCountry === item.toCountry) throw new Error('fromCountry and toCountry must be different');
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error('quantity must be > 0 for all items');
  }

  // Verify user is authenticated before attempting transaction
  if (!auth.currentUser) {
    throw new Error('You must be logged in to move inventory. Please refresh the page and try again.');
  }

  const transactionId = generateTransactionId();
  const transferRef = doc(collection(db, TRANSFERS_COLLECTION_NAME));
  const transferItems: InventoryTransferItem[] = [];

  try {
    await runTransaction(db, async (tx) => {
      // PHASE 1: Read ALL items first (Firestore requires all reads before writes)
      const itemRefs = items.map(itemParam => doc(db, COLLECTION_NAME, itemParam.itemId));
      const itemSnaps = await Promise.all(itemRefs.map(ref => tx.get(ref)));
      
      // Validate all items exist
      for (let i = 0; i < itemSnaps.length; i++) {
        if (!itemSnaps[i].exists()) {
          throw new Error(`Inventory item not found: ${items[i].itemId}`);
        }
      }

      // PHASE 2: Process all items and prepare updates
      const updates: Array<{
        ref: ReturnType<typeof doc>;
        fromField: string;
        toField: string;
        newFromStock: number;
        newToStock: number;
        transferItem: InventoryTransferItem;
      }> = [];

      for (let i = 0; i < items.length; i++) {
        const itemParam = items[i];
        const itemSnap = itemSnaps[i];
        const data = (itemSnap.data() || {}) as Partial<InventoryItem>;
        const fromField = itemParam.fromCountry === 'Ecuador' ? 'ecuadorStock' : 'usaStock';
        const toField = itemParam.toCountry === 'Ecuador' ? 'ecuadorStock' : 'usaStock';

        const fromStock = Number((data as Record<string, unknown>)[fromField] || 0);
        const toStock = Number((data as Record<string, unknown>)[toField] || 0);

        if (fromStock < itemParam.quantity) {
          throw new Error(`Insufficient stock in ${itemParam.fromCountry} for ${data.name || itemParam.itemId}`);
        }

        const newFromStock = fromStock - itemParam.quantity;
        const newToStock = toStock + itemParam.quantity;

        const newEcuadorStock = itemParam.fromCountry === 'Ecuador'
          ? newFromStock
          : (itemParam.toCountry === 'Ecuador' ? newToStock : Number(data.ecuadorStock || 0));

        const newUsaStock = itemParam.fromCountry === 'USA'
          ? newFromStock
          : (itemParam.toCountry === 'USA' ? newToStock : Number(data.usaStock || 0));

        updates.push({
          ref: itemRefs[i],
          fromField,
          toField,
          newFromStock,
          newToStock,
          transferItem: {
            itemId: itemParam.itemId,
            sku: data.sku || '',
            name: data.name || '',
            quantity: itemParam.quantity,
            fromCountry: itemParam.fromCountry,
            toCountry: itemParam.toCountry,
            resultingEcuadorStock: newEcuadorStock,
            resultingUsaStock: newUsaStock
          }
        });
      }

      // PHASE 3: Execute ALL writes (after all reads are done)
      for (const update of updates) {
        tx.update(update.ref, {
          [update.fromField]: update.newFromStock,
          [update.toField]: update.newToStock
        });
        transferItems.push(update.transferItem);
      }

      // Create transfer document
      tx.set(transferRef, {
        transactionId,
        items: transferItems,
        note: note || '',
        createdAt: serverTimestamp(),
        createdBy: movedBy || null
      });
    });

    const transferSnap = await getDoc(transferRef);
    if (!transferSnap.exists()) {
      throw new Error('Transfer history document not found after commit');
    }

    return toInventoryTransfer(transferSnap);
  } catch (error: unknown) {
    console.error('Error moving inventory between countries:', error);
    
    // Provide more helpful error messages
    if (error && typeof error === 'object' && 'code' in error) {
      const firebaseError = error as { code: string; message: string };
      if (firebaseError.code === 'permission-denied') {
        throw new Error('Permission denied. Please ensure you are logged in and Firestore rules are deployed. Error: ' + firebaseError.message);
      }
      if (firebaseError.code === 'unauthenticated') {
        throw new Error('You must be logged in to move inventory.');
      }
      if (firebaseError.code === 'failed-precondition') {
        throw new Error('Transaction failed. Please try again.');
      }
    }
    
    // Re-throw with original message if it's an Error
    if (error instanceof Error) {
      throw error;
    }
    
    throw new Error('An unexpected error occurred while moving inventory.');
  }
}

