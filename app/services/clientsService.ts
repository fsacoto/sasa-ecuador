import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  writeBatch,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import { Client } from '../types';

const CLIENTS_COLLECTION = 'clients';
const INVOICES_COLLECTION = 'invoices';
const CONSIGNMENTS_COLLECTION = 'consignments';
const FIRESTORE_BATCH_LIMIT = 500;

/** Same address format used when creating notas de pedido and consignaciones. */
export function formatClientAddress(client: Pick<Client, 'address' | 'city' | 'country'>): string {
  const parts = [client.address, client.city, client.country].filter(
    (p) => typeof p === 'string' && p.trim() !== ''
  );
  return parts.join(', ');
}

/** Normalize client names for linking historical documents. */
export function normalizeClientName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isWalkInClientName(name: string | undefined): boolean {
  const n = normalizeClientName(name || '');
  return (
    !n ||
    n === 'walk-in customer' ||
    n === 'cliente de mostrador' ||
    n === 'walk-in' ||
    n === 'mostrador'
  );
}

function hasUsableClientId(clientId: unknown): clientId is string {
  return typeof clientId === 'string' && clientId.trim() !== '';
}

async function commitInBatches(
  refsAndData: Array<{ ref: ReturnType<typeof doc>; data: Record<string, string> }>
): Promise<void> {
  for (let i = 0; i < refsAndData.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = refsAndData.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach(({ ref, data }) => {
      batch.set(ref, data, { merge: true });
    });
    await batch.commit();
  }
}

type LinkedDocFields = {
  clientId?: string;
  clientName?: string;
  clientAddress?: string;
};

function buildSnapshotUpdate(
  clientId: string,
  client: Pick<Client, 'name' | 'address' | 'city' | 'country'>
): Record<string, string> {
  return {
    clientId,
    clientName: client.name,
    clientAddress: formatClientAddress(client),
  };
}

function docNeedsClientSync(
  data: LinkedDocFields,
  clientId: string,
  client: Pick<Client, 'name' | 'address' | 'city' | 'country'>
): boolean {
  const expectedAddress = formatClientAddress(client);
  return (
    data.clientId !== clientId ||
    data.clientName !== client.name ||
    (data.clientAddress || '') !== expectedAddress
  );
}

/**
 * Propagates current client name/address to notas de pedido and consignaciones.
 * Updates by clientId, and links older docs that still only match by clientName.
 */
export async function syncClientDataToLinkedDocuments(
  clientId: string,
  client: Pick<Client, 'name' | 'address' | 'city' | 'country'>,
  options?: { previousName?: string }
): Promise<{ updated: number }> {
  if (!clientId) return { updated: 0 };

  const snapshotUpdate = buildSnapshotUpdate(clientId, client);
  const uniqueExactNames = [
    ...new Set(
      [client.name, options?.previousName]
        .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
        .map((n) => n.trim())
    ),
  ];

  const querySnaps = await Promise.all([
    getDocs(query(collection(db, INVOICES_COLLECTION), where('clientId', '==', clientId))),
    getDocs(query(collection(db, CONSIGNMENTS_COLLECTION), where('clientId', '==', clientId))),
    ...uniqueExactNames.flatMap((name) => [
      getDocs(query(collection(db, INVOICES_COLLECTION), where('clientName', '==', name))),
      getDocs(query(collection(db, CONSIGNMENTS_COLLECTION), where('clientName', '==', name))),
    ]),
  ]);

  const byRef = new Map<string, { ref: ReturnType<typeof doc>; data: LinkedDocFields }>();
  for (const snap of querySnaps) {
    for (const d of snap.docs) {
      byRef.set(d.ref.path, { ref: d.ref, data: d.data() as LinkedDocFields });
    }
  }

  const targetNorm = normalizeClientName(client.name);
  const previousNorm = options?.previousName
    ? normalizeClientName(options.previousName)
    : null;

  const updates: Array<{ ref: ReturnType<typeof doc>; data: Record<string, string> }> = [];

  for (const { ref, data } of byRef.values()) {
    const linkedById = data.clientId === clientId;
    const nameNorm = normalizeClientName(data.clientName || '');
    const nameMatches =
      !isWalkInClientName(data.clientName) &&
      (nameNorm === targetNorm || (previousNorm !== null && nameNorm === previousNorm));

    // Do not reassign documents that already belong to a different client id
    if (!linkedById && hasUsableClientId(data.clientId)) {
      continue;
    }

    if (!linkedById && !nameMatches) continue;
    if (!docNeedsClientSync(data, clientId, client)) continue;

    updates.push({ ref, data: snapshotUpdate });
  }

  if (updates.length === 0) return { updated: 0 };
  await commitInBatches(updates);
  return { updated: updates.length };
}

export type ClientLinkBackfillResult = {
  linkedOrRepaired: number;
  refreshed: number;
  skippedAmbiguous: number;
  skippedWalkIn: number;
  skippedUnmatched: number;
};

