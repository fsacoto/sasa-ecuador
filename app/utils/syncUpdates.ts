// Smart update functions to keep Purchase Orders and Inventory in sync

import { PurchaseOrder, InventoryItem, VerificationIssueRef } from '../types';
import { findInventoryForPurchaseOrder, findReuseBarcodeFromPurchaseOrders } from './barcodePrint';

/** Problem units flagged on consignment returns (inventory badge + detail). */
export function getConsignmentReturnProblemQty(item: InventoryItem): number {
  return (item.consignmentReturnIssues ?? []).reduce((s, r) => s + r.quantityProblem, 0);
}

/** Treat as verified regardless of Firestore / legacy string casing. */
export function isVerifiedPurchaseOrder(order: Pick<PurchaseOrder, 'status'>): boolean {
  return String(order.status ?? '').trim().toLowerCase() === 'verified';
}

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
    if (!order || !isVerifiedPurchaseOrder(order)) continue;
    const qp = Number(order.quantityProblem);
    if (!Number.isFinite(qp) || qp <= 0) continue;
    const row: VerificationIssueRef = {
      purchaseOrderId: poId,
      quantityProblem: qp,
      comment: order.verificationComment?.trim() || undefined,
    };
    const vm = order.verificationMedia?.filter(Boolean);
    if (vm && vm.length > 0) {
      row.mediaUrls = vm;
    }
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

/**
 * Ensure each PO line has a barcode URL for labels: reuse inventory when the SKU
 * already exists; otherwise upload a new image. Runs on create/update (any status),
 * not only after inventory sync.
 */
export async function attachBarcodeToPurchaseOrderIfNeeded(
  order: PurchaseOrder,
  updatePurchaseOrder: (id: string, item: Partial<PurchaseOrder>) => Promise<void>,
  inventory: InventoryItem[],
  options?: { forceRegenerate?: boolean },
  /** Other PO lines (rest of app + same import batch) to reuse the same barcode URL when internal SKU matches. */
  purchaseOrdersForSkuReuse?: PurchaseOrder[]
): Promise<PurchaseOrder> {
  if (!String(order.sku ?? '').trim()) return order;
  const existingBc = (order.barcode || '').trim();
  if (existingBc && !options?.forceRegenerate) return order;

  const invMatch = findInventoryForPurchaseOrder(order, inventory);
  const invBarcode = (invMatch?.barcode || '').trim();

  if (options?.forceRegenerate) {
    if (invBarcode) {
      await updatePurchaseOrder(order.id, { barcode: invBarcode });
      return { ...order, barcode: invBarcode };
    }
  } else if (existingBc) {
    return order;
  }

  if (invBarcode) {
    await updatePurchaseOrder(order.id, { barcode: invBarcode });
    return { ...order, barcode: invBarcode };
  }

  const siblingBarcode =
    purchaseOrdersForSkuReuse && purchaseOrdersForSkuReuse.length > 0
      ? findReuseBarcodeFromPurchaseOrders(order, purchaseOrdersForSkuReuse)
      : undefined;
  if (siblingBarcode) {
    await updatePurchaseOrder(order.id, { barcode: siblingBarcode });
    return { ...order, barcode: siblingBarcode };
  }

  const url = await ensurePurchaseOrderBarcodeValue(order.sku);
  if (!url) return order;
  await updatePurchaseOrder(order.id, { barcode: url });
  return { ...order, barcode: url };
}

/**
 * Barcode value for a PO line: prefer a short Storage URL for Firestore; if upload fails,
 * fall back to an inline PNG data URL (same as inventario) so la etiqueta funcione sin Storage.
 */
export async function ensurePurchaseOrderBarcodeValue(sku: string): Promise<string | null> {
  const uploaded = await ensurePurchaseOrderBarcodeUrl(sku);
  if (uploaded) return uploaded;
  try {
    const { generateBarcodeFromSKU, isValidBarcodeInput } = await import('./barcodeGenerator');
    if (isValidBarcodeInput(sku) && typeof document !== 'undefined') {
      const dataUrl = generateBarcodeFromSKU(sku);
      if ((dataUrl || '').trim().length > 0) return dataUrl;
    }
  } catch (e) {
    console.warn(`Inline barcode failed for SKU ${sku}:`, e);
  }
  return null;
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
): Promise<string | null> {
  const barcodeUrl = await ensurePurchaseOrderBarcodeValue(sku);
  if (!barcodeUrl) return null;
  try {
    await updateInventoryItem(itemId, { barcode: barcodeUrl });
    return barcodeUrl;
  } catch (error) {
    console.error(`Error saving barcode for SKU ${sku}:`, error);
    return null;
  }
}

