# Firebase Permissions Setup Guide

## Summary

Your app now uses **Firestore to manage user permissions dynamically**.

### Current Setup:
- ✅ Users are stored in Firestore with role information
- ✅ Permissions are role-based (admin vs marketing)
- ✅ Roles automatically assigned on first login
- ✅ Permissions enforced throughout the app

### How It Works:

1. **On First Login:**
   - User logs in with Firebase Auth
   - App creates a document in Firestore `users/{userId}`
   - Role is automatically assigned based on email

2. **Role Assignment:**
   - `admin@sasa.com` → admin role
   - All other users → marketing role (default)

3. **Permission Checks:**
   - Components call `hasPermission('permission.name')`
   - System checks if user's role has that permission

## Setting Up Firestore:

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select project: `sasa-a837d`
3. Click **Firestore Database** in left sidebar
4. Click **Create Database**
5. Choose **Start in test mode** (for development)
6. Select a location (choose closest to you)
7. Click **Enable**

## Changing User Roles:

### Method 1: In Firebase Console
1. Firestore → `users` collection
2. Click on user document
3. Click **Edit**
4. Change `role` field to `admin` or `marketing`
5. Save

### Method 2: Code Update
Edit `app/services/userRoles.ts` - `createUserDocument` function to add more admin emails:

```typescript
// Assign role based on email
let role: UserRole = 'marketing';
if (email === 'admin@sasa.com') {
  role = 'admin';
}
// Add your email here to be admin
if (email === 'your-email@sasa.com') {
  role = 'admin';
}
```

## Available Permissions:

### Admin Permissions:
- inventory.view, inventory.edit, inventory.delete
- purchase.view, purchase.edit, purchase.delete
- suppliers.view, suppliers.edit, suppliers.delete
- analytics.view
- costs.view, costs.edit
- cms.view, cms.edit, cms.delete
- users.manage

### Marketing Permissions:
- inventory.view
- cms.view, cms.edit
- inventory.view.availability
- images.download
- content.export

## Adding More Roles/Permissions:

Edit `app/services/userRoles.ts`:

```typescript
export type UserRole = 'admin' | 'marketing' | 'warehouse';

export const PERMISSIONS = {
  admin: [...],
  marketing: [...],
  warehouse: [
    'inventory.view',
    'inventory.edit',
    'purchase.view',
  ]
};
```

