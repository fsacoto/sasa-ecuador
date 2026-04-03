// Import the functions you need from the SDKs you need
import { initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

/**
 * Web SDK expects the bucket id (e.g. project-id.appspot.com), not gs://...
 * Wrong or empty values often surface as storage/unknown on uploads.
 */
function normalizeStorageBucket(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  if (t.startsWith("gs://")) return t.slice(5);
  return t;
}

const storageBucket = normalizeStorageBucket(
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
);

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

if (storageBucket) {
  firebaseConfig.storageBucket = storageBucket;
} else if (
  typeof process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "string" &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID.length > 0
) {
  // Avoid storage/unknown on new projects: default host may not match the real bucket.
  if (typeof globalThis !== "undefined" && !(globalThis as { __sasaFirebaseBucketWarned?: boolean }).__sasaFirebaseBucketWarned) {
    (globalThis as { __sasaFirebaseBucketWarned?: boolean }).__sasaFirebaseBucketWarned = true;
    console.warn(
      "[Firebase] NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is unset. Set it to the bucket id from Firebase Console → Storage (e.g. project-id.firebasestorage.app)."
    );
  }
}

// Initialize Firebase (omit storageBucket to use SDK default — often wrong for new projects)
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Firebase Storage
export const storage = getStorage(app);

// Initialize Analytics (only in browser)
export let analytics: ReturnType<typeof getAnalytics> | null = null;
if (typeof window !== 'undefined') {
  try {
    analytics = getAnalytics(app);
  } catch (error) {
    console.warn('Analytics not available:', error);
  }
}

export default app;
