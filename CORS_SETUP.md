# Firebase Storage CORS Configuration

The bulk download feature requires CORS to be configured on your Firebase Storage bucket to allow downloads from your localhost and production domains.

## Option 1: Configure CORS via Firebase Console (Recommended)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Storage** → **Rules** tab
4. Click on **Settings** (gear icon) → **CORS configuration**
5. Add the following CORS configuration:

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

Replace `https://your-production-domain.com` with your actual production domain.

## Option 2: Configure CORS via gsutil (Command Line)

If you have `gsutil` installed:

```bash
gsutil cors set storage-cors.json gs://your-storage-bucket-name
```

Replace `your-storage-bucket-name` with your actual Firebase Storage bucket name (usually `your-project-id.appspot.com`).

## Option 3: Use Firebase CLI

```bash
firebase storage:cors:set storage-cors.json
```

## After Configuration

After setting up CORS, the bulk download feature should work properly. The Firebase SDK's `getBlob` method should be able to download images without CORS errors.

## Troubleshooting

If you still see CORS errors after configuration:
1. Make sure you've deployed the CORS configuration
2. Clear your browser cache
3. Check that your origin (localhost:3000 or production domain) is in the allowed origins list
4. Verify that the Storage rules allow read access for authenticated users

