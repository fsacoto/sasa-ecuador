'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { auth } from '../utils/firebase';

export type UserRole = 'admin' | 'marketing';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Role mapping - In production, you'd store this in Firestore or another database
const ROLE_MAPPING: Record<string, UserRole> = {
  'admin@sasa.com': 'admin',
  'marketing@sasa.com': 'marketing',
};

// Role-based permissions
const PERMISSIONS = {
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

const getUserDisplayName = (email: string): string => {
  if (email === 'admin@sasa.com') return 'Administrator';
  if (email === 'marketing@sasa.com') return 'Marketing Team';
  return email.split('@')[0]; // Use username part of email as fallback
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const email = firebaseUser.email || '';
        const role = ROLE_MAPPING[email] || 'marketing'; // Default to marketing role
        
        const userData: User = {
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          role: role,
          name: firebaseUser.displayName || getUserDisplayName(email)
        };
        
        setUser(userData);
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setIsLoading(false);
      return true;
    } catch (error: any) {
      console.error('Login error:', error);
      setIsLoading(false);
      return false;
    }
  };

  const logout = async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    return PERMISSIONS[user.role]?.includes(permission) || false;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
