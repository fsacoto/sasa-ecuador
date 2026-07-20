import { NextRequest } from 'next/server';
import {
  isValidStoreApiKey,
  storeApiJson,
  storeApiOptions,
  storeApiUnauthorizedResponse,
  withStoreApiCors,
} from '../../../../lib/storeApiAuth';
import { getStoreProductBySlug } from '../../../../services/storeInventoryService';

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function OPTIONS(request: NextRequest) {
  return storeApiOptions(request);
}

export async function GET(request: NextRequest, context: RouteContext) {
  if (!isValidStoreApiKey(request)) {
    return withStoreApiCors(storeApiUnauthorizedResponse(), request);
  }

  try {
    const { slug } = await context.params;
    const normalizedSlug = decodeURIComponent(slug).trim();

    if (!normalizedSlug) {
      return storeApiJson({ error: 'Missing product slug.' }, request, { status: 400 });
    }

    const product = await getStoreProductBySlug(normalizedSlug);
    if (!product) {
      return storeApiJson({ error: 'Product not found.' }, request, { status: 404 });
    }

    return storeApiJson({ product }, request);
  } catch (error: unknown) {
    console.error('[store/products/[slug]] GET failed:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to load store product';
    return storeApiJson({ error: message }, request, { status: 500 });
  }
}
