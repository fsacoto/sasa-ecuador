import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import { Consignment } from '../types';

const CONSIGNMENTS_COLLECTION = 'consignments';

// Helper to convert Firestore data to Consignment
const toConsignment = (doc: any): Consignment => {
  const data = doc.data();
  
  // Safely convert dates
  let dateCreated: Date;
  let createdAt: Date;
  
  try {
    dateCreated = data.dateCreated?.toDate ? data.dateCreated.toDate() : 
                  (data.dateCreated instanceof Date ? data.dateCreated : 
                  (data.dateCreated ? new Date(data.dateCreated) : new Date()));
  } catch (e) {
    dateCreated = new Date();
  }
  
  try {
    createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : 
                (data.createdAt instanceof Date ? data.createdAt : 
                (data.createdAt ? new Date(data.createdAt) : new Date()));
  } catch (e) {
    createdAt = new Date();
  }
  
  return {
    id: doc.id,
    ...data,
    dateCreated,
    createdAt
  };
};

// Get all consignments
export async function getAllConsignments(): Promise<Consignment[]> {
  try {
    // Try to query with orderBy, but fallback to simple query if index doesn't exist
    let querySnapshot;
    try {
      const q = query(collection(db, CONSIGNMENTS_COLLECTION), orderBy('dateCreated', 'desc'));
      querySnapshot = await getDocs(q);
    } catch (orderByError: any) {
      // If orderBy fails (likely missing index or permissions), try without ordering
      if (orderByError?.code === 'failed-precondition') {
        // Missing index - fetch without ordering
        console.warn('OrderBy failed (missing index), fetching without order');
        querySnapshot = await getDocs(collection(db, CONSIGNMENTS_COLLECTION));
      } else if (orderByError?.code === 'permission-denied') {
        // Permission error - rethrow with more context
        console.error('Permission denied when querying consignments:', orderByError);
        throw new Error(`Permission denied: ${orderByError.message}. Please ensure Firestore rules are deployed and you are authenticated.`);
      } else {
        // Other error - try without ordering as fallback
        console.warn('OrderBy failed, fetching without order:', orderByError);
        querySnapshot = await getDocs(collection(db, CONSIGNMENTS_COLLECTION));
      }
    }
    
    const consignments = querySnapshot.docs.map(toConsignment);
    
    // Sort in memory if we couldn't use orderBy
    consignments.sort((a, b) => {
      const aTime = a.dateCreated.getTime();
      const bTime = b.dateCreated.getTime();
      return bTime - aTime; // Descending order
    });
    
    return consignments;
  } catch (error: any) {
    console.error('Error fetching consignments:', error);
    // Re-throw with more context if it's a permission error
    if (error?.code === 'permission-denied') {
      throw new Error(`Permission denied accessing consignments collection. Please ensure:\n1. You are logged in\n2. Firestore security rules for 'consignments' collection are deployed\n3. The rules allow read access for authenticated users`);
    }
    throw error;
  }
}

// Get a single consignment
export async function getConsignment(consignmentId: string): Promise<Consignment | null> {
  try {
    const docRef = doc(db, CONSIGNMENTS_COLLECTION, consignmentId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return toConsignment(docSnap);
    }
    return null;
  } catch (error) {
    console.error('Error fetching consignment:', error);
    throw error;
  }
}

// Generate next sequential consignment ID
export async function getNextConsignmentId(): Promise<string> {
  try {
    const q = query(collection(db, CONSIGNMENTS_COLLECTION));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      // First consignment
      return 'CSG-00001';
    }
    
    // Get the last consignment ID
    let lastNumber = 0;
    snapshot.docs.forEach(doc => {
      const consignmentId = doc.data().consignmentId;
      if (consignmentId && consignmentId.startsWith('CSG-')) {
        const numberPart = parseInt(consignmentId.replace('CSG-', ''));
        if (!isNaN(numberPart) && numberPart > lastNumber) {
          lastNumber = numberPart;
        }
      }
    });
    
    // Generate next number
    const nextNumber = lastNumber + 1;
    return `CSG-${String(nextNumber).padStart(5, '0')}`;
  } catch (error) {
    console.error('Error generating consignment ID:', error);
    // Fallback to timestamp if error
    return `CSG-${Date.now().toString().slice(-5)}`;
  }
}

// Create a new consignment
export async function createConsignment(consignment: Omit<Consignment, 'id' | 'createdAt' | 'consignmentId'>): Promise<Consignment> {
  try {
    const docRef = doc(collection(db, CONSIGNMENTS_COLLECTION));
    
    // Generate consignment ID if not provided
    const consignmentId = await getNextConsignmentId();
    
    const newConsignment: Consignment = {
      ...consignment,
      consignmentId,
      createdAt: new Date(),
    };

    await setDoc(docRef, newConsignment);

    return {
      id: docRef.id,
      ...newConsignment,
    };
  } catch (error) {
    console.error('Error creating consignment:', error);
    throw error;
  }
}

// Update a consignment
export async function updateConsignment(consignmentId: string, updates: Partial<Consignment>): Promise<void> {
  try {
    const docRef = doc(db, CONSIGNMENTS_COLLECTION, consignmentId);
    
    // Filter out undefined values
    const cleanUpdates: Partial<Consignment> = { ...updates };
    Object.keys(cleanUpdates).forEach(key => {
      if (cleanUpdates[key as keyof Consignment] === undefined) {
        delete cleanUpdates[key as keyof Consignment];
      }
    });

    await setDoc(docRef, cleanUpdates, { merge: true });
  } catch (error) {
    console.error('Error updating consignment:', error);
    throw error;
  }
}

// Delete a consignment
export async function deleteConsignment(consignmentId: string): Promise<void> {
  try {
    const docRef = doc(db, CONSIGNMENTS_COLLECTION, consignmentId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting consignment:', error);
    throw error;
  }
}

