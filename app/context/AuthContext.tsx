'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  User as FirebaseUser
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth } from '../utils/firebase';
import { getPermissionsForRole, createUserDocument, resolveUserRoleFromFirestoreSnapshot } from '../services/userRoles';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';

export type UserRole = 'admin' | 'marketing' | 'sales';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getUserDisplayName = (email: string): string => {
  // Extract username from email (everything before @)
  return email.split('@')[0];
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        try {
          const email = firebaseUser.email || '';
          
          // Create user document in Firestore if it doesn't exist
          await createUserDocument(firebaseUser.uid, email, firebaseUser.displayName || undefined);
          
          // Get user data from Firestore (role and name)
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const role = resolveUserRoleFromFirestoreSnapshot(firebaseUser.uid, userDoc);
          const userName = userDoc.exists() && userDoc.data().name 
            ? userDoc.data().name 
            : (firebaseUser.displayName || getUserDisplayName(email));
          
          const userData: User = {
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            role: role,
            name: userName
          };
          
          setUser(userData);
        } catch (error) {
          console.error('Error loading user data:', error);
          // Set user with minimal data if Firestore access fails
          const userData: User = {
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            role: 'marketing', // Default role
            name: firebaseUser.displayName || getUserDisplayName(firebaseUser.email || '')
          };
          setUser(userData);
        }
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
      // Trim email to avoid whitespace issues
      const trimmedEmail = email.trim();
      
      if (!trimmedEmail || !password) {
        setIsLoading(false);
        return false;
      }
      
      await signInWithEmailAndPassword(auth, trimmedEmail, password);
      setIsLoading(false);
      return true;
    } catch (error) {
      setIsLoading(false);
      
      // Handle Firebase Auth errors
      if (error instanceof FirebaseError) {
        const errorCode = error.code;
        console.error('Login error:', errorCode, error.message);
        
        // Handle specific error codes
        switch (errorCode) {
          case 'auth/invalid-email':
          case 'auth/user-disabled':
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            // For security, we don't reveal which specific error occurred
            // All these errors result in the same user-facing message
            return false;
          case 'auth/too-many-requests':
            console.error('Too many login attempts. Please try again later.');
            return false;
          case 'auth/network-request-failed':
            console.error('Network error. Please check your connection.');
            return false;
          default:
            console.error('Unexpected authentication error:', errorCode);
            return false;
        }
      }
      
      // Handle non-FirebaseError errors
      console.error('Login error:', error);
      return false;
    }
  };

  const resetPassword = async (email: string): Promise<boolean> => {
    const trimmed = email.trim();
    if (!trimmed) return false;
    try {
      await sendPasswordResetEmail(auth, trimmed);
      return true;
    } catch (error) {
      console.error('Password reset error:', error);
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
    const permissions = getPermissionsForRole(user.role);
    return permissions.includes(permission);
  };

  return (
    <AuthContext.Provider value={{ user, login, resetPassword, logout, isLoading, hasPermission }}>
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
