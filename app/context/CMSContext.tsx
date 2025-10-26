'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { CMSContent, ContentStatus } from '../types';

interface CMSContextType {
  content: CMSContent[];
  addContent: (content: Omit<CMSContent, 'id' | 'metadata'>) => void;
  updateContent: (id: string, updates: Partial<CMSContent>) => void;
  deleteContent: (id: string) => void;
  updateContentStatus: (id: string, status: ContentStatus, userId: string, notes?: string) => void;
  getContentByStatus: (status: ContentStatus) => CMSContent[];
  getContentBySKU: (sku: string) => CMSContent[];
  getContentStats: () => {
    total: number;
    draft: number;
    submitted: number;
    approved: number;
    published: number;
  };
}

const CMSContext = createContext<CMSContextType | undefined>(undefined);

export function CMSProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<CMSContent[]>([]);

  // Load content from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('cms-content');
    if (saved) {
      const parsedContent = JSON.parse(saved);
      // Convert dates back to Date objects
      const contentWithDates = parsedContent.map((item: any) => ({
        ...item,
        statusHistory: item.statusHistory.map((h: any) => ({
          ...h,
          timestamp: new Date(h.timestamp),
        })),
        metadata: {
          ...item.metadata,
          createdAt: new Date(item.metadata.createdAt),
          updatedAt: new Date(item.metadata.updatedAt),
          publishedAt: item.metadata.publishedAt ? new Date(item.metadata.publishedAt) : undefined,
          archivedAt: item.metadata.archivedAt ? new Date(item.metadata.archivedAt) : undefined,
        },
      }));
      setContent(contentWithDates);
    }
  }, []);

  // Save content to localStorage whenever it changes
  useEffect(() => {
    if (content.length > 0) {
      localStorage.setItem('cms-content', JSON.stringify(content));
    }
  }, [content]);

  const addContent = (contentData: Omit<CMSContent, 'id' | 'metadata'>) => {
    const newContent: CMSContent = {
      ...contentData,
      id: `cms-${Date.now()}`,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
    setContent((prev) => [...prev, newContent]);
  };

  const updateContent = (id: string, updates: Partial<CMSContent>) => {
    setContent((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              ...updates,
              metadata: {
                ...item.metadata,
                updatedAt: new Date(),
              },
            }
          : item
      )
    );
  };

  const deleteContent = (id: string) => {
    setContent((prev) => prev.filter((item) => item.id !== id));
    // Also update localStorage
    const current = [...content].filter((item) => item.id !== id);
    localStorage.setItem('cms-content', JSON.stringify(current));
  };

  const updateContentStatus = (id: string, status: ContentStatus, userId: string, notes?: string) => {
    setContent((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            status,
            statusHistory: [
              ...item.statusHistory,
              {
                status,
                timestamp: new Date(),
                userId,
                notes,
              },
            ],
            metadata: {
              ...item.metadata,
              updatedAt: new Date(),
              ...(status === 'published' && { publishedAt: new Date() }),
              ...(status === 'archived' && { archivedAt: new Date() }),
            },
          };
        }
        return item;
      })
    );
  };

  const getContentByStatus = (status: ContentStatus) => {
    return content.filter((item) => item.status === status);
  };

  const getContentBySKU = (sku: string) => {
    return content.filter((item) => item.linkedProductIds.includes(sku));
  };

  const getContentStats = () => {
    return {
      total: content.length,
      draft: content.filter((item) => item.status === 'draft').length,
      submitted: content.filter((item) => item.status === 'submitted').length,
      approved: content.filter((item) => item.status === 'approved').length,
      published: content.filter((item) => item.status === 'published').length,
    };
  };

  return (
    <CMSContext.Provider
      value={{
        content,
        addContent,
        updateContent,
        deleteContent,
        updateContentStatus,
        getContentByStatus,
        getContentBySKU,
        getContentStats,
      }}
    >
      {children}
    </CMSContext.Provider>
  );
}

export function useCMS() {
  const context = useContext(CMSContext);
  if (context === undefined) {
    throw new Error('useCMS must be used within a CMSProvider');
  }
  return context;
}