const CLIENT_DOCS_BACKFILL_FLAG = 'sasa-client-docs-link-backfill-v1';
let clientDocsBackfillPromise: Promise<ClientLinkBackfillResult | null> | null = null;

/**
 * Runs the historical link/refresh at most once per browser tab session.
 * Safe to call from Clients, Notas, or Consignaciones modules.
 */
export async function ensureClientDocumentLinks(): Promise<ClientLinkBackfillResult | null> {
  if (typeof window === 'undefined') return null;
  if (sessionStorage.getItem(CLIENT_DOCS_BACKFILL_FLAG)) return null;
  if (clientDocsBackfillPromise) return clientDocsBackfillPromise;

  clientDocsBackfillPromise = (async () => {
    try {
      const result = await backfillAllClientDocumentLinks();
      sessionStorage.setItem(CLIENT_DOCS_BACKFILL_FLAG, '1');
      if (result.linkedOrRepaired > 0 || result.refreshed > 0) {
        console.info('Client document links repaired', result);
      }
      return result;
    } catch (error) {
      console.error('Error linking historical client documents:', error);
      return null;
    } finally {
      clientDocsBackfillPromise = null;
    }
  })();

  return clientDocsBackfillPromise;
}

/**
 * Ensures historical notas and consignaciones have a valid clientId (match by name
 * when missing/stale) and refreshes name/address from the clients collection.
 */
export async function backfillAllClientDocumentLinks(): Promise<ClientLinkBackfillResult> {
  const [clients, invoicesSnap, consignmentsSnap] = await Promise.all([
    getAllClients(),
    getDocs(collection(db, INVOICES_COLLECTION)),
    getDocs(collection(db, CONSIGNMENTS_COLLECTION)),
  ]);

  const clientsById = new Map(clients.map((c) => [c.id, c]));
  const clientsByNormName = new Map<string, Client[]>();
  for (const c of clients) {
    const key = normalizeClientName(c.name);
    if (!key) continue;
    const list = clientsByNormName.get(key) || [];
    list.push(c);
    clientsByNormName.set(key, list);
  }

  const result: ClientLinkBackfillResult = {
    linkedOrRepaired: 0,
    refreshed: 0,
    skippedAmbiguous: 0,
    skippedWalkIn: 0,
    skippedUnmatched: 0,
  };

  const updates: Array<{ ref: ReturnType<typeof doc>; data: Record<string, string> }> = [];

  const resolveClient = (data: LinkedDocFields): Client | null | 'ambiguous' | 'walk-in' => {
    if (hasUsableClientId(data.clientId)) {
      const byId = clientsById.get(data.clientId);
      if (byId) return byId;
      // Stale/deleted clientId — try to repair by name below
    }

    if (isWalkInClientName(data.clientName)) {
      return 'walk-in';
    }

    const nameNorm = normalizeClientName(data.clientName || '');
    if (!nameNorm) return 'walk-in';

    const matches = clientsByNormName.get(nameNorm) || [];
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return 'ambiguous';
    return null;
  };

  const consider = (d: QueryDocumentSnapshot) => {
    const data = d.data() as LinkedDocFields;
    const resolved = resolveClient(data);

    if (resolved === 'walk-in') {
      result.skippedWalkIn += 1;
      return;
    }
    if (resolved === 'ambiguous') {
      result.skippedAmbiguous += 1;
      return;
    }
    if (!resolved) {
      result.skippedUnmatched += 1;
      return;
    }

    if (!docNeedsClientSync(data, resolved.id, resolved)) {
      return;
    }

    const wasLinked = data.clientId === resolved.id;
    updates.push({ ref: d.ref, data: buildSnapshotUpdate(resolved.id, resolved) });
    if (wasLinked) {
      result.refreshed += 1;
    } else {
      result.linkedOrRepaired += 1;
    }
  };

  invoicesSnap.docs.forEach(consider);
  consignmentsSnap.docs.forEach(consider);

  if (updates.length > 0) {
    await commitInBatches(updates);
  }

  return result;
}

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

function clientSnapshotFieldsChanged(updates: Partial<Client>): boolean {
  return (
    updates.name !== undefined ||
    updates.address !== undefined ||
    updates.city !== undefined ||
    updates.country !== undefined
  );
}

// Update a client and cascade name/address to linked notas de pedido and consignaciones
export async function updateClient(
  clientId: string,
  updates: Partial<Client>,
  options?: { previousName?: string }
): Promise<void> {
  try {
    const docRef = doc(db, CLIENTS_COLLECTION, clientId);
    const previousName = options?.previousName;

    await setDoc(
      docRef,
      {
        ...updates,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    if (!clientSnapshotFieldsChanged(updates)) {
      return;
    }

    const latest = await getClient(clientId);
    if (!latest) return;

    await syncClientDataToLinkedDocuments(clientId, latest, {
      previousName:
        previousName && previousName !== latest.name ? previousName : undefined,
    });
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
