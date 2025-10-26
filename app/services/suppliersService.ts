import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, query, orderBy, QueryDocumentSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { Supplier } from '../types';

const COLLECTION_NAME = 'suppliers';

// Helper to convert Firestore data to Supplier
const toSupplier = (doc: QueryDocumentSnapshot): Supplier => {
  const data = doc.data();
  return {
    id: doc.id,
    ...(data as Omit<Supplier, 'id'>),
    createdAt: (data.createdAt as Timestamp)?.toDate() || new Date()
  };
};

// Helper to convert Supplier to Firestore data
const toFirestore = (supplier: Omit<Supplier, 'id' | 'createdAt'> | Partial<Supplier>) => {
  return supplier;
};

// Get all suppliers
export async function getSuppliers(): Promise<Supplier[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy('name'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(toSupplier);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    throw error;
  }
}

// Get a single supplier
export async function getSupplier(id: string): Promise<Supplier | null> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return toSupplier(docSnap);
    }
    return null;
  } catch (error) {
    console.error('Error fetching supplier:', error);
    throw error;
  }
}

// Add a new supplier
export async function addSupplier(supplier: Omit<Supplier, 'id' | 'createdAt'>): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), toFirestore(supplier));
    return docRef.id;
  } catch (error) {
    console.error('Error adding supplier:', error);
    throw error;
  }
}

// Update a supplier
export async function updateSupplier(id: string, updates: Partial<Supplier>): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    // Remove id from updates if present (it shouldn't be there)
    const { id: _, createdAt, ...updateData } = updates;
    await updateDoc(docRef, updateData);
  } catch (error) {
    console.error('Error updating supplier:', error);
    throw error;
  }
}

// Delete a supplier
export async function deleteSupplier(id: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting supplier:', error);
    throw error;
  }
}

// Search suppliers by name
export async function searchSuppliersByName(searchTerm: string): Promise<Supplier[]> {
  try {
    // Note: Firestore doesn't support full-text search natively
    // We'll need to get all and filter client-side, or implement a better search solution
    const q = query(collection(db, COLLECTION_NAME), orderBy('name'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs
      .map(toSupplier)
      .filter(supplier => 
        supplier.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
  } catch (error) {
    console.error('Error searching suppliers:', error);
    throw error;
  }
}

