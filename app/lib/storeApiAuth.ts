import { NextRequest, NextResponse } from 'next/server';

export function getStoreApiKey(): string | undefined {
  const key = process.env.STORE_API_KEY?.trim();
  return key || undefined;
}

export function readProvidedApiKey(request: NextRequest): string | null {
  const headerKey = request.headers.get('x-api-key')?.trim();
  if (headerKey) return headerKey;

  const auth = request.headers.get('authorization')?.trim();
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  return null;
}

export function isValidStoreApiKey(request: NextRequest): boolean {
  const expected = getStoreApiKey();
  const provided = readProvidedApiKey(request);
  if (!expected || !provided) return false;
  return provided === expected;
}

export function storeApiUnauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Unauthorized. Provide a valid X-API-Key or Authorization: Bearer token.' },
    { status: 401 }
  );
}

function resolveCorsOrigin(requestOrigin: string | null): string {
  const configured = process.env.STORE_API_CORS_ORIGIN?.trim();
  if (!configured || configured === '*') return '*';
  if (!requestOrigin) return configured.split(',')[0]?.trim() || '*';

  const allowed = configured.split(',').map((o) => o.trim()).filter(Boolean);
  return allowed.includes(requestOrigin) ? requestOrigin : allowed[0] || '*';
}

export function withStoreApiCors(response: NextResponse, request: NextRequest): NextResponse {
  const origin = resolveCorsOrigin(request.headers.get('origin'));
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
  response.headers.set('Vary', 'Origin');
  return response;
}

export function storeApiJson(
  data: unknown,
  request: NextRequest,
  init?: { status?: number }
): NextResponse {
  const response = NextResponse.json(data, { status: init?.status ?? 200 });
  return withStoreApiCors(response, request);
}

export function storeApiOptions(request: NextRequest): NextResponse {
  return withStoreApiCors(new NextResponse(null, { status: 204 }), request);
}
