// Smart update functions to keep Purchase Orders and Inventory in sync

import { PurchaseOrder, InventoryItem, VerificationIssueRef } from '../types';

/** Units physically on hand from a verified PO (good + problem); excludes not received. */
export function verifiedPhysicalStock(order: PurchaseOrder): number {
  if (order.quantityGood !== undefined || order.quantityProblem !== undefined) {
    return (order.quantityGood ?? 0) + (order.quantityProblem ?? 0);
  }
  return order.quantityReceived ?? order.quantity;
}

/**
 * PO list with the order being saved/verified merged in (handles React state lag).
 */
export function mergePurchaseOrderSnapshot(
  purchaseOrders: PurchaseOrder[],
  authoritative: PurchaseOrder
): PurchaseOrder[] {
  const idx = purchaseOrders.findIndex((o) => o.id === authoritative.id);
  if (idx === -1) {
    return [...purchaseOrders, authoritative];
  }
  return purchaseOrders.map((o) => (o.id === authoritative.id ? { ...o, ...authoritative } : o));
}

/** Normalize linked PO ids (Firestore or older data may use non-string shapes). */
export function getLinkedPurchaseOrderIds(item: Pick<InventoryItem, 'linkedPurchaseOrders'>): string[] {
  const raw = item.linkedPurchaseOrders;
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object' && 'id' in entry && typeof (entry as { id: unknown }).id === 'string') {
        return (entry as { id: string }).id;
      }
      return '';
    })
    .filter(Boolean);
}

/**
 * Build verificationIssues from linked POs that are Verified and have quantityProblem > 0.
 * Use this for Firestore writes and for UI (PO fields are the source of truth).
 */
export function reconcileVerificationIssuesForItem(
  item: Pick<InventoryItem, 'linkedPurchaseOrders'>,
  purchaseOrders: PurchaseOrder[]
): VerificationIssueRef[] {
  const linked = getLinkedPurchaseOrderIds(item);
  const out: VerificationIssueRef[] = [];
  for (const poId of linked) {
    const order = purchaseOrders.find((o) => o.id === poId);
    if (!order || String(order.status).trim().toLowerCase() !== 'verified') continue;
    const qp = Number(order.quantityProblem);
    if (!Number.isFinite(qp) || qp <= 0) continue;
    const row: VerificationIssueRef = {
      purchaseOrderId: poId,
      quantityProblem: qp,
      comment: order.verificationComment?.trim() || undefined,
    };
    if (order.quantityGood !== undefined && order.quantityGood !== null) {
      const qg = Number(order.quantityGood);
      if (Number.isFinite(qg)) {
        row.quantityGoodAtVerification = qg;
      }
    }
    out.push(row);
  }
  return out;
}

/** Ensure PO has a stored barcode image URL when SKU exists but barcode is missing (e.g. legacy rows). */
export async function attachBarcodeToPurchaseOrderIfNeeded(
  order: PurchaseOrder,
  updatePurchaseOrder: (id: string, item: Partial<PurchaseOrder>) => Promise<void>,
  options?: { forceRegenerate?: boolean }
): Promise<PurchaseOrder> {
  if (!order.sku) return order;
  if (order.barcode && !options?.forceRegenerate) return order;
  const url = await ensurePurchaseOrderBarcodeUrl(order.sku);
  if (!url) return order;
  await updatePurchaseOrder(order.id, { barcode: url });
  return { ...order, barcode: url };
}

export async function ensurePurchaseOrderBarcodeUrl(sku: string): Promise<string | null> {
  try {
    const {
      generateBarcodeAsFile,
      isValidBarcodeInput,
      barcodeStorageExtension,
    } = await import('./barcodeGenerator');
    const { uploadImage } = await import('../services/storageService');
    if (!isValidBarcodeInput(sku)) {
      console.warn(`Missing SKU for barcode generation: ${sku}`);
      return null;
    }
    const barcodeFile = await generateBarcodeAsFile(sku);
    const sanitizedSku = sku.replace(/[^a-zA-Z0-9-]/g, '_');
    const ext = barcodeStorageExtension(barcodeFile);
    const storagePath = `barcodes/${sanitizedSku}.${ext}`;
    return await uploadImage(barcodeFile, storagePath);
  } catch (error) {
    console.error(`Error uploading barcode for SKU ${sku}:`, error);
    return null;
  }
}

export async function generateBarcodeForInventoryItem(
  sku: string,
  updateInventoryItem: (id: string, item: Partial<InventoryItem>) => Promise<void>,
  itemId: string
): Promise<void> {
  const barcodeUrl = await ensurePurchaseOrderBarcodeUrl(sku);
  if (!barcodeUrl) return;
  try {
    await updateInventoryItem(itemId, { barcode: barcodeUrl });
  } catch (error) {
    console.error(`Error saving barcode for SKU ${sku}:`, error);
  }
}

export interface BarcodeGenerationInfo {
  sku: string;
  itemId: string;
}

