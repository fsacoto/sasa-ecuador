# Firebase Storage Bucket Recovery Guide

## ⚠️ Important Note
**Deleted Firebase Storage buckets cannot be recovered.** All data stored in the bucket is permanently lost. However, you can recreate the bucket and restore your configuration.

## Step 1: Recreate the Storage Bucket

### Option A: Auto-Creation (Easiest)
Firebase will automatically create the default storage bucket when you first access it through your app. The bucket name will be:
```
YOUR_PROJECT_ID.appspot.com
```

### Option B: Manual Creation via Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Storage** in the left sidebar
4. Click **Get Started** or **Create bucket**
5. Choose your bucket settings:
   - **Location**: Select the same region as your Firestore (check `firebase.json` - currently `nam5`)
   - **Storage class**: Standard (default)
   - **Access control**: Fine-grained (to use Security Rules)
6. Click **Create**

### Option C: Manual Creation via gcloud CLI
If you have `gcloud` CLI installed:
```bash
# Set your project
gcloud config set project YOUR_PROJECT_ID

# Create the bucket (replace YOUR_PROJECT_ID with your actual project ID)
gsutil mb -p YOUR_PROJECT_ID -c STANDARD -l us-central1 gs://YOUR_PROJECT_ID.appspot.com
```

## Step 2: Deploy Storage Rules

After the bucket is created, deploy your storage rules:

```bash
firebase deploy --only storage
```

This will deploy the rules from `storage.rules` file.

## Step 3: Configure CORS Settings

### Via Firebase Console (Recommended)
1. Go to Firebase Console → **Storage**
2. Click the **Settings** (gear icon) → **CORS configuration**
3. Copy the content from `storage-cors.json`:
```json
[
  {
    "origin": ["http://localhost:3000", "https://your-production-domain.com"],
    "method": ["GET", "HEAD"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Authorization"]
  }
]
```
4. Replace `https://your-production-domain.com` with your actual production domain
5. Save the configuration

### Via gsutil CLI
```bash
# Replace YOUR_PROJECT_ID with your actual project ID
gsutil cors set storage-cors.json gs://YOUR_PROJECT_ID.appspot.com
```

### Via Firebase CLI
```bash
firebase storage:cors:set storage-cors.json
```

## Step 4: Verify Your Environment Variables

Make sure your `.env.local` (or environment variables) includes:
```
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT_ID.appspot.com
```

Or if you created a custom bucket name, use that instead.

## Step 5: Test the Storage

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Try uploading a file through your app to verify storage is working

3. Check Firebase Console → Storage to see if files are being uploaded

## Step 6: Restore Your Data (If You Have Backups)

If you have backups of your storage data:
1. Use `gsutil` to restore files:
   ```bash
   gsutil -m cp -r gs://BACKUP_BUCKET/* gs://YOUR_PROJECT_ID.appspot.com/
   ```

## Current Storage Structure

Based on your `storage.rules`, your app uses these paths:
- `/images/cms/` - CMS images (up to 50MB)
- `/images/` - Regular images (up to 5MB)
- `/barcodes/` - Barcode files
- `/videos/` - Video files (up to 50MB)
- `/documents/` - Document files
- `/public/` - Public read-only content

## Quick Recovery Commands

Run these commands in order:

```bash
# 1. Deploy storage rules
firebase deploy --only storage

# 2. Set CORS (replace YOUR_PROJECT_ID)
gsutil cors set storage-cors.json gs://YOUR_PROJECT_ID.appspot.com

# 3. Verify bucket exists
gsutil ls gs://YOUR_PROJECT_ID.appspot.com
```

## Prevention Tips

1. **Enable Object Versioning**: Consider enabling object versioning for important files
2. **Regular Backups**: Set up automated backups using `gsutil` or Firebase Backup
3. **Bucket Lock**: For production, consider enabling bucket retention policies
4. **Access Control**: Ensure only authorized users can delete buckets/files

## Need Help?

If you encounter issues:
1. Check Firebase Console → Storage for error messages
2. Verify your Firebase project ID matches your environment variables
3. Ensure you have the correct permissions (Owner or Editor role)
4. Check Firebase Console → Project Settings → Service Accounts for API access

