# Vercel Deployment Checklist

## Pre-Deployment Checklist

### 1. Environment Variables (CRITICAL)
Make sure all these environment variables are set in Vercel Dashboard → Settings → Environment Variables:

**Required Firebase Environment Variables:**
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` (optional, for Analytics)

**How to find these values:**
1. Go to Firebase Console → Project Settings → General
2. Scroll down to "Your apps" section
3. Click on your web app (or create one if needed)
4. Copy the config values

### 2. Firebase Configuration

#### Firestore Rules
- ✅ Rules file: `firestore.rules`
- ✅ Deploy rules: `firebase deploy --only firestore:rules`
- Rules allow authenticated users to read/write all collections

#### Firestore Indexes
- ✅ Indexes file: `firestore.indexes.json`
- ✅ Deploy indexes: `firebase deploy --only firestore:indexes`
- **Important:** Some queries may fail until indexes are deployed. Check Firebase Console → Firestore → Indexes for build status.

#### Storage Rules
- ✅ Rules file: `storage.rules`
- ✅ Deploy rules: `firebase deploy --only storage`
- Rules allow authenticated users to read/write with size limits:
  - CMS images: 50MB max
  - Regular images: 5MB max
  - Videos: 50MB max

#### Storage CORS Configuration
- ⚠️ **ACTION REQUIRED:** Update `storage-cors.json` with your Vercel production domain
- Replace `https://your-production-domain.com` with your actual Vercel URL (e.g., `https://your-app.vercel.app`)
- Deploy CORS: `gsutil cors set storage-cors.json gs://YOUR_STORAGE_BUCKET`
- Or configure via Firebase Console → Storage → Settings → CORS

### 3. Build Configuration

#### Next.js Config
- ✅ Transpiles `@react-pdf/renderer` package
- ✅ ESLint configured (warnings won't block build)
- ✅ TypeScript errors will block build (as intended)

#### Build Command
- Default: `next build --turbopack` (from package.json)
- Vercel will use this automatically

### 4. Dependencies
- ✅ All dependencies listed in `package.json`
- ✅ Firebase SDK v12.4.0
- ✅ Next.js 15.5.4
- ✅ React 19.1.0

### 5. API Routes
- ✅ `/api/download-image` - No special configuration needed
- ✅ All API routes use Next.js App Router format

### 6. External Services
- ✅ Currency API: Uses public endpoint `https://open.er-api.com` (no API key needed)
- ✅ No other external API keys required

### 7. File Structure
- ✅ All components in `app/components/`
- ✅ Services in `app/services/`
- ✅ Types in `app/types.ts`
- ✅ Utils in `app/utils/`

## Deployment Steps

### Step 1: Set Environment Variables in Vercel
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add all Firebase environment variables listed above
3. Set them for Production, Preview, and Development environments

### Step 2: Deploy Firebase Rules and Indexes
```bash
# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy Firestore indexes
firebase deploy --only firestore:indexes

# Deploy Storage rules
firebase deploy --only storage
```

### Step 3: Update Storage CORS
1. Get your Vercel production URL (will be something like `https://your-app.vercel.app`)
2. Update `storage-cors.json` with your production URL
3. Deploy CORS configuration:
```bash
gsutil cors set storage-cors.json gs://YOUR_PROJECT_ID.appspot.com
```
Or configure via Firebase Console → Storage → Settings → CORS

### Step 4: Deploy to Vercel
1. Push your code to GitHub/GitLab/Bitbucket
2. Connect repository to Vercel (if not already connected)
3. Vercel will automatically detect Next.js and build
4. Monitor the build logs for any errors

### Step 5: Post-Deployment Verification
After deployment, verify:
- [ ] App loads without errors
- [ ] Firebase authentication works
- [ ] Can read/write to Firestore collections
- [ ] Can upload/download files from Storage
- [ ] All API routes work correctly
- [ ] PDF generation works
- [ ] Barcode generation works

## Common Issues & Solutions

### Issue: Build fails with ESLint errors
**Solution:** The build is configured to fail on ESLint errors. Fix the errors or temporarily set `eslint.ignoreDuringBuilds: true` in `next.config.ts`

### Issue: "Firebase: Error (auth/configuration-not-found)"
**Solution:** Make sure all Firebase environment variables are set in Vercel

### Issue: "Permission denied" errors in Firestore
**Solution:** 
1. Verify Firestore rules are deployed: `firebase deploy --only firestore:rules`
2. Check that user is authenticated
3. Verify rules allow the operation

### Issue: CORS errors when downloading images
**Solution:** 
1. Update `storage-cors.json` with your Vercel domain
2. Deploy CORS configuration
3. Clear browser cache

### Issue: Missing Firestore indexes
**Solution:** 
1. Deploy indexes: `firebase deploy --only firestore:indexes`
2. Wait for indexes to build (check Firebase Console)
3. Some queries may fail until indexes are ready

### Issue: Build fails with "Module not found"
**Solution:** 
1. Ensure all dependencies are in `package.json`
2. Run `npm install` locally to verify
3. Check that `node_modules` is not in `.gitignore` (it shouldn't be)

## Production URLs to Update

After deployment, update these files with your production URL:
1. `storage-cors.json` - Add your Vercel production domain
2. Firebase Console → Authentication → Authorized domains - Add your Vercel domain

## Monitoring

After deployment:
1. Check Vercel logs for runtime errors
2. Monitor Firebase Console for:
   - Firestore usage
   - Storage usage
   - Authentication activity
3. Set up error tracking (consider Sentry or similar)

## Security Checklist

- [ ] All environment variables are set (no hardcoded secrets)
- [ ] Firestore rules restrict access appropriately
- [ ] Storage rules restrict file sizes
- [ ] Authentication is required for all operations
- [ ] No sensitive data in client-side code
- [ ] CORS is configured correctly

## Notes

- The app uses Firebase Authentication, Firestore, and Storage
- All data operations require authentication
- Firestore indexes are required for some queries (check console for missing indexes)
- Storage CORS must be configured for image downloads to work
- The app uses Turbopack for faster builds (Next.js 15 feature)

