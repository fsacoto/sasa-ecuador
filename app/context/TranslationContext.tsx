'use client';

import { createContext, useContext, useEffect, ReactNode } from 'react';
import esMessages from '../locales/es.json';

type Messages = typeof esMessages;

interface TranslationContextType {
  t: (key: string) => string;
  messages: Messages;
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

function resolveMessage(key: string, messages: Messages): string {
  const keys = key.split('.');
  let value: unknown = messages;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value && value !== null) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return key;
    }
  }

  return typeof value === 'string' ? value : key;
}

export function TranslationProvider({ children }: { children: ReactNode }) {
  const t = (key: string): string => resolveMessage(key, esMessages);

  useEffect(() => {
    document.documentElement.lang = 'es';
  }, []);

  return (
    <TranslationContext.Provider value={{ t, messages: esMessages }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (context === undefined) {
    return {
      t: (key: string) => resolveMessage(key, esMessages),
      messages: esMessages,
    };
  }
  return context;
}
