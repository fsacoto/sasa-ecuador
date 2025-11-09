import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, query, where, orderBy, limit, QueryDocumentSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { InventoryItem } from '../types';

const COLLECTION_NAME = 'inventory';

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

