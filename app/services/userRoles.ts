import { doc, getDoc, setDoc, type DocumentSnapshot } from 'firebase/firestore';
import { db } from '../utils/firebase';

/** Firebase Auth UIDs that should always have admin role (Firestore `users/{uid}` is updated on login). */
const ADMIN_USER_IDS = new Set<string>(['gqDGyqvjHoT9Rtx238A2xPGcVa73']);

export type UserRole = 'admin' | 'marketing' | 'sales';

export interface UserPermissions {
  role: UserRole;
  permissions: string[];
}

// Role-based permissions
export const PERMISSIONS = {
  admin: [
    'inventory.view',
    'inventory.edit',
    'inventory.delete',
    'purchase.view',
    'purchase.edit',
    'purchase.delete',
    'suppliers.view',
    'suppliers.edit',
    'suppliers.delete',
    'analytics.view',
    'costs.view',
    'costs.edit',
    'cms.view',
    'cms.edit',
    'cms.delete',
    'cms.approve',
    'cms.deny',
    'users.manage',
    'clients.view',
    'clients.edit',
    'clients.create',
    'sales.view',
    'sales.create',
    'sales.invoice.create',
    'media.delete',
    'settings.view',
    'settings.profile.edit'
  ],
  marketing: [
    'inventory.view',
    'cms.view',
    'cms.edit',
    'inventory.view.availability',
    'images.download',
    'content.export',
    'settings.view',
    'settings.profile.edit'
    // Note: Marketing users CANNOT delete published content, approve, or deny content
    // These permissions are admin-only: 'cms.delete', 'cms.approve', 'cms.deny'
  ],
  sales: [
    'inventory.view.ecuador',
    'inventory.view.readonly',
    'clients.view.ecuador',
    'clients.edit.ecuador',
    'clients.create.ecuador',
    'sales.view',
    'sales.create',
    'sales.invoice.create',
    'sales.invoice.pdf',
    'sales.discount.apply',
    'settings.view',
    'settings.profile.edit'
  ]
};

/** Resolve role from an already-fetched `users/{userId}` document (avoids a duplicate Firestore read after login). */
export function resolveUserRoleFromFirestoreSnapshot(
  userId: string,
  userDoc: DocumentSnapshot
): UserRole {
  if (ADMIN_USER_IDS.has(userId)) return 'admin';
  if (userDoc.exists()) {
    return normalizeUserRole(userDoc.data()?.role);
  }
  return 'marketing';
}

/** Firestore may store role with different casing; permissions map is lowercase-only. */
export function normalizeUserRole(raw: unknown): UserRole {
  if (typeof raw !== 'string') return 'marketing';
  const r = raw.toLowerCase().trim();
  if (r === 'admin' || r === 'marketing' || r === 'sales') return r;
  return 'marketing';
}

// Get user role from Firestore
export async function getUserRole(userId: string): Promise<UserRole> {
  if (ADMIN_USER_IDS.has(userId)) return 'admin';
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return normalizeUserRole(data.role);
    }
  } catch (error) {
    console.error('Error fetching user role:', error);
  }

  return 'marketing';
}

// Set user role in Firestore (admin only)
export async function setUserRole(userId: string, role: UserRole): Promise<void> {
  try {
    await setDoc(doc(db, 'users', userId), { role }, { merge: true });
  } catch (error) {
    console.error('Error setting user role:', error);
    throw error;
  }
}

// Get permissions for a user role
export function getPermissionsForRole(role: UserRole): string[] {
  return PERMISSIONS[role] || [];
}

// Check if user has specific permission
export function hasPermission(userRole: UserRole, permission: string): boolean {
  const permissions = getPermissionsForRole(userRole);
  return permissions.includes(permission);
}

// Create default user document in Firestore
export async function createUserDocument(userId: string, email: string, displayName?: string) {
  try {
    // Check if user already exists
    const userDoc = await getDoc(doc(db, 'users', userId));
    
    const emailLower = email.toLowerCase();
    
    // Check for specific users
    const isAdminByUid = ADMIN_USER_IDS.has(userId);
    const isAdminUser = emailLower === 'fernandosacoto@gmail.com' || (emailLower.includes('sacoto') && emailLower !== 'josesacoto1@gmail.com');
    const isJoseSacoto = emailLower === 'josesacoto1@gmail.com';
    
    let userName: string;
    let userRole: UserRole;
    
    if (isAdminByUid) {
      userName = displayName || email.split('@')[0];
      userRole = 'admin';
    } else if (isAdminUser) {
      userName = 'Fernando Sacoto';
      userRole = 'admin';
    } else if (isJoseSacoto) {
      userName = 'Jose Sacoto';
      userRole = 'marketing';
    } else {
      userName = displayName || email.split('@')[0];
      // Default to marketing role for new users
      // Admins can manually promote users if needed
      userRole = 'marketing';
    }
    
    if (!userDoc.exists()) {
      // Create new user document
      try {
        await setDoc(doc(db, 'users', userId), {
          email,
          name: userName,
          role: userRole,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        console.log('User document created successfully:', userId);
      } catch (createError) {
        console.error('Error creating user document (setDoc):', createError);
        if (createError instanceof Error && 'code' in createError) {
          console.error('Firestore error code:', (createError as any).code);
        }
        throw createError; // Re-throw to be caught by outer catch
      }
    } else {
      // User exists, update name and role if needed to ensure they match
      const existingData = userDoc.data();
      const needsUpdate =
        (isAdminByUid && existingData.role !== 'admin') ||
        (isAdminUser && (existingData.name !== 'Fernando Sacoto' || existingData.role !== 'admin')) ||
        (isJoseSacoto && (existingData.name !== 'Jose Sacoto' || existingData.role !== 'marketing'));
      
      if (needsUpdate) {
        try {
          await setDoc(doc(db, 'users', userId), {
            name: userName,
            role: userRole,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          console.log('User document updated successfully:', userId);
        } catch (updateError) {
          console.error('Error updating user document (setDoc merge):', updateError);
          if (updateError instanceof Error && 'code' in updateError) {
            console.error('Firestore error code:', (updateError as any).code);
          }
          throw updateError; // Re-throw to be caught by outer catch
        }
      }
    }
  } catch (error) {
    // Log detailed error information
    if (error instanceof Error) {
      console.error('Error in createUserDocument:', error.message);
      if ('code' in error) {
        const firestoreError = error as any;
        console.error('Firestore error code:', firestoreError.code);
        console.error('Firestore error details:', {
          code: firestoreError.code,
          message: firestoreError.message
        });
      }
    } else {
      console.error('Error in createUserDocument:', error);
    }
    // Don't throw - allow authentication to proceed even if user document creation fails
    // The user can still log in, and the document can be created later
  }
}

