'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { auth } from '../utils/firebase';
import { getUserRole, getPermissionsForRole, createUserDocument } from '../services/userRoles';
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
        const email = firebaseUser.email || '';
        
        // Create user document in Firestore if it doesn't exist
        await createUserDocument(firebaseUser.uid, email, firebaseUser.displayName || undefined);
        
        // Get user data from Firestore (role and name)
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        const role = await getUserRole(firebaseUser.uid);
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
    } catch (error) {
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
    const permissions = getPermissionsForRole(user.role);
    return permissions.includes(permission);
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
