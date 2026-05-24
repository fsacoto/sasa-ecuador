/**
 * Scan Firebase Storage for files not referenced in Firestore and optionally delete them.
 *
 * Barcode behaviour is unchanged: barcodes/ files are kept only when a purchase order or
 * inventory document still references that Storage URL (same rule as app delete logic).
 *
 * Usage:
 *   # Dry run (default) — dev project
 *   yarn storage:cleanup:dev
 *
 *   # Dry run — production
 *   yarn storage:cleanup:prod
 *
 *   # Actually delete orphans (requires credentials)
 *   yarn storage:cleanup:dev -- --execute
 *
 * Auth: set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON, or run
 *   gcloud auth application-default login
 * with access to the target Firebase/GCP project.
 */

import admin from 'firebase-admin';
import { collectStoragePathsFromValue } from './lib/storageUrl';

const FIRESTORE_COLLECTIONS = [
  'users',
  'suppliers',
  'purchaseOrders',
  'inventory',
  'additionalCosts',
  'cmsContent',
  'clients',
  'invoices',
  'consignments',
  'inventoryMedia',
] as const;

const ALWAYS_KEEP_PREFIXES = ['public/'] as const;

type CliOptions = {
  projectId: string;
  bucket: string;
  execute: boolean;
  verbose: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  let projectId = '';
  let bucket = '';
  let execute = false;
  let verbose = false;

  for (const arg of argv) {
    if (arg === '--execute') execute = true;
    else if (arg === '--verbose' || arg === '-v') verbose = true;
    else if (arg.startsWith('--project=')) projectId = arg.slice('--project='.length).trim();
    else if (arg.startsWith('--bucket=')) bucket = arg.slice('--bucket='.length).trim();
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!projectId) {
    console.error('Missing --project= (e.g. sasa-ecuador-dev or sasa-ecuador)\n');
    printHelp();
    process.exit(1);
  }

  if (!bucket) {
    bucket = `${projectId}.firebasestorage.app`;
  }

  return { projectId, bucket, execute, verbose };
}

function printHelp(): void {
  console.log(`\
cleanup-orphaned-storage — remove Storage files with no Firestore reference

Options:
  --project=<id>   Firebase project (required)
  --bucket=<id>    Storage bucket (default: <project>.firebasestorage.app)
  --execute        Delete orphans (default: dry-run only)
  --verbose, -v    Log kept files under entity folders
  --help, -h       Show this help

Examples:
  yarn storage:cleanup:dev
  yarn storage:cleanup:prod -- --execute
  yarn storage:cleanup:dev -- --execute --verbose
`);
}

function initFirebase(projectId: string, bucket: string) {
  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId, storageBucket: bucket });
  }
  return {
    db: admin.firestore(),
    bucket: admin.storage().bucket(bucket),
  };
}

async function listAllStoragePaths(bucket: admin.storage.Bucket): Promise<string[]> {
  const paths: string[] = [];
  let pageToken: string | undefined;

  do {
    const [files, , apiResponse] = await bucket.getFiles({
      autoPaginate: false,
      maxResults: 1000,
      pageToken,
    });
    for (const file of files) {
      paths.push(file.name);
    }
    pageToken = (apiResponse as { nextPageToken?: string } | undefined)?.nextPageToken;
  } while (pageToken);

  return paths;
}

async function collectReferencedPaths(
  db: admin.firestore.Firestore
): Promise<{
  referencedPaths: Set<string>;
  purchaseOrderIds: Set<string>;
  consignmentIds: Set<string>;
}> {
  const referencedPaths = new Set<string>();
  const purchaseOrderIds = new Set<string>();
  const consignmentIds = new Set<string>();

  for (const collectionName of FIRESTORE_COLLECTIONS) {
    const snap = await db.collection(collectionName).get();
    for (const docSnap of snap.docs) {
      collectStoragePathsFromValue(docSnap.data(), referencedPaths);

      if (collectionName === 'purchaseOrders') {
        purchaseOrderIds.add(docSnap.id);
      }
      if (collectionName === 'consignments') {
        consignmentIds.add(docSnap.id);
      }
    }
    console.log(`  ${collectionName}: ${snap.size} docs`);
  }

  return { referencedPaths, purchaseOrderIds, consignmentIds };
}

