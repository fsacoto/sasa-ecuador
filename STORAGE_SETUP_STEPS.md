# Firebase Storage Setup - Step by Step Guide

## ✅ Already Completed
- ✅ Storage rules deployed successfully
- ✅ Bucket should be created automatically

## 🔧 What You Need to Do Now

### Step 1: Verify Storage Bucket Exists

1. Go to [Firebase Console](https://console.firebase.google.com/project/sasa-a837d/storage)
2. Click on **Storage** in the left sidebar
3. You should see your bucket `sasa-a837d.appspot.com`
4. If you see "Get Started" button, click it to create the bucket

### Step 2: Configure CORS Settings (IMPORTANT)

This is needed for downloading images and barcodes to work properly.

1. In Firebase Console → **Storage**
2. Click the **Settings** (gear icon) in the top right
3. Click on **CORS configuration** tab
4. Click **Edit** or **Add CORS configuration**
5. Copy and paste this JSON configuration:

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

6. **Important:** Replace `https://your-production-domain.com` with your actual production domain (if you have one deployed on Vercel)
7. Click **Save**

### Step 3: Verify Storage Rules

The rules should already be deployed, but let's verify:

1. In Firebase Console → **Storage** → **Rules** tab
2. You should see your security rules
3. If not, you can copy and paste the rules from `storage.rules` file

Here are your current storage rules (already deployed, but you can verify):

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    
    // Helper function to check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Images storage - CMS images can be larger (up to 50MB)
    match /images/cms/{allImages=**} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated() && 
                   request.resource.size < 50 * 1024 * 1024; // 50MB max for CMS
    }
    
    // Images storage - other images limited to 5MB
    match /images/{allImages=**} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated() && 
                   request.resource.size < 5 * 1024 * 1024; // 5MB max
    }
    
    // Barcodes storage
    match /barcodes/{allPaths=**} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated();
    }
    
    // Videos storage  
    match /videos/{allVideos=**} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated() && 
                   request.resource.size < 50 * 1024 * 1024; // 50MB max
    }
    
    // Documents storage
    match /documents/{allDocuments=**} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated();
    }
    
    // Public read-only access for published content
    match /public/{allPaths=**} {
      allow read: if true;
      allow write: if isAuthenticated();
    }
  }
}
```

### Step 4: Verify Environment Variable

Make sure your app has the correct storage bucket name in environment variables:

- Variable name: `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- Value: `sasa-a837d.appspot.com`

**Check in:**
- `.env.local` file (for local development)
- Vercel Dashboard → Settings → Environment Variables (for production)

### Step 5: Test Your Storage

1. Start your app: `npm run dev`
2. Try uploading an image in your Inventory or CMS module
3. Try generating a barcode for an inventory item
4. Check Firebase Console → Storage to see if files appear

## 📁 Your Storage Structure

Your app uses these paths:
- `/barcodes/` - Barcode images (generated automatically)
- `/images/` - Regular inventory images (5MB max)
- `/images/cms/` - CMS images (50MB max)
- `/videos/` - Video files (50MB max)
- `/documents/` - Document files
- `/public/` - Public read-only content

## 🎯 Quick Checklist

- [ ] Storage bucket exists in Firebase Console
- [ ] CORS configuration added (Step 2)
- [ ] Storage rules verified (Step 3)
- [ ] Environment variable `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=sasa-a837d.appspot.com` is set
- [ ] Tested uploading an image
- [ ] Tested generating a barcode

## 🆘 If Something Doesn't Work

1. **Can't see bucket:** Click "Get Started" in Storage section
2. **CORS errors:** Make sure CORS is configured (Step 2)
3. **Permission denied:** Check that you're logged in and storage rules are deployed
4. **Upload fails:** Check browser console for errors and verify environment variables

## 📞 Need Help?

If you encounter issues:
1. Check Firebase Console → Storage for error messages
2. Check browser console for detailed errors
3. Verify all environment variables are set correctly