export async function syncPurchaseOrderToInventory(
  updatedOrder: PurchaseOrder,
  inventory: InventoryItem[],
  updateInventoryItem: (id: string, item: Partial<InventoryItem>) => Promise<void>,
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'createdAt'>) => Promise<string>,
  deleteInventoryItem: (id: string) => Promise<void>,
  purchaseOrders: PurchaseOrder[],
  previousSku?: string,
  generateBarcodeImmediately: boolean = true
): Promise<BarcodeGenerationInfo[]> {
  const barcodesToGenerate: BarcodeGenerationInfo[] = [];
  const poSnapshot = mergePurchaseOrderSnapshot(purchaseOrders, updatedOrder);

  // If SKU changed, find inventory item by the old SKU or by linked purchase orders
  let inventoryItem = inventory.find(item => item.sku === updatedOrder.sku);
  
  // If not found by current SKU, try finding by previous SKU or by linked purchase orders
  if (!inventoryItem && previousSku) {
    inventoryItem = inventory.find(item => item.sku === previousSku);
  }
  
  // If still not found, try finding by linked purchase orders
  if (!inventoryItem) {
    inventoryItem = inventory.find((item) =>
      getLinkedPurchaseOrderIds(item).includes(updatedOrder.id)
    );
  }

  // ACTION: If order is NOT verified, remove it from inventory completely
  if (updatedOrder.status !== 'Verified') {
    if (inventoryItem) {
      // Remove this purchase order from linked orders
      const linkedOrders = getLinkedPurchaseOrderIds(inventoryItem);
      const updatedLinkedOrders = linkedOrders.filter(
        orderId => orderId !== updatedOrder.id
      );
      
      // Remove stock that was added by this order (good + problem when verification split exists)
      const stockQuantity = verifiedPhysicalStock(updatedOrder);
      const updates: Partial<InventoryItem> = {
        linkedPurchaseOrders: updatedLinkedOrders,
        verificationIssues: reconcileVerificationIssuesForItem(
          { linkedPurchaseOrders: updatedLinkedOrders },
          poSnapshot
        ),
      };
      
      if (updatedOrder.destinationStock === 'Ecuador') {
        updates.ecuadorStock = Math.max(0, (inventoryItem.ecuadorStock || 0) - stockQuantity);
      } else if (updatedOrder.destinationStock === 'USA') {
        updates.usaStock = Math.max(0, (inventoryItem.usaStock || 0) - stockQuantity);
      }
      
      // Check if item has other verified purchase orders
      const hasOtherVerifiedOrders = updatedLinkedOrders.some(orderId => {
        const otherOrder = purchaseOrders.find(o => o.id === orderId);
        return (
          otherOrder &&
          String(otherOrder.status).trim().toLowerCase() === 'verified'
        );
      });
      
      // If item was originally created from purchase orders (has linked orders)
      // AND no other verified orders remain, delete it completely
      if (linkedOrders.length > 0 && !hasOtherVerifiedOrders) {
        // Item was only created from purchase orders and none are verified anymore - DELETE IT
        await deleteInventoryItem(inventoryItem.id);
      } else {
        // Either:
        // 1. Item is standalone (no linked orders originally) - just remove stock/link
        // 2. Item has other verified orders - just remove this order's stock/link
        await updateInventoryItem(inventoryItem.id, updates);
      }
    }
    // If order is not verified, don't create or update inventory - EXIT
    return [];
  }

  // ORDER IS VERIFIED - Create or update inventory item
  if (inventoryItem) {
    // Update existing inventory item
    const updates: Partial<InventoryItem> = {};

    // Update SKU if changed
    if (updatedOrder.sku && inventoryItem.sku !== updatedOrder.sku) {
      updates.sku = updatedOrder.sku;
    }

    // Update category/line if changed
    if (updatedOrder.category && updatedOrder.category !== '⚠️ NEEDS REVIEW') {
      updates.category = updatedOrder.category;
    }
    if (updatedOrder.line) {
      updates.line = updatedOrder.line;
    }
    
    // Update description if provided
    if (updatedOrder.description && !inventoryItem.description) {
      updates.description = updatedOrder.description;
    }

    // Remove warning flag if order is now complete
    if (inventoryItem.category.includes('⚠️ NEEDS REVIEW') && !updatedOrder.category.includes('⚠️ NEEDS REVIEW')) {
      updates.category = updatedOrder.category || '';
    }

    // Link this purchase order if not already linked
    const linkedOrders = getLinkedPurchaseOrderIds(inventoryItem);
    if (!linkedOrders.includes(updatedOrder.id)) {
      updates.linkedPurchaseOrders = [...linkedOrders, updatedOrder.id];
    }

    // Update stock when order is verified
    // Check if this order was already processed (to avoid double-counting)
    const wasAlreadyLinked = linkedOrders.includes(updatedOrder.id);
    if (!wasAlreadyLinked) {
      const stockQuantity = verifiedPhysicalStock(updatedOrder);
      if (updatedOrder.destinationStock === 'Ecuador') {
        updates.ecuadorStock = (inventoryItem.ecuadorStock || 0) + stockQuantity;
      } else if (updatedOrder.destinationStock === 'USA') {
        updates.usaStock = (inventoryItem.usaStock || 0) + stockQuantity;
      }
    }

    const projectedLinked = updates.linkedPurchaseOrders ?? linkedOrders;
    updates.verificationIssues = reconcileVerificationIssuesForItem(
      { linkedPurchaseOrders: projectedLinked },
      poSnapshot
    );

    if (!inventoryItem.barcode && updatedOrder.sku) {
      if (updatedOrder.barcode) {
        updates.barcode = updatedOrder.barcode;
      } else if (
        String(updatedOrder.status).trim().toLowerCase() === 'verified' &&
        generateBarcodeImmediately
      ) {
        try {
          await generateBarcodeForInventoryItem(
            updatedOrder.sku,
            updateInventoryItem,
            inventoryItem.id
          );
        } catch (error) {
          console.error('Error generating barcode for existing item:', error);
          barcodesToGenerate.push({ sku: updatedOrder.sku, itemId: inventoryItem.id });
        }
      } else {
        barcodesToGenerate.push({ sku: updatedOrder.sku, itemId: inventoryItem.id });
      }
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await updateInventoryItem(inventoryItem.id, updates);
    }
  } else if (updatedOrder.sku && updatedOrder.description) {
    // Create new inventory item ONLY when order is verified (good + problem units on hand)
    const stockQuantity = verifiedPhysicalStock(updatedOrder);

    if (stockQuantity > 0) {
      const newItem: Omit<InventoryItem, 'id' | 'createdAt'> = {
        name: updatedOrder.description,
        sku: updatedOrder.sku,
        supplierSKU: updatedOrder.supplierSKU,
        category: updatedOrder.category || '',
        line: updatedOrder.line || '',
        description: updatedOrder.description,
        images: updatedOrder.images || [],
        ecuadorStock: updatedOrder.destinationStock === 'Ecuador' ? stockQuantity : 0,
        usaStock: updatedOrder.destinationStock === 'USA' ? stockQuantity : 0,
        linkedPurchaseOrders: [updatedOrder.id],
        verificationIssues: reconcileVerificationIssuesForItem(
          { linkedPurchaseOrders: [updatedOrder.id] },
          poSnapshot
        ),
        ...(updatedOrder.barcode ? { barcode: updatedOrder.barcode } : {}),
      };

      const newItemId = await addInventoryItem(newItem);

      if (updatedOrder.sku && !newItem.barcode) {
        if (
          String(updatedOrder.status).trim().toLowerCase() === 'verified' &&
          generateBarcodeImmediately
        ) {
          try {
            await generateBarcodeForInventoryItem(
              updatedOrder.sku,
              updateInventoryItem,
              newItemId
            );
          } catch (error) {
            console.error('Error generating barcode for new item:', error);
            barcodesToGenerate.push({ sku: updatedOrder.sku, itemId: newItemId });
          }
        } else {
          barcodesToGenerate.push({ sku: updatedOrder.sku, itemId: newItemId });
        }
      }
    }
  }
  
  return barcodesToGenerate;
}

