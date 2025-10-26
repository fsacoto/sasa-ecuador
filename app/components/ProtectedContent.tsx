'use client';

import React from 'react';
import { useAuth } from '../context/AuthContext';

interface ProtectedContentProps {
  children: React.ReactNode;
  permission: string;
  fallback?: React.ReactNode;
}

export default function ProtectedContent({ children, permission, fallback }: ProtectedContentProps) {
  const { hasPermission } = useAuth();

  if (!hasPermission(permission)) {
    return fallback || (
      <div className="text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">Access Denied</h3>
        <p className="mt-1 text-sm text-gray-500">You don&apos;t have permission to view this content.</p>
      </div>
    );
  }

  return <>{children}</>;
}
