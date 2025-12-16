#!/bin/bash

# Firebase Storage Reconnection Script
# This script helps reconnect your Firebase Storage bucket after deletion

set -e

PROJECT_ID="sasa-a837d"
BUCKET_NAME="${PROJECT_ID}.appspot.com"

echo "🔥 Firebase Storage Reconnection Script"
echo "========================================"
echo ""
echo "Project ID: $PROJECT_ID"
echo "Bucket Name: $BUCKET_NAME"
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed. Please install it first:"
    echo "   npm install -g firebase-tools"
    exit 1
fi

# Check if logged in
echo "📋 Checking Firebase authentication..."
if ! firebase projects:list &> /dev/null; then
    echo "❌ Not logged in to Firebase. Please run:"
    echo "   firebase login"
    exit 1
fi

echo "✅ Firebase CLI is ready"
echo ""

# Step 1: Deploy Storage Rules (this will create the bucket if it doesn't exist)
echo "📤 Step 1: Deploying Storage Rules..."
echo "   This will create the bucket automatically if it doesn't exist."
firebase deploy --only storage

if [ $? -eq 0 ]; then
    echo "✅ Storage rules deployed successfully"
else
    echo "❌ Failed to deploy storage rules"
    exit 1
fi

echo ""

# Step 2: Check if gsutil is available for CORS configuration
echo "📤 Step 2: Configuring CORS..."
if command -v gsutil &> /dev/null; then
    echo "   Using gsutil to set CORS configuration..."
    gsutil cors set storage-cors.json gs://${BUCKET_NAME}
    if [ $? -eq 0 ]; then
        echo "✅ CORS configured successfully via gsutil"
    else
        echo "⚠️  Failed to set CORS via gsutil. Please configure manually:"
        echo "   1. Go to Firebase Console → Storage → Settings → CORS"
        echo "   2. Copy content from storage-cors.json"
    fi
else
    echo "⚠️  gsutil not found. Please configure CORS manually:"
    echo "   1. Go to Firebase Console → Storage → Settings → CORS"
    echo "   2. Copy content from storage-cors.json"
    echo ""
    echo "   Or install gcloud SDK: https://cloud.google.com/sdk/docs/install"
fi

echo ""

# Step 3: Verify bucket exists
echo "📋 Step 3: Verifying bucket..."
if command -v gsutil &> /dev/null; then
    if gsutil ls gs://${BUCKET_NAME} &> /dev/null; then
        echo "✅ Bucket exists and is accessible"
    else
        echo "⚠️  Bucket may not exist yet. It will be created on first use."
    fi
else
    echo "⚠️  Cannot verify bucket (gsutil not available)"
    echo "   Check Firebase Console → Storage to verify bucket exists"
fi

echo ""
echo "✨ Storage reconnection complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Verify your environment variable: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${BUCKET_NAME}"
echo "   2. Test uploading a file through your app"
echo "   3. Check Firebase Console → Storage to see uploaded files"
echo ""
echo "📁 Your storage paths:"
echo "   - barcodes/     - Barcode images"
echo "   - images/       - Regular images (5MB max)"
echo "   - images/cms/   - CMS images (50MB max)"
echo "   - videos/       - Video files (50MB max)"
echo "   - documents/    - Document files"
echo "   - public/       - Public read-only content"
echo ""

