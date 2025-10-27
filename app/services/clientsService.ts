import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  where,
  orderBy 
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import { Client } from '../types';

const CLIENTS_COLLECTION = 'clients';

// Get all clients
export async function getAllClients(country?: 'Ecuador' | 'USA'): Promise<Client[]> {
  try {
    let q;
    if (country) {
      // Query with country filter only (index is building)
      q = query(
        collection(db, CLIENTS_COLLECTION),
        where('country', '==', country)
      );
    } else {
      q = query(
        collection(db, CLIENTS_COLLECTION),
        orderBy('name')
      );
    }

    const snapshot = await getDocs(q);
    const clients = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Client[];
    
    // Sort in-memory as a workaround while index builds
    return clients.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error fetching clients:', error);
    throw error;
  }
}

// Get a single client
export async function getClient(clientId: string): Promise<Client | null> {
  try {
    const docRef = doc(db, CLIENTS_COLLECTION, clientId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      } as Client;
    }
    return null;
  } catch (error) {
    console.error('Error fetching client:', error);
    throw error;
  }
}

// Create a new client
export async function createClient(client: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Promise<Client> {
  try {
    const docRef = doc(collection(db, CLIENTS_COLLECTION));
    const newClient: Omit<Client, 'id'> = {
      ...client,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await setDoc(docRef, newClient);

    return {
      id: docRef.id,
      ...newClient,
    };
  } catch (error) {
    console.error('Error creating client:', error);
    throw error;
  }
}

// Update a client
export async function updateClient(clientId: string, updates: Partial<Client>): Promise<void> {
  try {
    const docRef = doc(db, CLIENTS_COLLECTION, clientId);
    await setDoc(
      docRef,
      {
        ...updates,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error('Error updating client:', error);
    throw error;
  }
}

// Delete a client
export async function deleteClient(clientId: string): Promise<void> {
  try {
    const docRef = doc(db, CLIENTS_COLLECTION, clientId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting client:', error);
    throw error;
  }
}