export function syncInventoryToOrders(
  updatedItem: InventoryItem,
  purchaseOrders: PurchaseOrder[],
  updatePurchaseOrder: (id: string, order: Partial<PurchaseOrder>) => void
) {
  // Find all purchase orders linked to this inventory item
  const linkedPurchaseOrderIds = getLinkedPurchaseOrderIds(updatedItem);
  const linkedOrders = purchaseOrders.filter(order => 
    linkedPurchaseOrderIds.includes(order.id) || order.sku === updatedItem.sku
  );

  linkedOrders.forEach(order => {
    const updates: Partial<PurchaseOrder> = {};

    // Update SKU if changed
    if (order.sku !== updatedItem.sku) {
      updates.sku = updatedItem.sku;
    }

    // Update category/line if changed and not empty
    if (updatedItem.category && updatedItem.category !== '⚠️ NEEDS REVIEW' && order.category !== updatedItem.category) {
      updates.category = updatedItem.category;
    }
    if (updatedItem.line && order.line !== updatedItem.line) {
      updates.line = updatedItem.line;
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      updatePurchaseOrder(order.id, updates);
    }
  });
}

export function cleanupInventoryAfterOrderDeletion(
  deletedOrderIds: string[],
  inventory: InventoryItem[],
  deleteInventoryItem: (id: string) => void
) {
  // Find inventory items that are only linked to the deleted orders
  inventory.forEach(item => {
    const linkedOrders = getLinkedPurchaseOrderIds(item);
    const remainingLinkedOrders = linkedOrders.filter(
      orderId => !deletedOrderIds.includes(orderId)
    );
    
    // If no remaining linked orders, delete the inventory item
    if (remainingLinkedOrders.length === 0 && linkedOrders.length > 0) {
      console.log('Deleting orphaned inventory item:', item.sku, item.name);
      deleteInventoryItem(item.id);
    }
  });
}