function isAlwaysKeptPrefix(path: string): boolean {
  return ALWAYS_KEEP_PREFIXES.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix));
}

function isProtectedEntityFolder(
  path: string,
  purchaseOrderIds: Set<string>,
  consignmentIds: Set<string>
): boolean {
  const verificationMatch = path.match(/^verification\/([^/]+)(?:\/|$)/);
  if (verificationMatch && purchaseOrderIds.has(verificationMatch[1])) {
    return true;
  }

  const consignmentMatch = path.match(/^consignment-returns\/([^/]+)(?:\/|$)/);
  if (consignmentMatch && consignmentIds.has(consignmentMatch[1])) {
    return true;
  }

  return false;
}

function classifyPath(
  path: string,
  referencedPaths: Set<string>,
  purchaseOrderIds: Set<string>,
  consignmentIds: Set<string>
): 'keep' | 'orphan' {
  if (isAlwaysKeptPrefix(path)) return 'keep';
  if (referencedPaths.has(path)) return 'keep';
  if (isProtectedEntityFolder(path, purchaseOrderIds, consignmentIds)) return 'keep';
  return 'orphan';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(`Project:  ${options.projectId}`);
  console.log(`Bucket:   ${options.bucket}`);
  console.log(`Mode:     ${options.execute ? 'EXECUTE (will delete)' : 'DRY RUN (no deletes)'}\n`);

  const { db, bucket } = initFirebase(options.projectId, options.bucket);

  console.log('Scanning Firestore for Storage URL references…');
  const { referencedPaths, purchaseOrderIds, consignmentIds } = await collectReferencedPaths(db);
  console.log(`  Referenced Storage paths: ${referencedPaths.size}`);
  console.log(`  Active purchase orders:   ${purchaseOrderIds.size}`);
  console.log(`  Active consignments:      ${consignmentIds.size}\n`);

  console.log('Listing Storage objects…');
  const allPaths = await listAllStoragePaths(bucket);
  console.log(`  Total objects in bucket: ${allPaths.length}\n`);

  const orphans: string[] = [];
  const kept: string[] = [];
  const byPrefix = new Map<string, number>();

  for (const path of allPaths) {
    const status = classifyPath(path, referencedPaths, purchaseOrderIds, consignmentIds);
    if (status === 'orphan') {
      orphans.push(path);
      const prefix = path.split('/')[0] ?? '(root)';
      byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1);
    } else {
      kept.push(path);
      if (options.verbose) console.log(`  keep: ${path}`);
    }
  }

  console.log(`Orphan candidates: ${orphans.length}`);
  if (orphans.length > 0) {
    console.log('By top-level prefix:');
    for (const [prefix, count] of [...byPrefix.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${prefix}/  ${count}`);
    }
    console.log('\nSample orphan paths (up to 30):');
    for (const path of orphans.slice(0, 30)) {
      console.log(`  ${path}`);
    }
    if (orphans.length > 30) {
      console.log(`  … and ${orphans.length - 30} more`);
    }
  }

  if (!options.execute) {
    console.log('\nDry run complete. Re-run with --execute to delete these files.');
    return;
  }

  if (orphans.length === 0) {
    console.log('\nNothing to delete.');
    return;
  }

  console.log('\nDeleting orphan files…');
  let deleted = 0;
  let failed = 0;
  let totalBytes = 0;

  for (const path of orphans) {
    try {
      const file = bucket.file(path);
      const [metadata] = await file.getMetadata().catch(() => [null]);
      await file.delete({ ignoreNotFound: true });
      deleted++;
      totalBytes += Number(metadata?.size ?? 0);
      console.log(`  deleted: ${path}`);
    } catch (error) {
      failed++;
      console.warn(`  failed:  ${path}`, error);
    }
  }

  console.log(`\nDone. Deleted ${deleted} file(s) (${formatBytes(totalBytes)}). Failed: ${failed}.`);
  console.log(`Kept ${kept.length} referenced or protected file(s).`);
}

main().catch((error) => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});
