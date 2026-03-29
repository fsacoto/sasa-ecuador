'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { CMSContent, CMSContentDraftInput, ContentStatus } from '../types';
import * as cmsService from '../services/cmsService';

interface CMSContextType {
  content: CMSContent[];
  isLoading: boolean;
  addContent: (content: CMSContentDraftInput) => Promise<void>;
  updateContent: (id: string, updates: Partial<CMSContent>) => Promise<void>;
  deleteContent: (id: string) => Promise<void>;
  updateContentStatus: (id: string, status: ContentStatus, userId: string, notes?: string) => Promise<void>;
  resubmitRejectedContent: (id: string, userId: string, changesNotes: string) => Promise<void>;
  getContentByStatus: (status: ContentStatus) => CMSContent[];
  getContentBySKU: (sku: string) => CMSContent[];
  getContentStats: () => {
    total: number;
    draft: number;
    submitted: number;
    approved: number;
    published: number;
    archived: number;
    rejected: number;
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

  const addContent = async (contentData: CMSContentDraftInput) => {
    const newId = await cmsService.createCMSDraft(contentData);
    const now = new Date();
    const newContent: CMSContent = {
      ...contentData,
      id: newId,
      status: 'draft',
      statusHistory: [
        {
          status: 'draft',
          timestamp: now,
          userId: contentData.authorId || '',
        },
      ],
      metadata: {
        createdAt: now,
        updatedAt: now,
      },
    };
    setContent((prev) => [newContent, ...prev]);
    // Do not await — a hanging full-collection read left the UI stuck on "Saving…"
    void cmsService.getCMSContent().then(setContent).catch((err) => {
      console.error('CMS list refresh after create failed (draft was saved):', err);
    });
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
            // If rejecting already rejected content, don't duplicate the status history entry
            let newStatusHistory = [...item.statusHistory];
            if (status === 'rejected' && item.status === 'rejected') {
              // Update the last rejected entry instead of adding a new one
              const lastRejectedIndex = newStatusHistory.findLastIndex(h => h.status === 'rejected');
              if (lastRejectedIndex !== -1 && notes) {
                newStatusHistory[lastRejectedIndex] = {
                  ...newStatusHistory[lastRejectedIndex],
                  notes: notes,
                  timestamp: new Date(),
                  userId,
                };
              }
            } else {
              newStatusHistory = [
                ...newStatusHistory,
                {
                  status,
                  timestamp: new Date(),
                  userId,
                  notes,
                },
              ];
            }
            
            return {
              ...item,
              status,
              statusHistory: newStatusHistory,
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

  const resubmitRejectedContent = async (id: string, userId: string, changesNotes: string) => {
    try {
      await cmsService.resubmitRejectedContent(id, userId, changesNotes);
      setContent((prev) =>
        prev.map((item) => {
          if (item.id === id) {
            const resubmissionCount = (item.metadata.resubmissionCount || 0) + 1;
            return {
              ...item,
              status: 'submitted', // Status changes to submitted when resubmitting
              statusHistory: [
                ...item.statusHistory,
                {
                  status: 'resubmitted',
                  timestamp: new Date(),
                  userId,
                  notes: changesNotes,
                },
              ],
              metadata: {
                ...item.metadata,
                updatedAt: new Date(),
                resubmissionCount,
                lastResubmittedAt: new Date(),
              },
            };
          }
          return item;
        })
      );
    } catch (error) {
      console.error('Error resubmitting rejected content:', error);
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
      archived: content.filter((item) => item.status === 'archived').length,
      rejected: content.filter((item) => item.status === 'rejected').length,
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
        resubmitRejectedContent,
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
