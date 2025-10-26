import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, query, where, orderBy, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { AdditionalCost } from '../types';

const COLLECTION_NAME = 'additionalCosts';

// Helper to convert Firestore data to AdditionalCost
const toAdditionalCost = (doc: QueryDocumentSnapshot): AdditionalCost => {
  const data = doc.data();
  return {
    id: doc.id,
    invoiceNumber: data.invoiceNumber,
    type: data.type,
    amount: data.amount,
    description: data.description,
    date: data.date?.toDate() || new Date(),
    createdAt: data.createdAt?.toDate() || new Date()
  };
};

// Helper to convert AdditionalCost to Firestore data
const toFirestore = (cost: Omit<AdditionalCost, 'id' | 'createdAt'> | Partial<AdditionalCost>) => {
  return cost;
};

// Get all additional costs
export async function getAdditionalCosts(): Promise<AdditionalCost[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy('date', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(toAdditionalCost);
  } catch (error) {
    console.error('Error fetching additional costs:', error);
    throw error;
  }
}

// Get a single additional cost
export async function getAdditionalCost(id: string): Promise<AdditionalCost | null> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return toAdditionalCost(docSnap);
    }
    return null;
  } catch (error) {
    console.error('Error fetching additional cost:', error);
    throw error;
  }
}

// Get additional costs by invoice number
export async function getAdditionalCostsByInvoice(invoiceNumber: string): Promise<AdditionalCost[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), where('invoiceNumber', '==', invoiceNumber), orderBy('date'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(toAdditionalCost);
  } catch (error) {
    console.error('Error fetching additional costs by invoice:', error);
    throw error;
  }
}

// Add a new additional cost
export async function addAdditionalCost(cost: Omit<AdditionalCost, 'id' | 'createdAt'>): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), toFirestore(cost));
    return docRef.id;
  } catch (error) {
    console.error('Error adding additional cost:', error);
    throw error;
  }
}

// Update an additional cost
export async function updateAdditionalCost(id: string, updates: Partial<AdditionalCost>): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const { id: _, createdAt, ...updateData } = updates;
    await updateDoc(docRef, updateData);
  } catch (error) {
    console.error('Error updating additional cost:', error);
    throw error;
  }
}

// Delete an additional cost
export async function deleteAdditionalCost(id: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting additional cost:', error);
    throw error;
  }
}

