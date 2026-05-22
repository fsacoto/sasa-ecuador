'use client';

import { createContext, useContext, useEffect, ReactNode } from 'react';
import esMessages from '../locales/es.json';

type Messages = typeof esMessages;

interface TranslationContextType {
  t: (key: string) => string;
  /** Traducción con texto por defecto si la clave no existe. */
  tf: (key: string, fallback: string) => string;
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
  const tf = (key: string, fallback: string): string => {
    const v = resolveMessage(key, esMessages);
    return v === key ? fallback : v;
  };

  useEffect(() => {
    document.documentElement.lang = 'es';
  }, []);

  return (
    <TranslationContext.Provider value={{ t, tf, messages: esMessages }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (context === undefined) {
    const t = (key: string) => resolveMessage(key, esMessages);
    return {
      t,
      tf: (key: string, fallback: string) => {
        const v = resolveMessage(key, esMessages);
        return v === key ? fallback : v;
      },
      messages: esMessages,
    };
  }
  return context;
}