export interface BarcodeGenerationInfo {
  sku: string;
  itemId: string;
}

/** Prior PO row used only to compute inventory stock delta (avoids double-count / pre-linked PO skips). */
export async function syncPurchaseOrderToInventory(
  updatedOrder: PurchaseOrder,
  inventory: InventoryItem[],
  updateInventoryItem: (id: string, item: Partial<InventoryItem>) => Promise<void>,
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'createdAt'>) => Promise<string>,
  deleteInventoryItem: (id: string) => Promise<void>,
  purchaseOrders: PurchaseOrder[],
  previousSku?: string,
  generateBarcodeImmediately: boolean = true,
  stockBaselineOrder?: PurchaseOrder,
  updatePurchaseOrder?: (id: string, item: Partial<PurchaseOrder>) => Promise<void>
): Promise<BarcodeGenerationInfo[]> {
  const barcodesToGenerate: BarcodeGenerationInfo[] = [];
  const poSnapshot = mergePurchaseOrderSnapshot(purchaseOrders, updatedOrder);

  const baseline =
    stockBaselineOrder ?? purchaseOrders.find((o) => o.id === updatedOrder.id);
  const baselineWasVerified = baseline != null && isVerifiedPurchaseOrder(baseline);
  const oldVerifiedPhysical = baselineWasVerified ? verifiedPhysicalStock(baseline) : 0;

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

  // ACTION: If order is NOT verified, unlink and reduce stock (item stays in inventory, may be 0).
  if (!isVerifiedPurchaseOrder(updatedOrder)) {
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
      
      updates.ecuadorStock = Math.max(0, (inventoryItem.ecuadorStock || 0) - stockQuantity);

      // Keep the row in inventory even at 0 units (never delete for running out of stock).
      await updateInventoryItem(inventoryItem.id, updates);
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
    const invCat = inventoryItem.category ?? '';
    const ordCat = updatedOrder.category ?? '';
    if (invCat.includes('⚠️ NEEDS REVIEW') && !ordCat.includes('⚠️ NEEDS REVIEW')) {
      updates.category = ordCat || '';
    }

    // Link this purchase order if not already linked
    const linkedOrders = getLinkedPurchaseOrderIds(inventoryItem);
    if (!linkedOrders.includes(updatedOrder.id)) {
      updates.linkedPurchaseOrders = [...linkedOrders, updatedOrder.id];
    }

    const newVerifiedPhysical = verifiedPhysicalStock(updatedOrder);
    const stockDelta = newVerifiedPhysical - oldVerifiedPhysical;
    if (stockDelta !== 0) {
      updates.ecuadorStock = Math.max(0, (inventoryItem.ecuadorStock || 0) + stockDelta);
    }

    const projectedLinked = updates.linkedPurchaseOrders ?? linkedOrders;
    updates.verificationIssues = reconcileVerificationIssuesForItem(
      { linkedPurchaseOrders: projectedLinked },
      poSnapshot
    );

    const poBc = (updatedOrder.barcode || '').trim();
    if (poBc && (!inventoryItem.barcode || inventoryItem.barcode !== poBc)) {
      updates.barcode = poBc;
    } else if (!inventoryItem.barcode && updatedOrder.sku && !poBc) {
      if (isVerifiedPurchaseOrder(updatedOrder) && generateBarcodeImmediately) {
        try {
          const generatedUrl = await generateBarcodeForInventoryItem(
            updatedOrder.sku,
            updateInventoryItem,
            inventoryItem.id
          );
          if (generatedUrl && updatePurchaseOrder) {
            await updatePurchaseOrder(updatedOrder.id, { barcode: generatedUrl });
          }
          if (!generatedUrl) {
            barcodesToGenerate.push({ sku: updatedOrder.sku, itemId: inventoryItem.id });
          }
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
  } else if (updatedOrder.sku) {
    // Create new inventory item ONLY when order is verified (good + problem units on hand)
    const stockQuantity = Math.max(0, verifiedPhysicalStock(updatedOrder) - oldVerifiedPhysical);

    if (stockQuantity > 0) {
      const desc =
        String(updatedOrder.description ?? '').trim() || String(updatedOrder.sku).trim() || 'Product';
      const newItem: Omit<InventoryItem, 'id' | 'createdAt'> = {
        name: desc,
        sku: updatedOrder.sku,
        supplierSKU: updatedOrder.supplierSKU,
        category: updatedOrder.category || '',
        line: updatedOrder.line || '',
        description: desc,
        images: updatedOrder.images || [],
        ecuadorStock: stockQuantity,
        consignmentStock: 0,
        linkedPurchaseOrders: [updatedOrder.id],
        verificationIssues: reconcileVerificationIssuesForItem(
          { linkedPurchaseOrders: [updatedOrder.id] },
          poSnapshot
        ),
        ...(updatedOrder.barcode ? { barcode: updatedOrder.barcode } : {}),
      };

      const newItemId = await addInventoryItem(newItem);

      if (updatedOrder.sku && !newItem.barcode) {
        if (isVerifiedPurchaseOrder(updatedOrder) && generateBarcodeImmediately) {
          try {
            const generatedUrl = await generateBarcodeForInventoryItem(
              updatedOrder.sku,
              updateInventoryItem,
              newItemId
            );
            if (generatedUrl && updatePurchaseOrder) {
              await updatePurchaseOrder(updatedOrder.id, { barcode: generatedUrl });
            }
            if (!generatedUrl) {
              barcodesToGenerate.push({ sku: updatedOrder.sku, itemId: newItemId });
            }
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

  const invBarcode = (updatedItem.barcode || '').trim();

  linkedOrders.forEach(order => {
    const updates: Partial<PurchaseOrder> = {};

    // Update SKU if changed
    if (order.sku !== updatedItem.sku) {
      updates.sku = updatedItem.sku;
    }

    const postSku = updates.sku ?? order.sku;

    // Update category/line if changed and not empty
    if (updatedItem.category && updatedItem.category !== '⚠️ NEEDS REVIEW' && order.category !== updatedItem.category) {
      updates.category = updatedItem.category;
    }
    if (updatedItem.line && order.line !== updatedItem.line) {
      updates.line = updatedItem.line;
    }

    if (invBarcode && postSku === updatedItem.sku && (order.barcode || '').trim() !== invBarcode) {
      updates.barcode = invBarcode;
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      updatePurchaseOrder(order.id, updates);
    }
  });
}

export async function cleanupInventoryAfterOrderDeletion(
  deletedOrderIds: string[],
  inventory: InventoryItem[],
  updateInventoryItem: (id: string, item: Partial<InventoryItem>) => Promise<void>,
  purchaseOrders: PurchaseOrder[]
): Promise<void> {
  const poSnapshot = purchaseOrders.filter((o) => !deletedOrderIds.includes(o.id));

  for (const item of inventory) {
    const linkedOrders = getLinkedPurchaseOrderIds(item);
    const remainingLinkedOrders = linkedOrders.filter(
      (orderId) => !deletedOrderIds.includes(orderId)
    );
    if (remainingLinkedOrders.length === linkedOrders.length) continue;

    let stockToRemove = 0;
    for (const orderId of deletedOrderIds) {
      if (!linkedOrders.includes(orderId)) continue;
      const order = purchaseOrders.find((o) => o.id === orderId);
      if (order && isVerifiedPurchaseOrder(order)) {
        stockToRemove += verifiedPhysicalStock(order);
      }
    }

    await updateInventoryItem(item.id, {
      linkedPurchaseOrders: remainingLinkedOrders,
      ecuadorStock: Math.max(0, (item.ecuadorStock || 0) - stockToRemove),
      verificationIssues: reconcileVerificationIssuesForItem(
        { linkedPurchaseOrders: remainingLinkedOrders },
        poSnapshot
      ),
    });
  }
}
