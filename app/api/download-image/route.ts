import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
    }

    // Fetch the image from the URL (server-side, no CORS restrictions)
    const response = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get the media file as a blob
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    // Preserve the original content type from the response
    // If not available, try to detect from URL or default appropriately
    let contentType = blob.type;
    if (!contentType || contentType === 'application/octet-stream') {
      const urlLower = imageUrl.toLowerCase();
      if (urlLower.includes('.mp4') || urlLower.includes('video/mp4')) {
        contentType = 'video/mp4';
      } else if (urlLower.includes('.mov') || urlLower.includes('video/quicktime')) {
        contentType = 'video/quicktime';
      } else if (urlLower.includes('.webm') || urlLower.includes('video/webm')) {
        contentType = 'video/webm';
      } else if (urlLower.includes('.avi') || urlLower.includes('video/x-msvideo')) {
        contentType = 'video/x-msvideo';
      } else if (urlLower.includes('/videos/')) {
        // Default to mp4 if in videos folder but no extension detected
        contentType = 'video/mp4';
      } else {
        // Default to image/jpeg for images
        contentType = 'image/jpeg';
      }
    }

    // Return the media file with proper headers
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': blob.size.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('Error downloading image:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to download image' },
      { status: 500 }
    );
  }
}

