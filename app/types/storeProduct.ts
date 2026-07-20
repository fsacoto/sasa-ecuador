/** Product shape consumed by Tienda SASA Ecuador. */
export type StoreCategory = 'earrings' | 'necklaces' | 'rings' | 'bracelets';

export type StoreMaterial = 'gold-filled' | 'gold-plated' | 'sterling-silver';

export interface StoreProduct {
  id: string;
  slug: string;
  name: string;
  price: number;
  category: StoreCategory;
  material: StoreMaterial;
  images: string[];
  description: string;
  details: string;
  care: string;
  stock: number;
  isBestSeller: boolean;
  isNew: boolean;
  variants: string[];
}

/** Optional fields that can be added to Firestore `inventory` documents. */
export interface InventoryStoreFields {
  slug?: string;
  storeActive?: boolean;
  details?: string;
  care?: string;
  isBestSeller?: boolean;
  isNew?: boolean;
  variants?: string[];
}

export const STORE_CATEGORIES: StoreCategory[] = [
  'earrings',
  'necklaces',
  'rings',
  'bracelets',
];

export function isStoreCategory(value: string): value is StoreCategory {
  return (STORE_CATEGORIES as string[]).includes(value);
}
