import { NextRequest } from 'next/server';
import {
  isValidStoreApiKey,
  storeApiJson,
  storeApiOptions,
  storeApiUnauthorizedResponse,
  withStoreApiCors,
} from '../../../lib/storeApiAuth';
import { getStoreProducts } from '../../../services/storeInventoryService';
import { isStoreCategory } from '../../../types/storeProduct';

export async function OPTIONS(request: NextRequest) {
  return storeApiOptions(request);
}

export async function GET(request: NextRequest) {
  if (!isValidStoreApiKey(request)) {
    return withStoreApiCors(storeApiUnauthorizedResponse(), request);
  }

  try {
    const categoryParam = request.nextUrl.searchParams.get('category')?.trim();

    if (categoryParam && !isStoreCategory(categoryParam)) {
      return storeApiJson(
        {
          error: 'Invalid category. Use earrings, necklaces, rings, or bracelets.',
        },
        request,
        { status: 400 }
      );
    }

    const products = await getStoreProducts(categoryParam as Parameters<typeof getStoreProducts>[0]);
    return storeApiJson({ products }, request);
  } catch (error: unknown) {
    console.error('[store/products] GET failed:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to load store products';
    return storeApiJson({ error: message }, request, { status: 500 });
  }
}
