import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { CMSContent, ContentStatus } from '../types';

const COLLECTION_NAME = 'cmsContent';

// Helper to convert Firestore data to CMSContent
const toCMSContent = (doc: any): CMSContent => ({
  id: doc.id,
  ...doc.data(),
  statusHistory: doc.data().statusHistory?.map((h: any) => ({
    ...h,
    timestamp: h.timestamp?.toDate() || new Date()
  })) || [],
  metadata: {
    ...doc.data().metadata,
    createdAt: doc.data().metadata?.createdAt?.toDate() || new Date(),
    updatedAt: doc.data().metadata?.updatedAt?.toDate() || new Date(),
    publishedAt: doc.data().metadata?.publishedAt?.toDate(),
    archivedAt: doc.data().metadata?.archivedAt?.toDate()
  }
});

// Helper to convert CMSContent to Firestore data
const toFirestore = (content: Omit<CMSContent, 'id' | 'metadata'> | Partial<CMSContent>) => {
  const data: any = { ...content };
  return data;
};

// Get all CMS content
export async function getCMSContent(): Promise<CMSContent[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy('metadata.createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(toCMSContent);
  } catch (error) {
    console.error('Error fetching CMS content:', error);
    throw error;
  }
}

// Get a single CMS content item
export async function getCMSContentItem(id: string): Promise<CMSContent | null> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return toCMSContent(docSnap);
    }
    return null;
  } catch (error) {
    console.error('Error fetching CMS content item:', error);
    throw error;
  }
}

// Get CMS content by status
export async function getCMSContentByStatus(status: ContentStatus): Promise<CMSContent[]> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME), 
      where('status', '==', status),
      orderBy('metadata.createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(toCMSContent);
  } catch (error) {
    console.error('Error fetching CMS content by status:', error);
    throw error;
  }
}

// Get CMS content by linked product SKU
export async function getCMSContentBySKU(sku: string): Promise<CMSContent[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), where('linkedProductIds', 'array-contains', sku));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(toCMSContent);
  } catch (error) {
    console.error('Error fetching CMS content by SKU:', error);
    throw error;
  }
}

// Get CMS content by type
export async function getCMSContentByType(type: string): Promise<CMSContent[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), where('type', '==', type), orderBy('metadata.createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(toCMSContent);
  } catch (error) {
    console.error('Error fetching CMS content by type:', error);
    throw error;
  }
}

// Add a new CMS content item
export async function addCMSContent(content: Omit<CMSContent, 'id' | 'metadata'>): Promise<string> {
  try {
    const contentWithMetadata = {
      ...content,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    };
    const docRef = await addDoc(collection(db, COLLECTION_NAME), toFirestore(contentWithMetadata));
    return docRef.id;
  } catch (error) {
    console.error('Error adding CMS content:', error);
    throw error;
  }
}

// Update a CMS content item
export async function updateCMSContent(id: string, updates: Partial<CMSContent>): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const { id: _, metadata, ...updateData } = updates;
    
    // Ensure metadata.updatedAt is always updated
    await updateDoc(docRef, {
      ...toFirestore(updateData),
      'metadata.updatedAt': new Date()
    });
  } catch (error) {
    console.error('Error updating CMS content:', error);
    throw error;
  }
}

// Update CMS content status
export async function updateCMSContentStatus(
  id: string, 
  status: ContentStatus, 
  userId: string, 
  notes?: string
): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const currentData = toCMSContent(docSnap);
      const statusHistory = [...currentData.statusHistory, {
        status,
        timestamp: new Date(),
        userId,
        notes
      }];
      
      const metadata = {
        ...currentData.metadata,
        updatedAt: new Date(),
        ...(status === 'published' && { publishedAt: new Date() }),
        ...(status === 'archived' && { archivedAt: new Date() })
      };
      
      await updateDoc(docRef, {
        status,
        statusHistory,
        metadata
      });
    }
  } catch (error) {
    console.error('Error updating CMS content status:', error);
    throw error;
  }
}

// Delete a CMS content item
export async function deleteCMSContent(id: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting CMS content:', error);
    throw error;
  }
}

