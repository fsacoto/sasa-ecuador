'use client';

import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer';
import { InventoryItem } from '../types';

// Create styles for the PDF
const styles = StyleSheet.create({
  page: {
    backgroundColor: '#F5F5F0',
    padding: 40,
  },
  header: {
    marginBottom: 30,
    textAlign: 'center',
    paddingBottom: 20,
    borderBottom: '3pt solid #4f0c1b',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4f0c1b',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 20,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  productCard2x2: {
    width: '47%',
  },
  productCard2x3: {
    width: '47%',
  },
  productCard2x4: {
    width: '47%',
  },
  productCard3x3: {
    width: '30%',
  },
  imageContainer: {
    width: '100%',
    height: 180,
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  imageContainer3x3: {
    height: 150,
  },
  productImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  noImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#e5e5e5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noImageText: {
    fontSize: 10,
    color: '#999',
  },
  badge: {
    backgroundColor: '#E8D77F',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#333',
    letterSpacing: 0.5,
  },
  productName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  sku: {
    fontSize: 10,
    color: '#666',
    marginBottom: 8,
  },
  description: {
    fontSize: 9,
    color: '#777',
    marginBottom: 8,
    lineHeight: 1.4,
  },
  stockInfo: {
    fontSize: 8,
    color: '#888',
    marginTop: 4,
    paddingTop: 8,
    borderTop: '1pt solid #e5e5e5',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#999',
    borderTop: '1pt solid #ddd',
    paddingTop: 10,
  },
  pageNumber: {
    fontSize: 8,
    color: '#999',
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
      case 9:
        return styles.productCard3x3;
      case 8:
      case 6:
      case 4:
      default:
        return styles.productCard2x2;
    }
  };

  const getImageStyle = () => {
    return itemsPerPage === 9 ? styles.imageContainer3x3 : styles.imageContainer;
  };

  const cardStyle = getCardStyle();
  const imageContainerStyle = getImageStyle();

  return (
    <Document>
      {pages.map((pageProducts, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          {/* Header (only on first page) */}
          {pageIndex === 0 && (
            <View style={styles.header}>
              <Text style={styles.title}>{catalogTitle}</Text>
              <Text style={styles.subtitle}>
                {new Date().toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            </View>
          )}

          {/* Product Grid */}
          <View style={styles.grid}>
            {pageProducts.map((product) => (
              <View key={product.id} style={[styles.productCard, cardStyle]}>
                {/* Product Image */}
                <View style={[styles.imageContainer, imageContainerStyle]}>
                  {product.images && product.images.length > 0 ? (
                    <Image
                      src={product.images[0]}
                      style={styles.productImage}
                    />
                  ) : (
                    <View style={styles.noImage}>
                      <Text style={styles.noImageText}>No Image</Text>
                    </View>
                  )}
                </View>

                {/* Category Badge */}
                {product.category && !product.category.includes('NEEDS REVIEW') && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {product.category.toUpperCase()}
                    </Text>
                  </View>
                )}

                {/* Product Info */}
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.sku}>{product.sku}</Text>

                {product.description && (
                  <Text style={styles.description}>
                    {product.description.substring(0, 80)}
                    {product.description.length > 80 ? '...' : ''}
                  </Text>
                )}

                {/* Stock Information */}
                {includeStock && (
                  <View style={styles.stockInfo}>
                    <Text>
                      Stock: Ecuador: {product.ecuadorStock} | USA: {product.usaStock} | Total: {product.ecuadorStock + product.usaStock}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.pageNumber}>
              Page {pageIndex + 1} of {pages.length} • {products.length} Products
            </Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}
