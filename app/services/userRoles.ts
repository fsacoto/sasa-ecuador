import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebase';

export type UserRole = 'admin' | 'marketing';

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
    'users.manage'
  ],
  marketing: [
    'inventory.view',
    'cms.view',
    'cms.edit',
    'inventory.view.availability',
    'images.download',
    'content.export'
  ]
};

// Get user role from Firestore
export async function getUserRole(userId: string): Promise<UserRole> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return data.role || 'marketing'; // Default to marketing role
    }
  } catch (error) {
    console.error('Error fetching user role:', error);
  }
  
  // Fallback: Return default role
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
    
    if (!userDoc.exists()) {
      // Check if this is the first user (first admin)
      const usersCollection = collection(db, 'users');
      const snapshot = await getDocs(usersCollection);
      
      // First user becomes admin, all others default to marketing
      const role: UserRole = snapshot.empty ? 'admin' : 'marketing';
      
      await setDoc(doc(db, 'users', userId), {
        email,
        name: displayName || email.split('@')[0],
        role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error creating user document:', error);
  }
}

