import type { ParsedRow } from './csvParser';

/** Legacy single-draft key (v1); migrated once into v2 store. */
const LEGACY_STORAGE_KEY = 'sasa-ecuador-bulk-import-draft-v1';
const SESSIONS_STORAGE_KEY = 'sasa-ecuador-bulk-import-sessions-v2';

const MAX_SESSIONS = 30;

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

type SessionsStoreV2 = {
  storeVersion: 2;
  sessions: StoredBulkImportSession[];
};

/** @deprecated kept for migration typing */
type BulkImportDraftV1 = {
  version: 1;
  savedAt: string;
} & BulkImportSessionPayload;

function isValidPayload(d: unknown): d is BulkImportSessionPayload {
  if (!d || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  if (!Array.isArray(o.headers) || !Array.isArray(o.parsedData)) return false;
  if (o.parsedData.length === 0) return false;
  if (!o.columnMapping || typeof o.columnMapping !== 'object') return false;
  return true;
}

function isValidSession(d: unknown): d is StoredBulkImportSession {
  if (!d || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return false;
  if (typeof o.label !== 'string') return false;
  if (typeof o.savedAt !== 'string') return false;
  return isValidPayload(d);
}

function isValidStoreV2(parsed: unknown): parsed is SessionsStoreV2 {
  if (!parsed || typeof parsed !== 'object') return false;
  const o = parsed as Record<string, unknown>;
  if (o.storeVersion !== 2) return false;
  if (!Array.isArray(o.sessions)) return false;
  return o.sessions.every((s) => isValidSession(s));
}

function readStore(): SessionsStoreV2 {
  if (typeof window === 'undefined') return { storeVersion: 2, sessions: [] };
  try {
    const raw2 = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (raw2) {
      const parsed = JSON.parse(raw2);
      if (isValidStoreV2(parsed)) return parsed;
    }

    const rawLegacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (rawLegacy) {
      const parsed = JSON.parse(rawLegacy) as unknown;
      if (parsed && typeof parsed === 'object') {
        const legacy = parsed as BulkImportDraftV1;
        if (legacy.version === 1 && isValidPayload(legacy)) {
          const migrated: StoredBulkImportSession = {
            id: crypto.randomUUID(),
            label: 'Importación (migrada)',
            savedAt: legacy.savedAt || new Date().toISOString(),
            headers: legacy.headers,
            parsedData: legacy.parsedData,
            columnMapping: legacy.columnMapping,
            invoicePrefix: legacy.invoicePrefix,
            invoiceLink: legacy.invoiceLink,
            purchaseDate: legacy.purchaseDate,
            defaultSupplier: legacy.defaultSupplier,
            defaultCurrency: legacy.defaultCurrency,
            exchangeRate: legacy.exchangeRate,
            exchangeRateManuallySet: legacy.exchangeRateManuallySet,
          };
          const store: SessionsStoreV2 = { storeVersion: 2, sessions: [migrated] };
          localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(store));
          try {
            localStorage.removeItem(LEGACY_STORAGE_KEY);
          } catch {
            /* ignore */
          }
          return store;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return { storeVersion: 2, sessions: [] };
}

function writeStore(store: SessionsStoreV2): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (e) {
    console.warn('[bulk import sessions] Could not save to localStorage:', e);
    return false;
  }
}

export type BulkImportSessionListItem = {
  id: string;
  label: string;
  savedAt: string;
  rowCount: number;
};

export function hasBulkImportSessions(): boolean {
  return readStore().sessions.length > 0;
}

/** @deprecated use hasBulkImportSessions */
export function hasBulkImportDraft(): boolean {
  return hasBulkImportSessions();
}

export function listBulkImportSessionsMeta(): BulkImportSessionListItem[] {
  const { sessions } = readStore();
  return [...sessions]
    .map((s) => ({
      id: s.id,
      label: s.label,
      savedAt: s.savedAt,
      rowCount: s.parsedData.length,
    }))
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
}

export function loadBulkImportSession(id: string): StoredBulkImportSession | null {
  if (!id) return null;
  const { sessions } = readStore();
  const found = sessions.find((s) => s.id === id);
  return found && isValidSession(found) ? found : null;
}

export function deleteBulkImportSession(id: string): boolean {
  const store = readStore();
  const next = store.sessions.filter((s) => s.id !== id);
  if (next.length === store.sessions.length) return false;
  return writeStore({ storeVersion: 2, sessions: next });
}

/**
 * Creates or updates a session. Returns the session id, or null on failure.
 * New sessions without `id` are appended; store is trimmed to MAX_SESSIONS by oldest `savedAt`.
 */
export function upsertBulkImportSession(
  input: BulkImportSessionPayload & { id?: string | null; label: string }
): string | null {
  const store = readStore();
  const now = new Date().toISOString();
  let sessions = [...store.sessions];
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

  const existingId = input.id && sessions.some((s) => s.id === input.id) ? input.id : undefined;

  let outId: string;
  if (existingId) {
    outId = existingId;
    sessions = sessions.map((s) =>
      s.id === existingId
        ? { ...s, ...payload, label: input.label || s.label, savedAt: now }
        : s
    );
  } else {
    outId = crypto.randomUUID();
    sessions.push({
      id: outId,
      label: input.label || 'Importación masiva',
      savedAt: now,
      ...payload,
    });
  }

  if (sessions.length > MAX_SESSIONS) {
    sessions.sort((a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime());
    sessions = sessions.slice(sessions.length - MAX_SESSIONS);
  }

  const ok = writeStore({ storeVersion: 2, sessions });
  return ok ? outId : null;
}
