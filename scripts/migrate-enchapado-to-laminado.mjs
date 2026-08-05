/**
 * Migración prod/dev: Enchapado en Oro → Laminado en Oro
 * SKUs XXEO#### → XXLO#### (misma secuencia).
 *
 * Actualiza Firestore (inventario, OC, consignaciones, notas, media, CMS, autoconsumo)
 * y, con --storage, copia/renombra archivos en Storage (by-sku + barcodes) y reescribe URLs.
 *
 * Uso (dry-run, no escribe):
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/sa-prod.json \
 *     node scripts/migrate-enchapado-to-laminado.mjs --project sasa-ecuador
 *
 * Aplicar en producción:
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/sa-prod.json \
 *     node scripts/migrate-enchapado-to-laminado.mjs --project sasa-ecuador --apply --storage
 *
 * Dev:
 *   ... --project sasa-ecuador-dev --apply --storage
 */
import admin from 'firebase-admin';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const doStorage = args.includes('--storage');
const projectArgIdx = args.indexOf('--project');
const projectId =
  (projectArgIdx >= 0 ? args[projectArgIdx + 1] : null) ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  '';

const PROD_PROJECT = 'sasa-ecuador';
const DEV_PROJECT = 'sasa-ecuador-dev';
const ALLOWED = new Set([PROD_PROJECT, DEV_PROJECT]);

const LAMINADO_LINE = 'Laminado en Oro';
const LEGACY_LINES = new Set([
  'enchapado en oro',
  'gold plated',
  'bañado en oro',
  'banado en oro',
]);

function remapEoSkuToLo(sku) {
  const trimmed = String(sku || '').trim();
  const m = trimmed.match(/^([A-Za-z]{2})EO(\d{4}(?:-\d+)?)$/i);
  if (!m) return null;
  return `${m[1].toUpperCase()}LO${m[2]}`;
}

function isLegacyLine(line) {
  if (line == null || line === '') return false;
  const t = String(line).trim();
  return LEGACY_LINES.has(t.toLowerCase()) || t === 'Enchapado en Oro';
}

function remapLine(line) {
  return isLegacyLine(line) ? LAMINADO_LINE : null;
}

function remapSkuOccurrences(text, skuMap) {
  let out = String(text || '');
  for (const [oldSku, newSku] of skuMap) {
    if (!oldSku || oldSku === newSku) continue;
    if (out.includes(oldSku)) out = out.split(oldSku).join(newSku);
    const encOld = encodeURIComponent(oldSku);
    const encNew = encodeURIComponent(newSku);
    if (encOld !== oldSku && out.includes(encOld)) out = out.split(encOld).join(encNew);
  }
  return out;
}

function remapUrlList(urls, skuMap) {
  if (!Array.isArray(urls)) return { next: urls, changed: false };
  let changed = false;
  const next = urls.map((u) => {
    if (typeof u !== 'string') return u;
    const mapped = remapSkuOccurrences(u, skuMap);
    if (mapped !== u) changed = true;
    return mapped;
  });
  return { next, changed };
}

function remapSkuArray(skus, skuMap) {
  if (!Array.isArray(skus)) return { next: skus, changed: false };
  let changed = false;
  const next = skus.map((s) => {
    if (typeof s !== 'string') return s;
    const mapped = skuMap.get(s) || remapEoSkuToLo(s);
    if (mapped && mapped !== s) {
      changed = true;
      return mapped;
    }
    return s;
  });
  return { next, changed };
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Falta GOOGLE_APPLICATION_CREDENTIALS (ruta al service account JSON).');
  process.exit(1);
}

if (!projectId || !ALLOWED.has(projectId)) {
  console.error(
    `Debes pasar --project ${PROD_PROJECT} o --project ${DEV_PROJECT} (recibido: "${projectId || ''}").`
  );
  process.exit(1);
}

const bucketByProject = {
  [PROD_PROJECT]: 'sasa-ecuador.firebasestorage.app',
  [DEV_PROJECT]: 'sasa-ecuador-dev.firebasestorage.app',
};

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId,
  storageBucket: bucketByProject[projectId],
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

console.log(`Proyecto: ${projectId}`);
console.log(`Bucket: ${bucket.name}`);
console.log(`Modo: ${apply ? 'APLICAR cambios' : 'dry-run (no escribe)'}`);
console.log(`Storage: ${doStorage ? (apply ? 'copiar/renombrar' : 'inspeccionar') : 'omitido'}`);
console.log('');

const stats = {
  inventory: 0,
  purchaseOrders: 0,
  consignments: 0,
  invoices: 0,
  inventoryMedia: 0,
  cmsContent: 0,
  autoconsumo: 0,
  storageCopied: 0,
  conflicts: [],
  samples: [],
};

async function commitBatches(ops) {
  if (!apply || ops.length === 0) return;
  const CHUNK = 400;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch();
    for (const { ref, data } of ops.slice(i, i + CHUNK)) {
      batch.update(ref, data);
    }
    await batch.commit();
  }
}

