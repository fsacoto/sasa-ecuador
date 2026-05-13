// Currency Exchange Rate API Integration
// Using ExchangeRate-API Free Open Access Endpoint

import { formatDateTimeShort } from './formatDate';

export interface ExchangeRateResponse {
  result: string;
  base_code: string;
  rates: {
    [key: string]: number;
  };
  time_last_update_utc: string;
}

// Cache for exchange rates (they update once per day)
let cachedRates: ExchangeRateResponse | null = null;
let cacheTime: number = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache (API updates daily)

export async function getExchangeRates(baseCurrency: string = 'USD'): Promise<ExchangeRateResponse | null> {
  // Check cache first
  const now = Date.now();
  if (cachedRates && cachedRates.base_code === baseCurrency && (now - cacheTime) < CACHE_DURATION) {
    return cachedRates;
  }

  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${baseCurrency}`);
    
    if (!response.ok) {
      console.error('Failed to fetch exchange rates:', response.status);
      return null;
    }

    const data: ExchangeRateResponse = await response.json();
    
    if (data.result === 'success') {
      cachedRates = data;
      cacheTime = now;
      return data;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    return null;
  }
}

export function getExchangeRate(fromCurrency: string, toCurrency: string, rates: ExchangeRateResponse): number {
  if (fromCurrency === toCurrency) {
    return 1;
  }

  // If base is USD and we want to convert from another currency to USD
  if (rates.base_code === 'USD' && toCurrency === 'USD') {
    const rate = rates.rates[fromCurrency];
    return rate ? 1 / rate : 1;
  }

  // If converting from base currency
  if (fromCurrency === rates.base_code) {
    return rates.rates[toCurrency] || 1;
  }

  // If converting to base currency
  if (toCurrency === rates.base_code) {
    const rate = rates.rates[fromCurrency];
    return rate ? 1 / rate : 1;
  }

  // Converting between two non-base currencies
  const fromRate = rates.rates[fromCurrency];
  const toRate = rates.rates[toCurrency];
  
  if (fromRate && toRate) {
    return toRate / fromRate;
  }

  return 1;
}

export function formatLastUpdate(utcString: string): string {
  try {
    return formatDateTimeShort(new Date(utcString));
  } catch {
    return utcString;
  }
}
