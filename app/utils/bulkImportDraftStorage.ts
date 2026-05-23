import type { ParsedRow } from './csvParser';

/** Pending bulk imports (pre-import mapping step) in this browser. */
const STORAGE_KEY = 'sasa-ecuador-bulk-import-pending-v3';
const MAX_PENDING = 20;

export type BulkImportSessionPayload = {
  headers: string[];
  parsedData: ParsedRow[];
  columnMapping: Record<string, string>;
  invoicePrefix: string;
  invoiceLink: string;
  purchaseDate: string;
  defaultSupplier: string;
  defaultCurrency: string;
  exchangeRate: number;
  exchangeRateManuallySet: boolean;
};

export type StoredBulkImportSession = BulkImportSessionPayload & {
  id: string;
  label: string;
  savedAt: string;
};

type PendingStore = {
  version: 3;
  pending: StoredBulkImportSession[];
};

function isValidPayload(value: unknown): value is BulkImportSessionPayload {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    Array.isArray(o.headers) &&
    Array.isArray(o.parsedData) &&
    o.parsedData.length > 0 &&
    !!o.columnMapping &&
    typeof o.columnMapping === 'object'
  );
}

function isValidSession(value: unknown): value is StoredBulkImportSession {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    o.id.length > 0 &&
    typeof o.label === 'string' &&
    typeof o.savedAt === 'string' &&
    isValidPayload(value)
  );
}

function labelKey(label: string): string {
  return label.trim().toLowerCase();
}

function readStore(): PendingStore {
  if (typeof window === 'undefined') return { version: 3, pending: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 3, pending: [] };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return { version: 3, pending: [] };
    const o = parsed as Record<string, unknown>;
    if (o.version !== 3 || !Array.isArray(o.pending)) return { version: 3, pending: [] };
    return {
      version: 3,
      pending: o.pending.filter(isValidSession),
    };
  } catch {
    return { version: 3, pending: [] };
  }
}

function writeStore(pending: StoredBulkImportSession[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, pending }));
    return true;
  } catch (error) {
    console.warn('[bulk import pending] save failed:', error);
    return false;
  }
}

/** One pending import per file name — newest wins. */
function dedupePending(sessions: StoredBulkImportSession[]): StoredBulkImportSession[] {
  const byLabel = new Map<string, StoredBulkImportSession>();
  for (const session of sessions) {
    const key = labelKey(session.label) || session.id;
    const prev = byLabel.get(key);
    if (!prev || new Date(session.savedAt).getTime() >= new Date(prev.savedAt).getTime()) {
      byLabel.set(key, session);
    }
  }
  return [...byLabel.values()].sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  );
}

export type BulkImportSessionListItem = {
  id: string;
  label: string;
  savedAt: string;
  rowCount: number;
};

export function listBulkImportSessionsMeta(): BulkImportSessionListItem[] {
  const { pending } = readStore();
  return dedupePending(pending).map((s) => ({
    id: s.id,
    label: s.label,
    savedAt: s.savedAt,
    rowCount: s.parsedData.length,
  }));
}

export function hasBulkImportSessions(): boolean {
  return listBulkImportSessionsMeta().length > 0;
}

export function loadBulkImportSession(id: string): StoredBulkImportSession | null {
  if (!id) return null;
  const found = readStore().pending.find((s) => s.id === id);
  return found && isValidSession(found) ? found : null;
}

export function findBulkImportSessionByLabel(label: string): StoredBulkImportSession | null {
  const key = labelKey(label);
  if (!key) return null;
  let best: StoredBulkImportSession | null = null;
  for (const session of readStore().pending) {
    if (!isValidSession(session) || labelKey(session.label) !== key) continue;
    if (!best || new Date(session.savedAt).getTime() >= new Date(best.savedAt).getTime()) {
      best = session;
    }
  }
  return best;
}

export function deleteBulkImportSession(id: string): boolean {
  if (!id) return false;
  const store = readStore();
  const target = store.pending.find((s) => s.id === id);
  if (!target) return false;
  const key = labelKey(target.label);
  const next = key
    ? store.pending.filter((s) => labelKey(s.label) !== key)
    : store.pending.filter((s) => s.id !== id);
  return writeStore(next);
}

export function clearAllBulkImportSessions(): void {
  writeStore([]);
}

/** Save or update a pending import. Called automatically while editing. */
export function upsertBulkImportSession(
  input: BulkImportSessionPayload & { id?: string | null; label: string }
): string | null {
  const now = new Date().toISOString();
  const label = input.label.trim() || 'Importación masiva';
  const payload: BulkImportSessionPayload = {
    headers: input.headers,
    parsedData: input.parsedData,
    columnMapping: input.columnMapping,
    invoicePrefix: input.invoicePrefix,
    invoiceLink: input.invoiceLink,
    purchaseDate: input.purchaseDate,
    defaultSupplier: input.defaultSupplier,
    defaultCurrency: input.defaultCurrency,
    exchangeRate: input.exchangeRate,
    exchangeRateManuallySet: input.exchangeRateManuallySet,
  };

  let pending = dedupePending(readStore().pending);
  const byId = input.id ? pending.find((s) => s.id === input.id) : undefined;
  const byLabel = pending.find((s) => labelKey(s.label) === labelKey(label));

  let id: string;
  if (byId) {
    id = byId.id;
    pending = pending.map((s) =>
      s.id === id ? { ...s, ...payload, label, savedAt: now } : s
    );
  } else if (byLabel) {
    id = byLabel.id;
    pending = pending.map((s) =>
      s.id === id ? { ...s, ...payload, label, savedAt: now } : s
    );
  } else {
    id = crypto.randomUUID();
    pending.unshift({ id, label, savedAt: now, ...payload });
  }

  pending = dedupePending(pending).slice(0, MAX_PENDING);
  return writeStore(pending) ? id : null;
}
