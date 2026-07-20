import { NextRequest, NextResponse } from 'next/server';
import { getStoreApiKey } from '../../../lib/storeApiAuth';
import { getStoreProducts } from '../../../services/storeInventoryService';

function maskSecret(secret: string | undefined): string | null {
  if (!secret) return null;
  if (secret.length <= 8) return '••••••••';
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

function resolveBaseUrl(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'http';
  if (host) return `${proto}://${host}`;
  return 'http://localhost:3000';
}

export async function GET(request: NextRequest) {
  const checkedAt = new Date().toISOString();
  const baseUrl = resolveBaseUrl(request);
  const apiKey = getStoreApiKey();
  const corsOrigin = process.env.STORE_API_CORS_ORIGIN?.trim() || '*';
  const storefrontUrl = (
    process.env.STOREFRONT_URL ||
    process.env.NEXT_PUBLIC_STOREFRONT_URL ||
    'http://localhost:3001'
  ).replace(/\/$/, '');

  const endpoints = [
    { method: 'GET', path: '/api/store/products', description: 'Lista de productos activos' },
    {
      method: 'GET',
      path: '/api/store/products/[slug]',
      description: 'Producto por slug',
    },
    {
      method: 'GET',
      path: '/api/store/products?category=earrings|necklaces|rings|bracelets',
      description: 'Filtro por categoría',
    },
    { method: 'GET', path: '/api/store/status', description: 'Estado de conexión (este panel)' },
  ];

  let firestoreOk = false;
  let productCount = 0;
  let firestoreError: string | undefined;
  const categoryCounts: Record<string, number> = {
    earrings: 0,
    necklaces: 0,
    rings: 0,
    bracelets: 0,
  };

  try {
    const products = await getStoreProducts();
    firestoreOk = true;
    productCount = products.length;
    for (const p of products) {
      categoryCounts[p.category] = (categoryCounts[p.category] ?? 0) + 1;
    }
  } catch (error: unknown) {
    firestoreError =
      error instanceof Error ? error.message : 'No se pudo leer inventario desde Firestore';
  }

  let storefrontReachable: boolean | null = null;
  let storefrontError: string | undefined;
  let storefrontProductCount: number | undefined;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${storefrontUrl}/api/inventory/products`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      storefrontReachable = false;
      storefrontError = `HTTP ${res.status}`;
    } else {
      const data = (await res.json()) as { products?: unknown[] };
      storefrontReachable = true;
      storefrontProductCount = Array.isArray(data.products) ? data.products.length : undefined;
    }
  } catch (error: unknown) {
    storefrontReachable = false;
    storefrontError =
      error instanceof Error
        ? error.name === 'AbortError'
          ? 'Timeout al contactar el storefront'
          : error.message
        : 'Storefront no alcanzable';
  }

  let status: 'connected' | 'partial' | 'misconfigured' | 'error';
  if (!apiKey) {
    status = 'misconfigured';
  } else if (!firestoreOk) {
    status = 'error';
  } else if (storefrontReachable === true) {
    status = 'connected';
  } else {
    status = 'partial';
  }

  return NextResponse.json({
    ok: status === 'connected' || status === 'partial',
    status,
    checkedAt,
    baseUrl,
    api: {
      keyConfigured: Boolean(apiKey),
      keyHint: maskSecret(apiKey),
      authHeaders: ['X-API-Key', 'Authorization: Bearer'],
      corsOrigin,
      endpoints,
      curlExample: `curl -s "${baseUrl}/api/store/products" -H "X-API-Key: ${apiKey ? '<STORE_API_KEY>' : 'YOUR_STORE_API_KEY'}"`,
    },
    firestore: {
      ok: firestoreOk,
      productCount,
      categoryCounts,
      error: firestoreError,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null,
    },
    storefront: {
      url: storefrontUrl,
      reachable: storefrontReachable,
      productCount: storefrontProductCount,
      error: storefrontError,
      expectedEnv: {
        INVENTORY_API_URL: baseUrl,
        INVENTORY_API_KEY: apiKey ? '(mismo valor que STORE_API_KEY)' : '(definir STORE_API_KEY primero)',
      },
    },
  });
}