async function copyStoragePrefix(oldSku, newSku) {
  const prefixes = [
    `images/inventory/by-sku/${oldSku}/`,
    `images/cms/by-sku/${oldSku}/`,
    `barcodes/${oldSku}`,
  ];
  for (const prefix of prefixes) {
    const [files] = await bucket.getFiles({ prefix });
    for (const file of files) {
      const destName = file.name.split(oldSku).join(newSku);
      if (destName === file.name) continue;
      if (!apply) {
        stats.storageCopied += 1;
        continue;
      }
      const dest = bucket.file(destName);
      const [exists] = await dest.exists();
      if (!exists) {
        await file.copy(dest);
      }
      stats.storageCopied += 1;
    }
  }
}

// --- Build SKU map from inventory + any EO sku elsewhere ---
const skuMap = new Map();
const existingSkus = new Set();

{
  const snap = await db.collection('inventory').get();
  for (const doc of snap.docs) {
    const sku = String(doc.data().sku || '').trim();
    if (sku) existingSkus.add(sku);
  }
  for (const doc of snap.docs) {
    const data = doc.data();
    const sku = String(data.sku || '').trim();
    const next = remapEoSkuToLo(sku);
    if (!next) continue;
    if (existingSkus.has(next) && next !== sku) {
      stats.conflicts.push({ collection: 'inventory', id: doc.id, from: sku, to: next });
      continue;
    }
    skuMap.set(sku, next);
  }
}

console.log(`SKU map (EO→LO): ${skuMap.size} entradas`);
if (stats.conflicts.length) {
  console.error('Conflictos (destino LO ya existe). Abortando sin escribir.');
  console.error(stats.conflicts.slice(0, 20));
  process.exit(2);
}

function pushSample(kind, id, detail) {
  if (stats.samples.length < 25) stats.samples.push({ kind, id, ...detail });
}

// --- inventory ---
{
  const snap = await db.collection('inventory').get();
  const ops = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const patch = {};
    const oldSku = String(data.sku || '').trim();
    const newSku = skuMap.get(oldSku) || remapEoSkuToLo(oldSku);
    if (newSku && newSku !== oldSku) patch.sku = newSku;

    const newLine = remapLine(data.line);
    if (newLine) patch.line = newLine;

    if (Array.isArray(data.images)) {
      const { next, changed } = remapUrlList(data.images, skuMap);
      if (changed) patch.images = next;
    }
    if (Array.isArray(data.sourceImages)) {
      const { next, changed } = remapUrlList(data.sourceImages, skuMap);
      if (changed) patch.sourceImages = next;
    }
    if (typeof data.barcodeLabelUrl === 'string' && data.barcodeLabelUrl) {
      const mapped = remapSkuOccurrences(data.barcodeLabelUrl, skuMap);
      if (mapped !== data.barcodeLabelUrl) patch.barcodeLabelUrl = mapped;
    }
    if (Array.isArray(data.billOfMaterials)) {
      let bomChanged = false;
      const bom = data.billOfMaterials.map((row) => {
        if (!row || typeof row !== 'object') return row;
        const s = String(row.sku || '').trim();
        const mapped = skuMap.get(s) || remapEoSkuToLo(s);
        if (mapped && mapped !== s) {
          bomChanged = true;
          return { ...row, sku: mapped };
        }
        return row;
      });
      if (bomChanged) patch.billOfMaterials = bom;
    }

    if (Object.keys(patch).length === 0) continue;
    stats.inventory += 1;
    pushSample('inventory', doc.id, { from: oldSku, to: patch.sku || oldSku, line: patch.line });
    ops.push({ ref: doc.ref, data: patch });
    if (doStorage && patch.sku) {
      await copyStoragePrefix(oldSku, patch.sku);
    }
  }
  await commitBatches(ops);
}

// --- purchaseOrders ---
{
  const snap = await db.collection('purchaseOrders').get();
  const ops = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const patch = {};
    const oldSku = String(data.sku || '').trim();
    const newSku = skuMap.get(oldSku) || remapEoSkuToLo(oldSku);
    if (newSku && newSku !== oldSku) {
      patch.sku = newSku;
      skuMap.set(oldSku, newSku);
    }
    const newLine = remapLine(data.line);
    if (newLine) patch.line = newLine;
    if (typeof data.barcodeLabelUrl === 'string' && data.barcodeLabelUrl) {
      const mapped = remapSkuOccurrences(data.barcodeLabelUrl, skuMap);
      if (mapped !== data.barcodeLabelUrl) patch.barcodeLabelUrl = mapped;
    }
    if (Object.keys(patch).length === 0) continue;
    stats.purchaseOrders += 1;
    pushSample('purchaseOrders', doc.id, { from: oldSku, to: patch.sku || oldSku });
    ops.push({ ref: doc.ref, data: patch });
    if (doStorage && patch.sku) await copyStoragePrefix(oldSku, patch.sku);
  }
  await commitBatches(ops);
}

