import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, query, where, orderBy, QueryDocumentSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { CMSContent, ContentStatus } from '../types';

const COLLECTION_NAME = 'cmsContent';

// Helper to convert Firestore data to CMSContent
const toCMSContent = (doc: QueryDocumentSnapshot): CMSContent => {
  const data = doc.data();
  const metadataData = data.metadata || {};
  const publishedAtTimestamp = metadataData.publishedAt as Timestamp | undefined;
  const archivedAtTimestamp = metadataData.archivedAt as Timestamp | undefined;
  
  // Build metadata object explicitly, only including defined values
  const metadata: CMSContent['metadata'] = {
    createdAt: (metadataData.createdAt as Timestamp)?.toDate() || new Date(),
    updatedAt: (metadataData.updatedAt as Timestamp)?.toDate() || new Date(),
  };
  
  // Only include publishedAt if it exists and is valid
  if (publishedAtTimestamp) {
    metadata.publishedAt = publishedAtTimestamp.toDate();
  }
  
  // Only include archivedAt if it exists and is valid
  if (archivedAtTimestamp) {
    metadata.archivedAt = archivedAtTimestamp.toDate();
  }
  
  // Include optional fields only if they exist and are defined
  if (metadataData.reviewerId) {
    metadata.reviewerId = metadataData.reviewerId as string;
  }
  if (metadataData.reviewerNotes) {
    metadata.reviewerNotes = metadataData.reviewerNotes as string;
  }
  if (metadataData.resubmissionCount !== undefined) {
    metadata.resubmissionCount = metadataData.resubmissionCount as number;
  }
  if (metadataData.lastResubmittedAt) {
    metadata.lastResubmittedAt = (metadataData.lastResubmittedAt as Timestamp).toDate();
  }
  
  return {
    id: doc.id,
    ...(data as Omit<CMSContent, 'id'>),
    statusHistory: data.statusHistory?.map((h: Record<string, unknown>) => ({
      ...h,
      timestamp: (h.timestamp as Timestamp)?.toDate() || new Date()
    })) || [],
    metadata
  };
};

// Helper to remove undefined values from an object (Firestore doesn't accept undefined)
const removeUndefined = <T extends Record<string, unknown>>(obj: T): Partial<T> => {
  const cleaned: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      cleaned[key] = obj[key];
    }
  }
  return cleaned;
};

// Helper to convert CMSContent to Firestore data
const toFirestore = (content: Omit<CMSContent, 'id' | 'metadata'> | Partial<CMSContent>) => {
  return removeUndefined(content as Record<string, unknown>);
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
    const { id: _, metadata: _metadata, ...updateData } = updates;
    
    // Remove undefined values (Firestore doesn't accept undefined)
    const cleanedUpdateData = removeUndefined(updateData as Record<string, unknown>);
    
    // Ensure metadata.updatedAt is always updated
    await updateDoc(docRef, {
      ...cleanedUpdateData,
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
      const statusHistoryEntry: {
        status: ContentStatus;
        timestamp: Date;
        userId: string;
        notes?: string;
      } = {
        status,
        timestamp: new Date(),
        userId,
      };
      // Only include notes if it's defined
      if (notes !== undefined) {
        statusHistoryEntry.notes = notes;
      }
      
      // If status is rejected and content is already rejected, don't duplicate the rejected entry
      // Only add to history if it's a new rejection (not already rejected)
      let statusHistory = [...currentData.statusHistory];
      if (status === 'rejected' && currentData.status === 'rejected') {
        // Don't add duplicate rejected entry, just update the last one's notes if provided
        const lastRejectedIndex = statusHistory.findLastIndex(h => h.status === 'rejected');
        if (lastRejectedIndex !== -1 && notes) {
          statusHistory[lastRejectedIndex] = {
            ...statusHistory[lastRejectedIndex],
            notes: notes,
            timestamp: new Date(),
            userId,
          };
        }
      } else {
        statusHistory = [...statusHistory, statusHistoryEntry];
      }
      
      // Build metadata object, only including defined values
      const metadata: {
        createdAt: Date;
        updatedAt: Date;
        publishedAt?: Date;
        archivedAt?: Date;
        reviewerId?: string;
        reviewerNotes?: string;
        resubmissionCount?: number;
        lastResubmittedAt?: Date;
      } = {
        createdAt: currentData.metadata.createdAt,
        updatedAt: new Date(),
      };
      
      // Only include publishedAt if it exists or if status is published
      if (currentData.metadata.publishedAt) {
        metadata.publishedAt = currentData.metadata.publishedAt;
      }
      if (status === 'published') {
        metadata.publishedAt = new Date();
      }
      
      // Only include archivedAt if it exists or if status is archived
      if (currentData.metadata.archivedAt) {
        metadata.archivedAt = currentData.metadata.archivedAt;
      }
      if (status === 'archived') {
        metadata.archivedAt = new Date();
      }
      
      // Include optional fields if they exist
      if (currentData.metadata.reviewerId) {
        metadata.reviewerId = currentData.metadata.reviewerId;
      }
      if (currentData.metadata.reviewerNotes) {
        metadata.reviewerNotes = currentData.metadata.reviewerNotes;
      }
      
      // Preserve resubmission tracking
      if (currentData.metadata.resubmissionCount !== undefined) {
        metadata.resubmissionCount = currentData.metadata.resubmissionCount;
      }
      if (currentData.metadata.lastResubmittedAt) {
        metadata.lastResubmittedAt = currentData.metadata.lastResubmittedAt;
      }
      
      // Remove any undefined values from metadata before updating
      const cleanedMetadata = removeUndefined(metadata as Record<string, unknown>);
      
      await updateDoc(docRef, {
        status,
        statusHistory,
        metadata: cleanedMetadata
      });
    }
  } catch (error) {
    console.error('Error updating CMS content status:', error);
    throw error;
  }
}

// Resubmit rejected content
export async function resubmitRejectedContent(
  id: string,
  userId: string,
  changesNotes: string
): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const currentData = toCMSContent(docSnap);
      
      // Increment resubmission count
      const resubmissionCount = (currentData.metadata.resubmissionCount || 0) + 1;
      
      // Add resubmission entry to history and change status to 'submitted'
      const statusHistory = [...currentData.statusHistory, {
        status: 'resubmitted' as const,
        timestamp: new Date(),
        userId,
        notes: changesNotes,
      }];
      
      // Build metadata with resubmission tracking
      const metadata: {
        createdAt: Date;
        updatedAt: Date;
        publishedAt?: Date;
        archivedAt?: Date;
        reviewerId?: string;
        reviewerNotes?: string;
        resubmissionCount?: number;
        lastResubmittedAt?: Date;
      } = {
        createdAt: currentData.metadata.createdAt,
        updatedAt: new Date(),
        resubmissionCount,
        lastResubmittedAt: new Date(),
      };
      
      // Preserve existing optional fields
      if (currentData.metadata.publishedAt) {
        metadata.publishedAt = currentData.metadata.publishedAt;
      }
      if (currentData.metadata.archivedAt) {
        metadata.archivedAt = currentData.metadata.archivedAt;
      }
      if (currentData.metadata.reviewerId) {
        metadata.reviewerId = currentData.metadata.reviewerId;
      }
      if (currentData.metadata.reviewerNotes) {
        metadata.reviewerNotes = currentData.metadata.reviewerNotes;
      }
      
      // Status changes to 'submitted' when resubmitting
      await updateDoc(docRef, {
        status: 'submitted',
        statusHistory,
        metadata
      });
    }
  } catch (error) {
    console.error('Error resubmitting rejected content:', error);
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

