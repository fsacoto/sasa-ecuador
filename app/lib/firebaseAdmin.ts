import { initializeApp, getApps, cert, applicationDefault, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let adminApp: App | undefined;
let adminDb: Firestore | undefined;

function resolveProjectId(): string {
  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();

  if (!projectId) {
    throw new Error(
      'Firebase project id missing. Set NEXT_PUBLIC_FIREBASE_PROJECT_ID or FIREBASE_PROJECT_ID.'
    );
  }

  return projectId;
}

function parseServiceAccountJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON. Paste the full service account JSON string.'
    );
  }
}

function initFirebaseAdmin(): App {
  if (adminApp) return adminApp;

  const existing = getApps()[0];
  if (existing) {
    adminApp = existing;
    return adminApp;
  }

  const projectId = resolveProjectId();

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim()) {
    adminApp = initializeApp({
      credential: cert(parseServiceAccountJson(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
      projectId,
    });
    return adminApp;
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    adminApp = initializeApp({
      credential: applicationDefault(),
      projectId,
    });
    return adminApp;
  }

  throw new Error(
    'Firebase Admin credentials missing. Set FIREBASE_SERVICE_ACCOUNT_KEY (JSON string) or GOOGLE_APPLICATION_CREDENTIALS (path to service account file).'
  );
}

export function getAdminFirestore(): Firestore {
  if (!adminDb) {
    adminDb = getFirestore(initFirebaseAdmin());
  }
  return adminDb;
}
