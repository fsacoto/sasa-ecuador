'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
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

/** Result of requesting a password reset email. */
export type ResetPasswordOutcome = 'sent' | 'not-found' | 'failed';

/** Result of email/password sign-in. */
export type LoginOutcome = 'success' | 'wrong-password' | 'email-not-found' | 'failed';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  resetPassword: (email: string) => Promise<ResetPasswordOutcome>;
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

  const resolveCredentialFailure = async (trimmedEmail: string): Promise<LoginOutcome> => {
    try {
      const methods = await fetchSignInMethodsForEmail(auth, trimmedEmail);
      return methods.length === 0 ? 'email-not-found' : 'wrong-password';
    } catch {
      return 'failed';
    }
  };

  const login = async (email: string, password: string): Promise<LoginOutcome> => {
    try {
      const trimmedEmail = email.trim();

      if (!trimmedEmail || !password) {
        return 'failed';
      }

      await signInWithEmailAndPassword(auth, trimmedEmail, password);
      return 'success';
    } catch (error) {
      // Handle Firebase Auth errors
      if (error instanceof FirebaseError) {
        const errorCode = error.code;
        console.error('Login error:', errorCode, error.message);
        
        switch (errorCode) {
          case 'auth/user-not-found':
            return 'email-not-found';
          case 'auth/wrong-password':
            return 'wrong-password';
          case 'auth/invalid-credential':
            return await resolveCredentialFailure(email.trim());
          case 'auth/invalid-email':
          case 'auth/user-disabled':
            return 'failed';
          case 'auth/too-many-requests':
            console.error('Too many login attempts. Please try again later.');
            return 'failed';
          case 'auth/network-request-failed':
            console.error('Network error. Please check your connection.');
            return 'failed';
          default:
            console.error('Unexpected authentication error:', errorCode);
            return 'failed';
        }
      }
      
      // Handle non-FirebaseError errors
      console.error('Login error:', error);
      return 'failed';
    }
  };

  const resetPassword = async (email: string): Promise<ResetPasswordOutcome> => {
    const trimmed = email.trim();
    if (!trimmed) return 'failed';
    try {
      // If unknown addresses always show success (green) with no reset email: Firebase Console →
      // Authentication → Settings → User actions → Email enumeration protection – turn OFF so
      // `auth/user-not-found` is returned for unregistered addresses.

      // Continue URL must be an authorized domain in Firebase Console (e.g. localhost + prod).
      const continueUrl =
        typeof window !== 'undefined' && window.location?.origin
          ? `${window.location.origin}/`
          : undefined;
      await sendPasswordResetEmail(
        auth,
        trimmed,
        continueUrl ? { url: continueUrl } : undefined
      );
      return 'sent';
    } catch (error) {
      if (error instanceof FirebaseError) {
        console.error('Password reset error:', error.code, error.message);
        if (error.code === 'auth/user-not-found') {
          return 'not-found';
        }
      } else {
        console.error('Password reset error:', error);
      }
      return 'failed';
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
