'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'admin' | 'marketing';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock users database - In production, this would be replaced with real authentication
const MOCK_USERS: User[] = [
  {
    id: '1',
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    name: 'Administrator',
    email: 'admin@sasa.com'
  },
  {
    id: '2',
    username: 'marketing',
    password: 'marketing123',
    role: 'marketing',
    name: 'Marketing Team',
    email: 'marketing@sasa.com'
  }
];

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
    'cms.view',
    'cms.edit',
    'inventory.view.availability',
    'images.download',
    'content.export'
  ]
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session on app load
    const savedUser = localStorage.getItem('sasa_user');
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        setUser(userData);
      } catch (error) {
        localStorage.removeItem('sasa_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const foundUser = MOCK_USERS.find(u => u.username === username && u.password === password);
    
    if (foundUser) {
      const userData: User = {
        id: foundUser.id,
        username: foundUser.username,
        role: foundUser.role,
        name: foundUser.name,
        email: foundUser.email
      };
      
      setUser(userData);
      localStorage.setItem('sasa_user', JSON.stringify(userData));
      setIsLoading(false);
      return true;
    }
    
    setIsLoading(false);
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('sasa_user');
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
