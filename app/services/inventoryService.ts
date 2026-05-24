import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, query, where, orderBy, limit, QueryDocumentSnapshot, DocumentSnapshot, Timestamp, deleteField } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { ConsignmentReturnIssueRef, InventoryItem } from '../types';
import { normalizeSalePrice } from '../utils/salePrice';
import { cleanupInventoryItemAssets } from './firebaseDeleteAssets';
import { deleteInventoryMediaForSku } from './inventoryMediaService';

const COLLECTION_NAME = 'inventory';

/** Firestore rejects `undefined` anywhere in update payloads (including nested maps / arrays). */
function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)).filter((v) => v !== undefined);
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const next = stripUndefinedDeep(v);
    if (next !== undefined) out[k] = next;
  }
  return out;
}

function normalizeConsignmentReturnIssues(raw: unknown): ConsignmentReturnIssueRef[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((entry) => {
    const o = entry as Record<string, unknown>;
    const ra = o.recordedAt;
    let recordedAt: Date;
    if (ra && typeof (ra as Timestamp).toDate === 'function') {
      recordedAt = (ra as Timestamp).toDate();
    } else if (ra instanceof Date) {
      recordedAt = ra;
    } else {
      recordedAt = new Date(String(ra ?? Date.now()));
    }
    return {
      consignmentFirestoreId: String(o.consignmentFirestoreId ?? ''),
      consignmentNumber: String(o.consignmentNumber ?? ''),
      sku: String(o.sku ?? ''),
      itemIndex: o.itemIndex !== undefined ? Number(o.itemIndex) : undefined,
      quantityProblem: Number(o.quantityProblem ?? 0),
      quantityGoodInReturn:
        o.quantityGoodInReturn !== undefined ? Number(o.quantityGoodInReturn) : undefined,
      comment: o.comment !== undefined ? String(o.comment) : undefined,
      mediaUrls: Array.isArray(o.mediaUrls) ? o.mediaUrls.map(String) : undefined,
      recordedAt,
    };
  });
}

/** Merge legacy `usaStock` into `ecuadorStock` on read; omit `usaStock` from the typed object. */
const toInventoryItem = (docSnap: QueryDocumentSnapshot | DocumentSnapshot): InventoryItem => {
  const data = docSnap.data() ?? {};
  const raw = data as Record<string, unknown>;
  const ec = Number(raw.ecuadorStock ?? 0);
  const legacyUsa = Number(raw.usaStock ?? 0);
  const { usaStock: _legacyUsa, consignmentReturnIssues: rawCr, ...rest } = raw as Record<string, unknown>;
  const normalizedCr = normalizeConsignmentReturnIssues(rawCr);
  const salePrice = normalizeSalePrice(raw.salePrice);
  return {
    ...(rest as Omit<
      InventoryItem,
      'id' | 'createdAt' | 'ecuadorStock' | 'consignmentReturnIssues' | 'salePrice'
    >),
    id: docSnap.id,
    ecuadorStock: ec + legacyUsa,
    createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
    ...(normalizedCr ? { consignmentReturnIssues: normalizedCr } : {}),
    ...(salePrice !== undefined ? { salePrice } : {}),
  };
};

/** Never persist legacy USA bucket (hub Ecuador). */
const toFirestore = (item: Omit<InventoryItem, 'id' | 'createdAt'> | Partial<InventoryItem>) => {
  const { usaStock: _omit, ...rest } = item as Record<string, unknown>;
  return stripUndefinedDeep(rest) as Record<string, unknown>;
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
    const payload = toFirestore(updateData as Partial<InventoryItem>) as Record<string, unknown>;
    if ('salePrice' in updateData) {
      const normalized = normalizeSalePrice((updateData as { salePrice?: unknown }).salePrice);
      if (normalized === undefined) {
        payload.salePrice = deleteField();
      } else {
        payload.salePrice = normalized;
      }
    }
    await updateDoc(docRef, { ...payload, usaStock: deleteField() });
  } catch (error) {
    console.error('Error updating inventory item:', error);
    throw error;
  }
}

// Delete an inventory item and its Storage assets (images, barcode, media index, etc.)
export async function deleteInventoryItem(id: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const item = toInventoryItem(docSnap);
      await cleanupInventoryItemAssets(item);
      if (item.sku) {
        await deleteInventoryMediaForSku(item.sku);
      }
    }
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
