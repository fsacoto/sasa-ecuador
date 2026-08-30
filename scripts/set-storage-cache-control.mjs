/**
 * Pone cacheControl largo en objetos ya subidos a Firebase Storage.
 * Sin esto, las fotos viejas siguen con max-age=0 y el navegador las vuelve a bajar
 * cada vez que abres Inventario.
 *
 * 1. Firebase Console → Project settings → Service accounts → Generate new private key
 * 2. Guarda el JSON en tu máquina (no lo subas al repo)
 *
 * Dry-run:
 *   GOOGLE_APPLICATION_CREDENTIALS=/Users/tu-usuario/Downloads/sasa-ecuador-xxxxx.json \
 *     npm run storage:cache-control:dry
 *
 * Aplicar:
 *   GOOGLE_APPLICATION_CREDENTIALS=/Users/tu-usuario/Downloads/sasa-ecuador-xxxxx.json \
 *     npm run storage:cache-control:apply
 *
 * Dev: añade --project sasa-ecuador-dev al script en package.json, o:
 *   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/set-storage-cache-control.mjs --project sasa-ecuador-dev --apply
 */
import { existsSync, readFileSync } from 'node:fs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const CACHE_CONTROL = 'public, max-age=31536000';
const PROD_PROJECT = 'sasa-ecuador';
const DEV_PROJECT = 'sasa-ecuador-dev';
const ALLOWED = new Set([PROD_PROJECT, DEV_PROJECT]);

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const projectArgIdx = args.indexOf('--project');
const projectId =
  (projectArgIdx >= 0 ? args[projectArgIdx + 1] : null) ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  '';

if (!ALLOWED.has(projectId)) {
  console.error(
    `Proyecto inválido: "${projectId}". Usa --project ${PROD_PROJECT} o ${DEV_PROJECT}.`
  );
  process.exit(1);
}

const bucketByProject = {
  [PROD_PROJECT]: 'sasa-ecuador.firebasestorage.app',
  [DEV_PROJECT]: 'sasa-ecuador-dev.firebasestorage.app',
};

function resolveCredential() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (inline) {
    return cert(JSON.parse(inline));
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (credPath) {
    if (
      credPath.includes('/ruta/') ||
      credPath.endsWith('al-service-account.json') ||
      credPath.endsWith('sa.json')
    ) {
      console.error(
        `GOOGLE_APPLICATION_CREDENTIALS apunta a una ruta de ejemplo, no a un archivo real:\n  ${credPath}\n`
      );
      console.error(
        'Descarga la clave en Firebase Console → ⚙️ Project settings → Service accounts → Generate new private key.'
      );
      console.error(
        'Luego:\n  GOOGLE_APPLICATION_CREDENTIALS=/Users/fernandosacoto/Downloads/el-archivo-descargado.json \\\n    npm run storage:cache-control:dry'
      );
      process.exit(1);
    }
    if (!existsSync(credPath)) {
      console.error(`No existe el archivo de service account:\n  ${credPath}`);
      process.exit(1);
    }
    return cert(JSON.parse(readFileSync(credPath, 'utf8')));
  }

  return applicationDefault();
}

initializeApp({
  credential: resolveCredential(),
  projectId,
  storageBucket: bucketByProject[projectId],
});

const bucket = getStorage().bucket();

console.log(`Proyecto: ${projectId}`);
console.log(`Bucket: ${bucket.name}`);
console.log(`Modo: ${apply ? 'APLICAR cacheControl' : 'dry-run (no escribe)'}`);
console.log(`cacheControl: ${CACHE_CONTROL}`);
console.log('');

let scanned = 0;
let alreadyOk = 0;
let toUpdate = 0;
let updated = 0;
let errors = 0;

let pageToken;

do {
  const [files, , apiResponse] = await bucket.getFiles({
    autoPaginate: false,
    maxResults: 500,
    pageToken,
  });

  for (const file of files) {
    scanned += 1;
    try {
      const [metadata] = await file.getMetadata();
      const current = String(metadata.cacheControl || '').trim();
      if (current === CACHE_CONTROL) {
        alreadyOk += 1;
        continue;
      }
      toUpdate += 1;
      if (!apply) continue;
      await file.setMetadata({ cacheControl: CACHE_CONTROL });
      updated += 1;
    } catch (err) {
      errors += 1;
      console.error(`  Error en ${file.name}:`, err?.message ?? err);
    }
  }

  pageToken = apiResponse?.nextPageToken;
} while (pageToken);

console.log(`Archivos: ${scanned}`);
console.log(`Ya tenían caché: ${alreadyOk}`);
console.log(`${apply ? 'Actualizados' : 'Pendientes de actualizar'}: ${apply ? updated : toUpdate}`);
if (errors) console.log(`Errores: ${errors}`);
if (!apply && toUpdate > 0) {
  console.log('\nPara aplicar: el mismo comando con npm run storage:cache-control:apply');
}
console.log('\nListo.');
process.exit(errors ? 1 : 0);
