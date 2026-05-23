const STORAGE_VERSION = 'v1';
const PREFIX = 'sasa_prefs';

export function modulePrefsKey(moduleKey: string, userId?: string | null): string {
  return `${PREFIX}_${STORAGE_VERSION}_${userId ?? 'guest'}_${moduleKey}`;
}

export function readModulePrefs(moduleKey: string, userId?: string | null): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(modulePrefsKey(moduleKey, userId));
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function readModuleField<T>(
  moduleKey: string,
  fieldKey: string,
  fallback: T,
  userId?: string | null
): T {
  const prefs = readModulePrefs(moduleKey, userId);
  if (!(fieldKey in prefs)) return fallback;
  return prefs[fieldKey] as T;
}

export function writeModuleField(
  moduleKey: string,
  fieldKey: string,
  value: unknown,
  userId?: string | null
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = modulePrefsKey(moduleKey, userId);
    const prefs = readModulePrefs(moduleKey, userId);
    prefs[fieldKey] = value;
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    // quota or private mode
  }
}

export function writeModuleFields(
  moduleKey: string,
  fields: Record<string, unknown>,
  userId?: string | null
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = modulePrefsKey(moduleKey, userId);
    const prefs = { ...readModulePrefs(moduleKey, userId), ...fields };
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}
