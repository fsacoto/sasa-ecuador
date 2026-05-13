'use client';

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { InventoryItem } from '../types';
import esMessages from '../locales/es.json';

// Traducciones solo en español (PDF)
const translate = (key: string): string => {
  const keys = key.split('.');
  let value: unknown = esMessages;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return key;
    }
  }

  return typeof value === 'string' ? value : key;
};

const translateMaterialName = (materialName: string): string => {
  const materialLower = materialName.toLowerCase();
  const materialKey = materialLower.replace(/\s+/g, '');

  const materialTranslations = esMessages.inventory?.catalog?.materialNames as Record<string, string> | undefined;
  if (materialTranslations) {
    // Check various possible keys
    const possibleKeys = [
      materialKey,
      materialLower,
      materialName.toLowerCase(),
    ];
    
    for (const key of possibleKeys) {
      if (materialTranslations[key]) {
        return materialTranslations[key];
      }
    }
    
    // Check for common material name patterns
    if (materialLower.includes('gold plated') || materialLower.includes('oro laminado')) {
      return materialTranslations.goldPlated || materialTranslations.oroLaminado || materialName.toUpperCase();
    }
    if (
      materialLower.includes('gold filled') ||
      materialLower.includes('oro relleno') ||
      materialLower.includes('bañado en oro') ||
      materialLower.includes('banado en oro') ||
      materialLower.includes('enchapado en oro')
    ) {
      return materialTranslations.goldFilled || materialTranslations.oroRelleno || materialName.toUpperCase();
    }
    if (materialLower.includes('sterling silver') || materialLower.includes('plata')) {
      return materialTranslations.sterlingSilver || materialTranslations.plata || materialName.toUpperCase();
    }
  }
  
  // If no translation found, return uppercase original
  return materialName.toUpperCase();
};

/** Reemplaza `-` y espacios para que el SKU no parta en el guion ni en espacios. */
function formatSkuNonBreaking(sku: string): string {
  return sku.replace(/-/g, '\u2011').replace(/ /g, '\u00A0');
}

/** Fondo catálogo (página). */
const CATALOG_PAGE_BG = '#FFFFFF';
/** Pastilla “línea” (material): rosa marca más intenso que el fondo. */
const CATALOG_LINE_PILL_BG = '#E8879A';
const CATALOG_LINE_PILL_TEXT = '#2D141C';

// A4 Landscape dimensions at 72 DPI: 842 × 595 px
// Margin: 32px on all sides
// Available content area: 778 × 531 px (842-64 × 595-64)
// Gap between columns: 24px
// Gap between rows: 32px
// Product block width: (778 - 24) / 2 = 377px
// Product block height: (531 - 32) / 2 = 249.5px ≈ 250px
// Left panel (image): 377 × 0.7 = 263.9px ≈ 264px
// Right panel (text): 377 × 0.3 = 113.1px ≈ 113px

