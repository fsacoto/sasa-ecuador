import { FirebaseError } from 'firebase/app';
import { ref, listAll, deleteObject } from 'firebase/storage';
import { storage } from '../utils/firebase';
import {
  deleteFile,
  extractStoragePath,
  isFirebaseStorageURL,
} from './storageService';
import type { CMSContent, InventoryItem, PurchaseOrder } from '../types';

function isObjectNotFound(error: unknown): boolean {
  return error instanceof FirebaseError && error.code === 'storage/object-not-found';
}

/** Delete a Storage object by path; missing files are ignored. */
export async function deleteStoragePathBestEffort(path: string): Promise<void> {
  if (!path.trim()) return;
  try {
    await deleteFile(path);
  } catch (error) {
    if (isObjectNotFound(error)) return;
    console.warn('[Firebase Storage] Could not delete path:', path, error);
  }
}

/** Delete Storage objects referenced by Firebase download URLs; missing files are ignored. */
export async function deleteStorageUrlsBestEffort(
  urls: (string | undefined | null)[]
): Promise<void> {
  const paths = new Set<string>();
  for (const url of urls) {
    const trimmed = (url || '').trim();
    if (!trimmed || !isFirebaseStorageURL(trimmed)) continue;
    const path = extractStoragePath(trimmed);
    if (path) paths.add(path);
  }
  await Promise.allSettled([...paths].map((path) => deleteStoragePathBestEffort(path)));
}

/** Recursively delete all objects under a Storage folder prefix. */
export async function deleteStorageFolderBestEffort(folderPath: string): Promise<void> {
  const normalized = folderPath.replace(/^\/+|\/+$/g, '');
  if (!normalized) return;

  try {
    const dirRef = ref(storage, normalized);
    const listing = await listAll(dirRef);
    await Promise.allSettled([
      ...listing.items.map((item) =>
        deleteObject(item).catch((error) => {
          if (!isObjectNotFound(error)) {
            console.warn('[Firebase Storage] Could not delete file:', item.fullPath, error);
          }
        })
      ),
      ...listing.prefixes.map((prefix) => deleteStorageFolderBestEffort(prefix.fullPath)),
    ]);
  } catch (error) {
    if (isObjectNotFound(error)) return;
    console.warn('[Firebase Storage] Could not list/delete folder:', normalized, error);
  }
}

function collectIssueMediaUrls(
  issues: { mediaUrls?: string[] }[] | undefined
): string[] {
  if (!issues?.length) return [];
  return issues.flatMap((issue) => issue.mediaUrls ?? []);
}

export function collectPurchaseOrderStorageUrls(order: PurchaseOrder): string[] {
  const urls: string[] = [
    ...(order.images ?? []),
    ...(order.verificationMedia ?? []),
  ];
  // Barcodes are keyed by SKU and shared across PO/inventory lines — do not delete here.
  return urls;
}

export async function cleanupPurchaseOrderAssets(order: PurchaseOrder): Promise<void> {
  await Promise.all([
    deleteStorageUrlsBestEffort(collectPurchaseOrderStorageUrls(order)),
    deleteStorageFolderBestEffort(`verification/${order.id}`),
  ]);
}

export function collectInventoryItemStorageUrls(item: InventoryItem): string[] {
  return [
    ...(item.images ?? []),
    ...(item.barcode ? [item.barcode] : []),
    ...collectIssueMediaUrls(item.verificationIssues),
    ...collectIssueMediaUrls(item.consignmentReturnIssues),
  ];
}

export async function cleanupInventoryItemAssets(item: InventoryItem): Promise<void> {
  await deleteStorageUrlsBestEffort(collectInventoryItemStorageUrls(item));
}

export function collectCMSContentStorageUrls(content: CMSContent): string[] {
  return [...(content.images ?? []), ...(content.videos ?? [])];
}

export async function cleanupCMSContentAssets(content: CMSContent): Promise<void> {
  await deleteStorageUrlsBestEffort(collectCMSContentStorageUrls(content));
}

export async function cleanupConsignmentAssets(consignmentFirestoreId: string): Promise<void> {
  await deleteStorageFolderBestEffort(`consignment-returns/${consignmentFirestoreId}`);
}
