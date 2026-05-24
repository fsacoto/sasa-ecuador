/** Extract Storage object path from a Firebase download URL (admin / CLI safe). */
export function extractStoragePath(url: string): string | null {
  try {
    const trimmed = url.trim();
    if (!trimmed.includes('firebasestorage.googleapis.com')) return null;

    const urlObj = new URL(trimmed);
    const match = urlObj.pathname.match(/\/o\/(.+)$/);
    if (match) return decodeURIComponent(match[1]);

    const altMatch = trimmed.match(/\/o\/(.+?)(?:\?|$)/);
    if (altMatch) return decodeURIComponent(altMatch[1]);

    return null;
  } catch {
    return null;
  }
}

export function isFirebaseStorageURL(value: string): boolean {
  return value.includes('firebasestorage.googleapis.com');
}

/** Walk arbitrary Firestore JSON and collect Storage paths from URL strings. */
export function collectStoragePathsFromValue(value: unknown, out: Set<string>): void {
  if (value == null) return;

  if (typeof value === 'string') {
    if (isFirebaseStorageURL(value)) {
      const path = extractStoragePath(value);
      if (path) out.add(path);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStoragePathsFromValue(item, out);
    return;
  }

  if (typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectStoragePathsFromValue(nested, out);
    }
  }
}
