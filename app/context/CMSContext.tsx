'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { CMSContent, ContentStatus } from '../types';
import * as cmsService from '../services/cmsService';

interface CMSContextType {
  content: CMSContent[];
  isLoading: boolean;
  addContent: (content: Omit<CMSContent, 'id' | 'metadata'>) => Promise<void>;
  updateContent: (id: string, updates: Partial<CMSContent>) => Promise<void>;
  deleteContent: (id: string) => Promise<void>;
  updateContentStatus: (id: string, status: ContentStatus, userId: string, notes?: string) => Promise<void>;
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
  const [isLoading, setIsLoading] = useState(true);

  // Load content from Firestore on mount
  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    try {
      setIsLoading(true);
      const data = await cmsService.getCMSContent();
      setContent(data);
    } catch (error) {
      console.error('Error loading CMS content:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addContent = async (contentData: Omit<CMSContent, 'id' | 'metadata'>) => {
    try {
      const newId = await cmsService.addCMSContent(contentData);
      const newContent: CMSContent = {
        ...contentData,
        id: newId,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      setContent((prev) => [...prev, newContent]);
    } catch (error) {
      console.error('Error adding CMS content:', error);
      throw error;
    }
  };

  const updateContent = async (id: string, updates: Partial<CMSContent>) => {
    try {
      await cmsService.updateCMSContent(id, updates);
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
    } catch (error) {
      console.error('Error updating CMS content:', error);
      throw error;
    }
  };

  const deleteContent = async (id: string) => {
    try {
      await cmsService.deleteCMSContent(id);
      setContent((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error('Error deleting CMS content:', error);
      throw error;
    }
  };

  const updateContentStatus = async (id: string, status: ContentStatus, userId: string, notes?: string) => {
    try {
      await cmsService.updateCMSContentStatus(id, status, userId, notes);
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
    } catch (error) {
      console.error('Error updating CMS content status:', error);
      throw error;
    }
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
        isLoading,
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
