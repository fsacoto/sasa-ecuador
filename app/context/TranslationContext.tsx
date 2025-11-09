'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import enMessages from '../locales/en.json';
import esMessages from '../locales/es.json';

type Locale = 'en' | 'es';
type Messages = typeof enMessages;

interface TranslationContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  messages: Messages;
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

const messagesMap: Record<Locale, Messages> = {
  en: enMessages,
  es: esMessages,
};

export function TranslationProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [mounted, setMounted] = useState(false);

  // Load locale from localStorage on mount (client-side only)
  useEffect(() => {
    setMounted(true);
    try {
      const savedLocale = localStorage.getItem('locale') as Locale;
      if (savedLocale && (savedLocale === 'en' || savedLocale === 'es')) {
        setLocaleState(savedLocale);
      }
    } catch (error) {
      // localStorage might not be available in some environments
      console.warn('Failed to load locale from localStorage:', error);
    }
  }, []);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('locale', newLocale);
    // Update HTML lang attribute
    document.documentElement.lang = newLocale;
  };

  // Translation function
  const t = (key: string): string => {
    const keys = key.split('.');
    let value: unknown = messagesMap[locale];
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Fallback to English if key not found
        value = messagesMap.en;
        for (const fallbackKey of keys) {
          if (value && typeof value === 'object' && fallbackKey in value) {
            value = value[fallbackKey];
          } else {
            return key; // Return key if not found in fallback either
          }
        }
        break;
      }
    }
    
    return typeof value === 'string' ? value : key;
  };

  // Update HTML lang attribute when locale changes
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <TranslationContext.Provider value={{ locale, setLocale, t, messages: messagesMap[locale] }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (context === undefined) {
    // Fallback to English translations if context is not available
    const fallbackT = (key: string): string => {
      const keys = key.split('.');
      let value: unknown = messagesMap.en;
      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          return key;
        }
      }
      return typeof value === 'string' ? value : key;
    };
    return {
      locale: 'en' as Locale,
      setLocale: () => {},
      t: fallbackT,
      messages: messagesMap.en,
    };
  }
  return context;
}