const styles = StyleSheet.create({
  page: {
    backgroundColor: CATALOG_PAGE_BG,
    padding: 32,
    paddingTop: 32,
    paddingBottom: 32,
    width: 842,
    height: 595,
  },
  grid: {
    flexDirection: 'column',
    width: 778, // Available width: 842 - 64 (2×32px margins)
    height: 531, // Available height: 595 - 64 (2×32px margins)
  },
  row: {
    flexDirection: 'row',
    width: 778,
    height: 249.5, // (531 - 32) / 2 = 249.5px per row
    marginBottom: 32, // Vertical spacing between rows (32px gap)
    justifyContent: 'space-between', // Creates 24px gap between columns automatically
  },
  productBlock: {
    width: 377, // (778 - 24) / 2 = 377px per product
    height: 249.5, // (531 - 32) / 2 = 249.5px per product
    flexDirection: 'row',
  },
  imagePanel: {
    width: 264, // 70% of 377px = 263.9px ≈ 264px
    height: 249.5, // Full block height
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center',
  },
  noImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F7F7F7',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noImageText: {
    fontSize: 10,
    color: '#999',
    letterSpacing: 1,
  },
  textPanel: {
    width: 113, // 30% of 377px = 113.1px ≈ 113px - FIXED WIDTH
    height: 249.5, // Full block height - FIXED HEIGHT
    paddingLeft: 12,
    paddingTop: 9, // Top padding: 8-10px (using 9px)
    paddingRight: 4,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start', // Text at top, not centered
    alignItems: 'flex-start',
    // overflow: 'visible' removed - not supported in React PDF
    flexWrap: 'nowrap', // Prevent wrapping of child elements
  },
  materialBadge: {
    paddingTop: 5,
    paddingRight: 8,
    paddingBottom: 4,
    paddingLeft: 8,
    borderRadius: 9999, // Fully rounded pill shape
    marginTop: 0, // No extra margin-top (paddingTop handles it)
    marginBottom: 8, // 8px spacing below badge
    alignSelf: 'flex-start', // Align left, do NOT center
    display: 'flex', // Use flex for react-pdf compatibility
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CATALOG_LINE_PILL_BG,
    flexShrink: 0,
    flexGrow: 0,
    flexWrap: 'nowrap',
    maxWidth: '100%',
  },
  materialBadgeText: {
    fontSize: 10,
    fontWeight: 'normal',
    textTransform: 'uppercase',
    letterSpacing: 0.1,
    fontFamily: 'Helvetica',
    color: CATALOG_LINE_PILL_TEXT,
    flexShrink: 0,
    flexGrow: 0,
  },
  materialBadgeTextSmall: {
    fontSize: 8,
    fontWeight: 'normal',
    textTransform: 'uppercase',
    letterSpacing: 0.06,
    fontFamily: 'Helvetica',
    color: CATALOG_LINE_PILL_TEXT,
    flexShrink: 0,
    flexGrow: 0,
  },
  materialBadgeTextTiny: {
    fontSize: 7,
    fontWeight: 'normal',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    fontFamily: 'Helvetica',
    color: CATALOG_LINE_PILL_TEXT,
    flexShrink: 0,
    flexGrow: 0,
  },
  productName: {
    fontSize: 15, // 14-16px range (using 15px for balance)
    fontWeight: 'medium',
    color: '#333333',
    marginBottom: 4,
    textTransform: 'uppercase',
    lineHeight: 1.2, // Slightly more breathing room
    letterSpacing: 0.15, // +1% letter spacing (15px * 0.01 = 0.15)
    fontFamily: 'Helvetica',
    maxWidth: '100%',
    maxHeight: 18, // Single line only: 15px * 1.2 = 18px
    overflow: 'hidden',
    whiteSpace: 'nowrap', // Never wrap to second line
    textOverflow: 'ellipsis', // Truncate if too long (after font reduction)
  },
  descriptionWrap: {
    maxHeight: 30,
    overflow: 'hidden',
    width: '100%',
    marginBottom: 4,
  },
  productDescription: {
    fontSize: 7,
    fontWeight: 'normal',
    color: '#444444',
    lineHeight: 1.2,
    fontFamily: 'Helvetica',
    maxWidth: '100%',
  },
  sku: {
    fontSize: 6,
    fontWeight: 'normal',
    color: '#333333',
    marginBottom: 6,
    fontFamily: 'Helvetica',
    letterSpacing: 0.04,
    lineHeight: 1,
    maxWidth: '100%',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  categoryLine: {
    fontSize: 10,
    fontWeight: 'normal',
    color: '#333333',
    marginBottom: 8,
    fontFamily: 'Helvetica',
    letterSpacing: 0.12,
    lineHeight: 1.1,
    maxWidth: '100%',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  pricePlaceholder: {
    backgroundColor: '#F7F7F7',
    borderRadius: 16,
    height: 26,
    width: '100%',
    marginTop: 'auto', // Push to bottom
    flexShrink: 0, // Don't shrink
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 50,
    right: 50,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageNumber: {
    fontSize: 8,
    color: '#B0A598',
    letterSpacing: 0.5,
  },
});

/** Categoría u otros textos en panel estrecho: una línea, tipografía adaptativa. */
const getNarrowSingleLineStyles = (
  text: string,
  base: typeof styles.categoryLine
): (typeof styles.categoryLine | { fontSize: number; letterSpacing: number })[] => {
  const len = text.length;
  if (len <= 15) return [base];
  if (len <= 22) return [base, { fontSize: 9, letterSpacing: 0.08 }];
  if (len <= 30) return [base, { fontSize: 8, letterSpacing: 0.04 }];
  return [base, { fontSize: 7, letterSpacing: 0.02 }];
};

/** SKU muy pequeño; si sigue largo, baja aún más el cuerpo (siempre una línea). */
const getSkuSingleLineStyles = (
  text: string
): (typeof styles.sku | { fontSize: number; letterSpacing: number })[] => {
  const len = text.length;
  if (len <= 26) return [styles.sku];
  if (len <= 40) return [styles.sku, { fontSize: 5, letterSpacing: 0.02 }];
  return [styles.sku, { fontSize: 4, letterSpacing: 0.01 }];
};

const getBadgeTextStyle = (text: string) => {
  const textLength = text.length;
  if (textLength <= 10) return styles.materialBadgeText;
  if (textLength <= 16) return styles.materialBadgeTextSmall;
  return styles.materialBadgeTextTiny;
};

function CatalogProductTextColumn({ product }: { product: InventoryItem }) {
  const t = (key: string) => translate(key);
  const skuDisplay = product.sku || t('inventory.catalog.noSku');
  const skuPdf = formatSkuNonBreaking(skuDisplay);
  const descriptionTrim = (product.description || '').trim();
  const categoryTrim = (product.category || '').trim();
  const categoryDisplay = categoryTrim ? categoryTrim.toUpperCase() : '';
  const lineLabel = product.line ? translateMaterialName(product.line) : '';
  const skuTextStyles = getSkuSingleLineStyles(skuDisplay);
  const categoryTextStyles = categoryDisplay
    ? getNarrowSingleLineStyles(categoryDisplay, styles.categoryLine)
    : [];

  return (
    <View style={styles.textPanel}>
      {lineLabel ? (
        <View style={styles.materialBadge}>
          <Text style={getBadgeTextStyle(lineLabel)} wrap={false}>
            {lineLabel}
          </Text>
        </View>
      ) : null}

      {categoryDisplay ? (
        <Text style={categoryTextStyles} wrap={false}>
          {categoryDisplay}
        </Text>
      ) : null}

      <Text style={styles.productName} wrap={false}>
        {product.name ? product.name.toUpperCase() : t('inventory.catalog.noName')}
      </Text>

      {descriptionTrim ? (
        <View style={styles.descriptionWrap}>
          <Text style={styles.productDescription}>{descriptionTrim}</Text>
        </View>
      ) : null}

      <Text style={skuTextStyles} wrap={false}>
        {skuPdf}
      </Text>

      <View style={styles.pricePlaceholder} />
    </View>
  );
}

interface ProductCatalogPDFProps {
  products: InventoryItem[];
  catalogTitle?: string;
  includeStock: boolean;
  itemsPerPage: number;
  orientation: 'landscape' | 'portrait';
}

export default function ProductCatalogPDF({
  products = [],
  catalogTitle,
  includeStock = false,
  itemsPerPage: _itemsPerPage = 4, // reservado: el layout 2×2 fija 4 ítems por página
  orientation = 'landscape',
}: ProductCatalogPDFProps) {
  void _itemsPerPage;
  void catalogTitle;
  void includeStock;
  const t = (key: string) => translate(key);
  // Handle empty products
  if (!products || products.length === 0) {
    return (
      <Document>
        <Page size="A4" orientation={orientation} style={styles.page}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: '#666' }}>{t('inventory.catalog.noProductsAvailable')}</Text>
          </View>
        </Page>
      </Document>
    );
  }

  // Layout fijo 2×2 = 4 productos por página (itemsPerPage del modal no cambia la rejilla aún)
  const pages: InventoryItem[][] = [];
  for (let i = 0; i < products.length; i += 4) {
    const pageProducts = products.slice(i, i + 4);
    // Only add page if it has at least one product (no empty pages, no placeholders)
    if (pageProducts.length > 0) {
      pages.push(pageProducts);
    }
  }
  
  // Ensure we don't have any empty pages (safety check)
  const validPages = pages.filter(page => page.length > 0);

  return (
    <Document>
      {validPages.map((pageProducts, pageIndex) => (
        <Page 
          key={pageIndex} 
          size="A4" 
          orientation={orientation} 
          style={styles.page}
          wrap={false}
        >
          {/* Product Grid - Render only actual products (no placeholders) */}
          <View style={styles.grid}>
            {/* First Row - Only render if products exist */}
            {pageProducts.length > 0 && (
              <View style={styles.row}>
                {pageProducts.slice(0, 2).map((product) => {
                  return (
                    <View key={product.id} style={styles.productBlock}>
                      {/* LEFT PANEL: Product Image (70% width) */}
                      <View style={styles.imagePanel}>
                        {product.images && product.images.length > 0 && product.images[0] ? (
                          <Image
                            src={product.images[0]}
                            style={styles.productImage}
                            cache={false}
                          />
                        ) : (
                          <View style={styles.noImage}>
                            <Text style={styles.noImageText}>{t('inventory.catalog.noImage')}</Text>
                          </View>
                        )}
                      </View>

                      <CatalogProductTextColumn product={product} />
                    </View>
                  );
                })}
              </View>
            )}
            
            {/* Second Row - Only render if 3+ products exist */}
            {pageProducts.length > 2 && (
              <View style={[styles.row, { marginBottom: 0 }]}>
                {pageProducts.slice(2, 4).map((product) => {
                  return (
                    <View key={product.id} style={styles.productBlock}>
                      {/* LEFT PANEL: Product Image (70% width) */}
                      <View style={styles.imagePanel}>
                        {product.images && product.images.length > 0 && product.images[0] ? (
                          <Image
                            src={product.images[0]}
                            style={styles.productImage}
                            cache={false}
                          />
                        ) : (
                          <View style={styles.noImage}>
                            <Text style={styles.noImageText}>{t('inventory.catalog.noImage')}</Text>
                          </View>
                        )}
                      </View>

                      <CatalogProductTextColumn product={product} />
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.pageNumber}>
              {pageIndex + 1} / {validPages.length}
            </Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}
