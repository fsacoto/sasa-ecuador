# Quick Storage Setup - Final Steps

## ✅ Bucket Created Successfully!
Your bucket `sasa-a837d.firebasestorage.app` is ready!

## 🔧 Final Configuration Steps

### 1. Configure CORS (required for browser uploads)
The app uploads with the Firebase Web SDK (`PUT` / resumable). CORS must allow those methods, not only `GET`.

**Option A — `gsutil` (recommended)**  
From the repo root (install [Google Cloud SDK](https://cloud.google.com/sdk) if needed):

```bash
gsutil cors set storage-cors.json gs://YOUR_BUCKET_ID
```

Use the same bucket id as `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` (e.g. `sasa-a837d.firebasestorage.app`).  
Or run `./scripts/reconnect-storage.sh` after editing `storage-cors.json` to add your production origin.

**Option B — Console**  
Firebase Console → Storage → **⋮** / bucket settings → CORS, and paste the contents of `storage-cors.json` (add your real production `origin` and remove the placeholder domain).

### 2. Verify Environment Variable
Make sure your `.env.local` (or environment variables) has:

```
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=sasa-a837d.firebasestorage.app
```

OR (both work):

```
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=sasa-a837d.appspot.com
```

### 3. Test It!
1. Run: `npm run dev`
2. Try uploading an image or generating a barcode
3. Check Storage → Files to see your uploaded files

## 🎯 Your Storage Paths Are Ready:
- ✅ `/barcodes/` - Barcode images
- ✅ `/images/` - Inventory images (5MB max)
- ✅ `/images/cms/` - CMS images (50MB max)
- ✅ `/videos/` - Video files (50MB max)
- ✅ `/documents/` - Document files
- ✅ `/public/` - Public content

## ✨ You're All Set!
Once CORS is configured, everything should work perfectly!

