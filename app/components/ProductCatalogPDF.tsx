'use client';

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { InventoryItem } from '../types';

// Images are pre-converted to JPEG in CatalogDownloadButton for PDF compatibility

// Create sophisticated styles for luxury jewelry catalog
const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FAFAF8',
    padding: 45,
    paddingTop: 35,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    paddingBottom: 18,
    borderBottom: '0.5pt solid #D4C5B5',
  },
  titleContainer: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2B1810',
    letterSpacing: 2.5,
  },
  catalogSubtext: {
    fontSize: 8,
    color: '#9A8774',
    letterSpacing: 2.5,
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    padding: 0,
    marginBottom: 16,
    border: '0.5pt solid #E8E3DC',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
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
    height: 145,
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
    padding: 14,
    paddingTop: 12,
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
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1A120E',
    marginBottom: 4,
    lineHeight: 1.35,
  },
  sku: {
    fontSize: 7.5,
    color: '#9A8774',
    marginBottom: 6,
    letterSpacing: 0.8,
  },
  description: {
    fontSize: 7.5,
    color: '#706659',
    lineHeight: 1.45,
    marginTop: 5,
  },
  stockInfo: {
    fontSize: 6.5,
    color: '#A89B8C',
    marginTop: 8,
    paddingTop: 7,
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
}

export default function ProductCatalogPDF({
  products,
  catalogTitle,
  includeStock,
  itemsPerPage,
}: ProductCatalogPDFProps) {
  // Split products into pages
  const pages: InventoryItem[][] = [];
  for (let i = 0; i < products.length; i += itemsPerPage) {
    pages.push(products.slice(i, i + itemsPerPage));
  }

  // Determine card style based on items per page
  const getCardStyle = () => {
    switch (itemsPerPage) {
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

  const cardStyle = getCardStyle();

  return (
    <Document>
      {pages.map((pageProducts, pageIndex) => (
        <Page key={pageIndex} size="A4" orientation="landscape" style={styles.page}>
          {/* Elegant Header */}
          <View style={styles.header}>
            <View style={styles.titleContainer}>
              <Text style={styles.title}>{catalogTitle.toUpperCase()}</Text>
              <Text style={styles.catalogSubtext}>FINE JEWELRY COLLECTION</Text>
            </View>
          </View>

          {/* Product Grid */}
          <View style={styles.grid}>
            {pageProducts.map((product) => (
              <View key={product.id} style={[styles.productCard, cardStyle]}>
                {/* Product Image */}
                <View style={styles.imageContainer}>
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
