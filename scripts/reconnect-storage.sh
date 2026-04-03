#!/bin/bash

# Firebase Storage Reconnection Script
# This script helps reconnect your Firebase Storage bucket after deletion

set -e

PROJECT_ID="sasa-a837d"
# Default bucket for newer Firebase projects (must match NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET).
BUCKET_NAME="${PROJECT_ID}.firebasestorage.app"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Get the project root (parent directory of scripts/)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to project root directory
cd "$PROJECT_ROOT"

echo "🔥 Firebase Storage Reconnection Script"
echo "========================================"
echo ""
echo "Project ID: $PROJECT_ID"
echo "Bucket Name: $BUCKET_NAME"
echo "Working directory: $PROJECT_ROOT"
echo ""

# Verify we're in the project root by checking for firebase.json (using absolute path)
if [ ! -f "$PROJECT_ROOT/firebase.json" ]; then
    echo "❌ Error: firebase.json not found in $PROJECT_ROOT"
    echo "   Please ensure you're running this script from the project root"
    exit 1
fi

# Verify storage-cors.json exists (using absolute path)
if [ ! -f "$PROJECT_ROOT/storage-cors.json" ]; then
    echo "⚠️  Warning: storage-cors.json not found in $PROJECT_ROOT"
    echo "   CORS configuration will need to be done manually"
fi

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
    if [ -f "$PROJECT_ROOT/storage-cors.json" ]; then
        echo "   Using gsutil to set CORS configuration..."
        if gsutil cors set "$PROJECT_ROOT/storage-cors.json" "gs://${BUCKET_NAME}"; then
            echo "✅ CORS configured successfully on gs://${BUCKET_NAME}"
        else
            echo "⚠️  CORS failed on gs://${BUCKET_NAME}. Trying legacy appspot bucket..."
            if gsutil cors set "$PROJECT_ROOT/storage-cors.json" "gs://${PROJECT_ID}.appspot.com"; then
                echo "✅ CORS configured on gs://${PROJECT_ID}.appspot.com — set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET to match."
            else
                echo "⚠️  Failed both buckets. Configure manually:"
                echo "   gsutil cors set storage-cors.json gs://YOUR_BUCKET_ID"
                echo "   (Bucket id is in Firebase Console → Storage → Files → bucket dropdown)"
            fi
        fi
    else
        echo "⚠️  storage-cors.json not found. Please configure CORS manually:"
        echo "   1. Go to Firebase Console → Storage → Settings → CORS"
        echo "   2. Add CORS configuration manually"
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
echo "   1. Set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${BUCKET_NAME} (or your console’s exact bucket id)"
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

