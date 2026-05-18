import { NextRequest, NextResponse } from 'next/server';

function inferContentType(imageUrl: string, blobType: string): string {
  if (blobType && blobType !== 'application/octet-stream') return blobType;
  const urlLower = imageUrl.toLowerCase();
  if (urlLower.includes('.mp4') || urlLower.includes('video/mp4')) return 'video/mp4';
  if (urlLower.includes('.mov') || urlLower.includes('video/quicktime')) return 'video/quicktime';
  if (urlLower.includes('.webm') || urlLower.includes('video/webm')) return 'video/webm';
  if (urlLower.includes('.avi') || urlLower.includes('video/x-msvideo')) return 'video/x-msvideo';
  if (urlLower.includes('/videos/')) return 'video/mp4';
  if (urlLower.includes('.png') || urlLower.includes('image/png')) return 'image/png';
  if (urlLower.includes('.webp') || urlLower.includes('image/webp')) return 'image/webp';
  return 'image/jpeg';
}

async function proxyDownload(imageUrl: string): Promise<NextResponse> {
  const response = await fetch(imageUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SASA-PDF/1.0)',
      Accept: 'image/*,*/*;q=0.8',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `Failed to fetch image: ${response.statusText}` },
      { status: response.status }
    );
  }

  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const contentType = inferContentType(imageUrl, blob.type);

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(arrayBuffer.byteLength),
      'Cache-Control': 'no-cache',
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const imageUrl = request.nextUrl.searchParams.get('url');
    if (!imageUrl) {
      return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
    }
    return proxyDownload(imageUrl);
  } catch (error: unknown) {
    console.error('Error downloading image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to download image';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

/** POST evita truncar URLs largas de Firebase (?alt=media&token=…) en la query string. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { url?: string };
    const imageUrl = body?.url?.trim();
    if (!imageUrl) {
      return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
    }
    return proxyDownload(imageUrl);
  } catch (error: unknown) {
    console.error('Error downloading image (POST):', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to download image';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

