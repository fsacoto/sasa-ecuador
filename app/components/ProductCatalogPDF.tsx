'use client';

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { InventoryItem } from '../types';

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
    backgroundColor: '#FAF7F2',
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
    overflow: 'visible', // Allow badge to expand beyond if needed
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
    // NO width property - let it grow naturally based on content
    // NO maxWidth - completely removed
    // NO minWidth - completely removed
    // NO flexBasis - completely removed
    backgroundColor: '#E6D089', // Always use same gold color
    flexShrink: 0, // Prevent shrinking
    flexGrow: 0, // Prevent growing beyond content
    flexWrap: 'nowrap', // Prevent wrapping
  },
  materialBadgeText: {
    fontSize: 9, // 9px for shorter text like "GOLD PLATED"
    fontWeight: 600, // Semibold
    textTransform: 'uppercase',
    letterSpacing: 0.12, // Reduced letter spacing for tighter fit
    fontFamily: 'Helvetica', // Clean sans-serif
    color: '#5F4A00', // Always use same text color
    // NO width property - let text determine badge width
    // NO maxWidth - completely removed
    flexShrink: 0, // Prevent text from shrinking
    flexGrow: 0, // Prevent text from growing beyond content
    // Note: react-pdf doesn't support word-break, overflow-wrap, or hyphens
    // numberOfLines={1} on Text component handles single-line enforcement
  },
  materialBadgeTextSmall: {
    fontSize: 8, // 8px for longer text like "STERLING SILVER"
    fontWeight: 600, // Semibold
    textTransform: 'uppercase',
    letterSpacing: 0.08, // Minimal letter spacing for maximum fit
    fontFamily: 'Helvetica', // Clean sans-serif
    color: '#5F4A00', // Always use same text color
    // NO width property - let text determine badge width
    // NO maxWidth - completely removed
    flexShrink: 0, // Prevent text from shrinking
    flexGrow: 0, // Prevent text from growing beyond content
    // Note: react-pdf doesn't support word-break, overflow-wrap, or hyphens
    // numberOfLines={1} on Text component handles single-line enforcement
  },
  productName: {
    fontSize: 15, // 14-16px range (using 15px for balance)
    fontWeight: 'medium',
    color: '#333333',
    marginBottom: 8, // 8px spacing below product name (name → SKU)
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
  sku: {
    fontSize: 11, // 11-12px range (using 11px)
    fontWeight: 'normal',
    color: '#333333',
    marginBottom: 8, // 8px spacing from SKU to price placeholder
    fontFamily: 'Courier',
    letterSpacing: 0.22, // +2% letter spacing (11px * 0.02 = 0.22)
    lineHeight: 1.1, // Tight and compact
    maxWidth: '100%',
    overflow: 'hidden',
    whiteSpace: 'nowrap', // Never wrap to second line
    textOverflow: 'ellipsis', // Truncate if too long (after font reduction)
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

// Get material badge style based on line type
const getMaterialBadgeStyle = (line: string | undefined) => {
  if (!line) {
    return {
      backgroundColor: '#E5E5E5',
      color: '#555555',
    };
  }

  const lineLower = line.toLowerCase();
  
  if (lineLower.includes('gold plated') || lineLower.includes('oro laminado')) {
    return {
      backgroundColor: '#E6D089',
      color: '#6A5500',
    };
  } else if (lineLower.includes('gold filled') || lineLower.includes('oro relleno')) {
    return {
      backgroundColor: '#F8D87A',
      color: '#5F4A00',
    };
  } else if (lineLower.includes('sterling silver') || lineLower.includes('plata')) {
    return {
      backgroundColor: '#E5E5E5',
      color: '#555555',
    };
  }
  
  // Default
  return {
    backgroundColor: '#E5E5E5',
    color: '#555555',
  };
};

// Determine badge text style based on text length (auto-shrink logic, no ellipsis)
const getBadgeTextStyle = (text: string) => {
  const textLength = text.length;
  // Badge can expand horizontally with no width limits
  // Padding: 8px each side = 16px total (reduced for better fit)
  // Character width estimates: 9px font ≈ 4-5px per char, 8px ≈ 3-4px
  // "GOLD PLATED" = 11 chars, "GOLD FILLED" = 11 chars, "STERLING SILVER" = 15 chars
  
  if (textLength <= 12) {
    // Shorter text like "GOLD PLATED" - use 9px (badge expands to fit)
    return styles.materialBadgeText;
  } else {
    // Longer text (13+ chars) including "STERLING SILVER" (15 chars) - use 8px
    return styles.materialBadgeTextSmall;
  }
};

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
  itemsPerPage = 4,
  orientation = 'landscape',
}: ProductCatalogPDFProps) {
  // Handle empty products
  if (!products || products.length === 0) {
    return (
      <Document>
        <Page size="A4" orientation="landscape" style={styles.page}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: '#666' }}>NO PRODUCTS AVAILABLE</Text>
          </View>
        </Page>
      </Document>
    );
  }

  // Split products into pages - up to 4 per page, only create pages with actual products
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
          orientation="landscape" 
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
                            <Text style={styles.noImageText}>NO IMAGE</Text>
                          </View>
                        )}
                      </View>

                      {/* RIGHT PANEL: Textual Information (30% width) */}
                      <View style={styles.textPanel}>
                        {/* 1. Material Badge - Single line, no ellipsis, auto-expand, always gold color */}
                        {product.line && (() => {
                          const badgeText = product.line.toUpperCase();
                          const textStyle = getBadgeTextStyle(badgeText);
                          return (
                            <View style={styles.materialBadge}>
                              <Text 
                                style={textStyle}
                                numberOfLines={1}
                              >
                                {badgeText}
                              </Text>
                            </View>
                          );
                        })()}

                        {/* 2. Product Name - Single line only */}
                        <Text 
                          style={styles.productName}
                          numberOfLines={1}
                        >
                          {product.name ? product.name.toUpperCase() : 'NO NAME'}
                        </Text>

                        {/* 3. SKU Code - Single line only */}
                        <Text 
                          style={styles.sku}
                          numberOfLines={1}
                        >
                          {product.sku || 'NO SKU'}
                        </Text>

                        {/* 4. Price Placeholder (empty space) */}
                        <View style={styles.pricePlaceholder} />
                      </View>
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
                            <Text style={styles.noImageText}>NO IMAGE</Text>
                          </View>
                        )}
                      </View>

                      {/* RIGHT PANEL: Textual Information (30% width) */}
                      <View style={styles.textPanel}>
                        {/* 1. Material Badge - Single line, no ellipsis, auto-expand, always gold color */}
                        {product.line && (() => {
                          const badgeText = product.line.toUpperCase();
                          const textStyle = getBadgeTextStyle(badgeText);
                          return (
                            <View style={styles.materialBadge}>
                              <Text 
                                style={textStyle}
                                numberOfLines={1}
                              >
                                {badgeText}
                              </Text>
                            </View>
                          );
                        })()}

                        {/* 2. Product Name - Single line only */}
                        <Text 
                          style={styles.productName}
                          numberOfLines={1}
                        >
                          {product.name ? product.name.toUpperCase() : 'NO NAME'}
                        </Text>

                        {/* 3. SKU Code - Single line only */}
                        <Text 
                          style={styles.sku}
                          numberOfLines={1}
                        >
                          {product.sku || 'NO SKU'}
                        </Text>

                        {/* 4. Price Placeholder (empty space) */}
                        <View style={styles.pricePlaceholder} />
                      </View>
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
