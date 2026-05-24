import { collection, doc, updateDoc, deleteDoc, getDocs, query, where, orderBy, limit, QueryDocumentSnapshot, Timestamp, setDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { InventoryMedia } from '../types';
import { deleteFile, extractStoragePath, isFirebaseStorageURL } from './storageService';

const COLLECTION_NAME = 'inventoryMedia';

// Helper to convert Firestore data to InventoryMedia
const toInventoryMedia = (doc: QueryDocumentSnapshot): InventoryMedia => {
  const data = doc.data();
  return {
    id: doc.id,
    sku: data.sku || '',
    itemId: data.itemId || undefined,
    itemName: data.itemName || undefined,
    images: data.images || [],
    createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
    updatedAt: (data.updatedAt as Timestamp)?.toDate() || new Date(),
  };
};

// Get media for a specific SKU
export async function getMediaBySKU(sku: string): Promise<InventoryMedia | null> {
  try {
    const q = query(collection(db, COLLECTION_NAME), where('sku', '==', sku), limit(1));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return toInventoryMedia(querySnapshot.docs[0]);
    }
    return null;
  } catch (error) {
    console.error('Error fetching media by SKU:', error);
    throw error;
  }
}

// Get media for a specific item ID
export async function getMediaByItemId(itemId: string): Promise<InventoryMedia | null> {
  try {
    if (!itemId) {
      return null;
    }
    const q = query(collection(db, COLLECTION_NAME), where('itemId', '==', itemId), limit(1));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return toInventoryMedia(querySnapshot.docs[0]);
    }
    return null;
  } catch (error) {
    console.error('Error fetching media by item ID:', error);
    throw error;
  }
}

// Get all media (for orphaned media detection)
export async function getAllMedia(): Promise<InventoryMedia[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy('sku'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(toInventoryMedia);
  } catch (error) {
    console.error('Error fetching all media:', error);
    throw error;
  }
}

// Create or update media for an inventory item
export async function upsertInventoryMedia(params: {
  sku: string;
  itemId?: string;
  itemName?: string;
  images: string[];
}): Promise<string> {
  try {
    const { sku, itemId, itemName, images } = params;
    
    if (!sku) {
      throw new Error('SKU is required');
    }
    
    // Check if media already exists for this SKU
    const existingMedia = await getMediaBySKU(sku);
    
    const updateData: any = {
      sku,
      images,
      updatedAt: Timestamp.now(),
    };
    
    // Only include itemId if it's provided (can be null to unlink)
    if (itemId !== undefined) {
      updateData.itemId = itemId || null;
    }
    
    // Only include itemName if it's provided
    if (itemName !== undefined) {
      updateData.itemName = itemName || null;
    }
    
    if (existingMedia) {
      // Update existing media
      const docRef = doc(db, COLLECTION_NAME, existingMedia.id);
      await updateDoc(docRef, updateData);
      return existingMedia.id;
    } else {
      // Create new media
      const docRef = doc(collection(db, COLLECTION_NAME));
      await setDoc(docRef, {
        ...updateData,
        createdAt: Timestamp.now(),
      });
      return docRef.id;
    }
  } catch (error) {
    console.error('Error upserting inventory media:', error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    throw error;
  }
}

// Update media when item is deleted (preserve media but remove itemId)
export async function markMediaAsOrphaned(sku: string): Promise<void> {
  try {
    const existingMedia = await getMediaBySKU(sku);
    if (existingMedia) {
      const docRef = doc(db, COLLECTION_NAME, existingMedia.id);
      await updateDoc(docRef, {
        itemId: null,
        updatedAt: Timestamp.now(),
      });
    }
  } catch (error) {
    console.error('Error marking media as orphaned:', error);
    throw error;
  }
}

// Delete media (if needed)
export async function deleteInventoryMedia(id: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting inventory media:', error);
    throw error;
  }
}

// Delete a media file from Firebase Storage (admin only)
// This function deletes the actual file from storage, not just the reference
export async function deleteMediaFile(imageUrl: string): Promise<void> {
  try {
    // Only delete if it's a Firebase Storage URL
    if (!isFirebaseStorageURL(imageUrl)) {
      console.warn('Not a Firebase Storage URL, skipping deletion:', imageUrl);
      return;
    }

    // Extract the storage path from the URL
    const storagePath = extractStoragePath(imageUrl);
    if (!storagePath) {
      console.error('Could not extract storage path from URL:', imageUrl);
      throw new Error('Invalid storage URL');
    }

    // Delete the file from storage
    await deleteFile(storagePath);
  } catch (error) {
    console.error('Error deleting media file from storage:', error);
    throw error;
  }
}

