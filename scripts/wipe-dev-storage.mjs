/**
 * Borra archivos de Firebase Storage bajo ciertos prefijos, SOLO en el bucket de
 * desarrollo. Pensado para reiniciar el inventario en dev.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/al/serviceAccount-dev.json \
 *     node scripts/wipe-dev-storage.mjs --yes
 *
 * Por defecto borra: images/inventory/  y  barcodes/
 * Puedes pasar prefijos propios:
 *   node scripts/wipe-dev-storage.mjs --yes images/inventory/ barcodes/ verification/
 *
 * Sin --yes hace un "dry run": lista cuántos archivos borraría sin borrar nada.
 */
import admin from 'firebase-admin';

const DEV_BUCKET = 'sasa-ecuador-dev.firebasestorage.app';
const DEFAULT_PREFIXES = ['images/inventory/', 'barcodes/'];

const args = process.argv.slice(2);
const confirmed = args.includes('--yes');
const prefixes = args.filter((a) => !a.startsWith('--'));
const targetPrefixes = prefixes.length > 0 ? prefixes : DEFAULT_PREFIXES;

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    'Falta GOOGLE_APPLICATION_CREDENTIALS con la ruta al service account de DEV (sasa-ecuador-dev).'
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: DEV_BUCKET,
});

// Guarda de seguridad: nunca tocar producción.
const bucket = admin.storage().bucket();
if (bucket.name !== DEV_BUCKET) {
  console.error(`Bucket inesperado: ${bucket.name}. Abortando por seguridad.`);
  process.exit(1);
}

console.log(`Bucket: ${bucket.name}`);
console.log(`Modo: ${confirmed ? 'BORRADO REAL' : 'dry-run (no borra)'}`);

for (const prefix of targetPrefixes) {
  const [files] = await bucket.getFiles({ prefix });
  console.log(`\nPrefijo "${prefix}": ${files.length} archivos`);
  if (!confirmed || files.length === 0) continue;

  let deleted = 0;
  for (const file of files) {
    try {
      await file.delete();
      deleted += 1;
    } catch (err) {
      console.error(`  Error borrando ${file.name}:`, err?.message ?? err);
    }
  }
  console.log(`  Borrados: ${deleted}/${files.length}`);
}

console.log('\nListo.');
process.exit(0);