// --- consignments ---
{
  const snap = await db.collection('consignments').get();
  const ops = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const items = Array.isArray(data.items) ? data.items : [];
    let changed = false;
    const nextItems = items.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const row = { ...item };
      const oldSku = String(row.sku || '').trim();
      const newSku = skuMap.get(oldSku) || remapEoSkuToLo(oldSku);
      if (newSku && newSku !== oldSku) {
        row.sku = newSku;
        changed = true;
      }
      const newLine = remapLine(row.line);
      if (newLine) {
        row.line = newLine;
        changed = true;
      }
      return row;
    });
    if (!changed) continue;
    stats.consignments += 1;
    pushSample('consignments', doc.id, { itemsTouched: true });
    ops.push({ ref: doc.ref, data: { items: nextItems } });
  }
  await commitBatches(ops);
}

// --- invoices ---
{
  const snap = await db.collection('invoices').get();
  const ops = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const items = Array.isArray(data.items) ? data.items : [];
    let changed = false;
    const nextItems = items.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const row = { ...item };
      const oldSku = String(row.sku || '').trim();
      const newSku = skuMap.get(oldSku) || remapEoSkuToLo(oldSku);
      if (newSku && newSku !== oldSku) {
        row.sku = newSku;
        changed = true;
      }
      const newLine = remapLine(row.line);
      if (newLine) {
        row.line = newLine;
        changed = true;
      }
      return row;
    });
    if (!changed) continue;
    stats.invoices += 1;
    pushSample('invoices', doc.id, { itemsTouched: true });
    ops.push({ ref: doc.ref, data: { items: nextItems } });
  }
  await commitBatches(ops);
}

// --- inventoryMedia ---
{
  const snap = await db.collection('inventoryMedia').get();
  const ops = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const patch = {};
    const oldSku = String(data.sku || '').trim();
    const newSku = skuMap.get(oldSku) || remapEoSkuToLo(oldSku);
    if (newSku && newSku !== oldSku) patch.sku = newSku;
    if (Array.isArray(data.images)) {
      const { next, changed } = remapUrlList(data.images, skuMap);
      if (changed) patch.images = next;
    }
    if (Object.keys(patch).length === 0) continue;
    stats.inventoryMedia += 1;
    ops.push({ ref: doc.ref, data: patch });
    if (doStorage && patch.sku) await copyStoragePrefix(oldSku, patch.sku);
  }
  await commitBatches(ops);
}

// --- cmsContent ---
{
  const snap = await db.collection('cmsContent').get();
  const ops = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const patch = {};
    const linked = remapSkuArray(data.linkedProductIds, skuMap);
    if (linked.changed) patch.linkedProductIds = linked.next;
    const linkedImg = remapSkuArray(data.imageLinkedSkus, skuMap);
    if (linkedImg.changed) patch.imageLinkedSkus = linkedImg.next;
    if (Array.isArray(data.images)) {
      const { next, changed } = remapUrlList(data.images, skuMap);
      if (changed) patch.images = next;
    }
    if (Object.keys(patch).length === 0) continue;
    stats.cmsContent += 1;
    ops.push({ ref: doc.ref, data: patch });
  }
  await commitBatches(ops);
}

// --- autoconsumo ---
{
  const snap = await db.collection('autoconsumo').get();
  const ops = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const items = Array.isArray(data.items) ? data.items : [];
    let changed = false;
    const nextItems = items.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const row = { ...item };
      const oldSku = String(row.sku || '').trim();
      const newSku = skuMap.get(oldSku) || remapEoSkuToLo(oldSku);
      if (newSku && newSku !== oldSku) {
        row.sku = newSku;
        changed = true;
      }
      const newLine = remapLine(row.line);
      if (newLine) {
        row.line = newLine;
        changed = true;
      }
      return row;
    });
    if (!changed) continue;
    stats.autoconsumo += 1;
    ops.push({ ref: doc.ref, data: { items: nextItems } });
  }
  await commitBatches(ops);
}

console.log('\nResumen:');
console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  storage: doStorage,
  skuMapped: skuMap.size,
  docs: {
    inventory: stats.inventory,
    purchaseOrders: stats.purchaseOrders,
    consignments: stats.consignments,
    invoices: stats.invoices,
    inventoryMedia: stats.inventoryMedia,
    cmsContent: stats.cmsContent,
    autoconsumo: stats.autoconsumo,
  },
  storageFilesTouched: stats.storageCopied,
  samples: stats.samples,
}, null, 2));

if (!apply) {
  console.log('\nDry-run OK. Para aplicar en este proyecto:');
  console.log(
    `  GOOGLE_APPLICATION_CREDENTIALS=... node scripts/migrate-enchapado-to-laminado.mjs --project ${projectId} --apply --storage`
  );
}

process.exit(0);
