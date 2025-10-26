'use client';

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { InventoryItem } from '../types';

// Images are pre-converted to JPEG in CatalogDownloadButton for PDF compatibility

// Create sophisticated styles for luxury jewelry catalog
const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FAFAF8',
    padding: 40,
    paddingTop: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 25,
    paddingBottom: 15,
    borderBottom: '0.5pt solid #D4C5B5',
  },
  titleContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    maxWidth: '100%',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2B1810',
    letterSpacing: 1.5,
    textAlign: 'center',
    maxWidth: '100%',
    flexWrap: 'wrap',
  },
  catalogSubtext: {
    fontSize: 8,
    color: '#9A8774',
    letterSpacing: 2.5,
    marginTop: 4,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    padding: 0,
    marginBottom: 12,
    border: '0.5pt solid #E8E3DC',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  productCard2: {
    width: '48%',
  },
  productCard4: {
    width: '23%',
  },
  productCard6: {
    width: '31.5%',
  },
  productCard8: {
    width: '23%',
  },
  productCard9: {
    width: '31.5%',
  },
  imageContainer: {
    width: '100%',
    height: 200,
    backgroundColor: '#FCFBF9',
    position: 'relative',
  },
  imageContainer2: {
    width: '100%',
    height: 300,
    backgroundColor: '#FCFBF9',
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    objectPosition: 'center',
  },
  noImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F7F5F2',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noImageText: {
    fontSize: 8,
    color: '#C9BFB1',
    letterSpacing: 1.5,
  },
  infoContainer: {
    padding: 10,
    paddingTop: 8,
  },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#4f0c1b',
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 2,
  },
  badgeText: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1.2,
  },
  productName: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#1A120E',
    marginBottom: 3,
    lineHeight: 1.3,
  },
  sku: {
    fontSize: 7,
    color: '#9A8774',
    marginBottom: 4,
    letterSpacing: 0.8,
  },
  description: {
    fontSize: 7,
    color: '#706659',
    lineHeight: 1.4,
    marginTop: 4,
  },
  stockInfo: {
    fontSize: 6,
    color: '#A89B8C',
    marginTop: 6,
    paddingTop: 5,
    borderTop: '0.5pt solid #EDE8DF',
  },
  footer: {
    position: 'absolute',
    bottom: 25,
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

interface ProductCatalogPDFProps {
  products: InventoryItem[];
  catalogTitle: string;
  includeStock: boolean;
  itemsPerPage: number;
  orientation: 'landscape' | 'portrait';
}

export default function ProductCatalogPDF({
  products,
  catalogTitle,
  includeStock,
  itemsPerPage,
  orientation,
}: ProductCatalogPDFProps) {
  // Truncate title if too long to fit on page
  const getDisplayTitle = (title: string) => {
    if (title.length > 25) {
      // Try to break at word boundary
      const truncated = title.substring(0, 25);
      const lastSpace = truncated.lastIndexOf(' ');
      if (lastSpace > 15) {
        return title.substring(0, lastSpace) + '...';
      }
      return truncated + '...';
    }
    return title;
  };

  // Split products into pages
  const pages: InventoryItem[][] = [];
  for (let i = 0; i < products.length; i += itemsPerPage) {
    pages.push(products.slice(i, i + itemsPerPage));
  }

  // Determine card style based on items per page
  const getCardStyle = () => {
    switch (itemsPerPage) {
      case 2:
        return styles.productCard2;
      case 4:
        return styles.productCard4;
      case 6:
        return styles.productCard6;
      case 8:
        return styles.productCard8;
      case 9:
        return styles.productCard9;
      default:
        return styles.productCard4;
    }
  };

  // Determine image container style based on items per page
  const getImageContainerStyle = () => {
    switch (itemsPerPage) {
      case 2:
        return styles.imageContainer2;
      default:
        return styles.imageContainer;
    }
  };

  const cardStyle = getCardStyle();
  const imageContainerStyle = getImageContainerStyle();

  return (
    <Document>
      {pages.map((pageProducts, pageIndex) => (
        <Page key={pageIndex} size="A4" orientation={orientation} style={styles.page}>
          {/* Elegant Header */}
          <View style={styles.header}>
            <View style={styles.titleContainer}>
              <Text style={styles.title}>{getDisplayTitle(catalogTitle).toUpperCase()}</Text>
              <Text style={styles.catalogSubtext}>FINE JEWELRY COLLECTION</Text>
            </View>
          </View>

          {/* Product Grid */}
          <View style={styles.grid}>
            {pageProducts.map((product) => (
              <View key={product.id} style={[styles.productCard, cardStyle]}>
                {/* Product Image */}
                <View style={imageContainerStyle}>
                  {product.images && product.images.length > 0 && product.images[0] ? (
                    <Image
                      src={product.images[0]}
                      style={styles.productImage}
                    />
                  ) : (
                    <View style={styles.noImage}>
                      <Text style={styles.noImageText}>NO IMAGE</Text>
                    </View>
                  )}
                    
                    {/* Category Badge Overlay */}
                    {product.category && !product.category.includes('NEEDS REVIEW') && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {product.category.toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>

                {/* Product Info */}
                <View style={styles.infoContainer}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.sku}>{product.sku}</Text>

                  {product.description && (
                    <Text style={styles.description}>
                      {product.description.substring(0, 60)}
                      {product.description.length > 60 ? '...' : ''}
                    </Text>
                  )}

                  {/* Stock Information */}
                  {includeStock && (
                    <Text style={styles.stockInfo}>
                      In Stock: {product.ecuadorStock + product.usaStock} units available
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>

          {/* Minimal Footer */}
          <View style={styles.footer}>
            <Text style={styles.pageNumber}>
              {pageIndex + 1} / {pages.length}
            </Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}
