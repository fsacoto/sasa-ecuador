'use client';

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { InventoryItem } from '../types';
import esMessages from '../locales/es.json';
import { formatCatalogSalePrice } from '../utils/salePrice';

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
      return (
        materialTranslations.enchapadoEnOro ||
        materialTranslations.goldFilled ||
        materialTranslations.oroRelleno ||
        materialName.toUpperCase()
      );
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

/** Descripción: salto solo entre palabras; sin guiones de corte automático. */
function formatCatalogDescriptionText(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/-/g, '\u2011'))
    .join(' ');
}

/** react-pdf: no partir palabras con guiones; mover la palabra entera a la siguiente línea. */
const catalogNoHyphenation = (word: string): string[] => [word];

/** Fondo catálogo (página). */
const CATALOG_PAGE_BG = '#FFFFFF';
/** Pastilla “línea” (material): color de marca principal. */
const CATALOG_LINE_PILL_BG = '#FBE3E3';
const CATALOG_LINE_PILL_TEXT = '#2D141C';
/** Recuadro de precio (más visible que el gris claro anterior). */
const CATALOG_PRICE_BG = '#D9D4CF';
const CATALOG_PRICE_PLACEHOLDER_BG = '#E8E4E0';

const PAGE_MARGIN = 32;

type CatalogLayout = {
  productsPerPage: number;
  grid: { width: number; height: number };
  rowGap: number;
  colGap: number;
  columnsPerRow: number;
  productBlock: { width: number; height: number };
  imagePanel: { width: number; height: number };
  textPanel: { width: number; height: number };
  imageTopOffset: number;
  descriptionMaxHeight: number;
  productDetailFontSize: number;
  pagePaddingTop: number;
  pagePaddingBottom: number;
};

/** Evita mostrar nombre y descripción cuando dicen lo mismo (o casi). */
function catalogTextsAreDuplicate(name: string, description: string): boolean {
  const normalize = (value: string) =>
    value
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
  const a = normalize(name);
  const b = normalize(description);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.startsWith(b) || b.startsWith(a);
}

function getCatalogLayout(orientation: 'landscape' | 'portrait'): CatalogLayout {
  if (orientation === 'portrait') {
    // A4 vertical: 595 × 842 pt — 2 productos apilados a ancho completo
    const pagePaddingTop = 14;
    const pagePaddingBottom = 50;
    const gridWidth = 595 - PAGE_MARGIN * 2; // 531
    const gridHeight = 842 - pagePaddingTop - pagePaddingBottom; // 778
    const rowGap = 24;
    const blockHeight = (gridHeight - rowGap) / 2; // 377
    const blockWidth = gridWidth;
    const imageSize = Math.round(Math.min(blockHeight, blockWidth * 0.55)); // cuadrado
    const textWidth = blockWidth - imageSize;
    const imageTopOffset = (blockHeight - imageSize) / 2;
    const priceFooterHeight = 58;
    const textChrome = 72; // badge, categoría y márgenes del bloque superior

    return {
      productsPerPage: 2,
      grid: { width: gridWidth, height: gridHeight },
      rowGap,
      colGap: 0,
      columnsPerRow: 1,
      productBlock: { width: blockWidth, height: blockHeight },
      imagePanel: { width: imageSize, height: imageSize },
      textPanel: { width: textWidth, height: blockHeight },
      imageTopOffset,
      descriptionMaxHeight: Math.round(
        blockHeight - imageTopOffset - priceFooterHeight - textChrome
      ),
      productDetailFontSize: 15,
      pagePaddingTop,
      pagePaddingBottom,
    };
  }

  // A4 horizontal: 842 × 595 pt — rejilla 2×2
  const pagePaddingTop = PAGE_MARGIN;
  const pagePaddingBottom = PAGE_MARGIN;
  const gridWidth = 842 - PAGE_MARGIN * 2; // 778
  const gridHeight = 595 - PAGE_MARGIN * 2; // 531
  const rowGap = 32;
  const colGap = 24;
  const blockWidth = (gridWidth - colGap) / 2; // 377
  const blockHeight = (gridHeight - rowGap) / 2; // 249.5
  const imageSize = Math.round(Math.min(blockHeight, blockWidth * 0.7)); // cuadrado
  const textWidth = blockWidth - imageSize;
  const imageTopOffset = (blockHeight - imageSize) / 2;
  const priceFooterHeight = 58;

  return {
    productsPerPage: 4,
    grid: { width: gridWidth, height: gridHeight },
    rowGap,
    colGap,
    columnsPerRow: 2,
    productBlock: { width: blockWidth, height: blockHeight },
    imagePanel: { width: imageSize, height: imageSize },
    textPanel: { width: textWidth, height: blockHeight },
    imageTopOffset,
    descriptionMaxHeight: Math.round(
      blockHeight - imageTopOffset - priceFooterHeight - 52
    ),
    productDetailFontSize: 14,
    pagePaddingTop,
    pagePaddingBottom,
  };
}

function catalogPageStyle(layout: CatalogLayout) {
  return {
    backgroundColor: CATALOG_PAGE_BG,
    paddingTop: layout.pagePaddingTop,
    paddingBottom: layout.pagePaddingBottom,
    paddingLeft: PAGE_MARGIN,
    paddingRight: PAGE_MARGIN,
  };
}

const styles = StyleSheet.create({
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
  materialBadgePortrait: {
    paddingTop: 7,
    paddingRight: 11,
    paddingBottom: 6,
    paddingLeft: 11,
  },
  materialBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.1,
    fontFamily: 'Helvetica-Bold',
    color: CATALOG_LINE_PILL_TEXT,
    flexShrink: 0,
    flexGrow: 0,
  },
  materialBadgeTextSmall: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.06,
    fontFamily: 'Helvetica-Bold',
    color: CATALOG_LINE_PILL_TEXT,
    flexShrink: 0,
    flexGrow: 0,
  },
  materialBadgeTextTiny: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    fontFamily: 'Helvetica-Bold',
    color: CATALOG_LINE_PILL_TEXT,
    flexShrink: 0,
    flexGrow: 0,
  },
  materialBadgeTextPortrait: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.1,
    fontFamily: 'Helvetica-Bold',
    color: CATALOG_LINE_PILL_TEXT,
    flexShrink: 0,
    flexGrow: 0,
  },
  materialBadgeTextSmallPortrait: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.06,
    fontFamily: 'Helvetica-Bold',
    color: CATALOG_LINE_PILL_TEXT,
    flexShrink: 0,
    flexGrow: 0,
  },
  materialBadgeTextTinyPortrait: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    fontFamily: 'Helvetica-Bold',
    color: CATALOG_LINE_PILL_TEXT,
    flexShrink: 0,
    flexGrow: 0,
  },
  productDetail: {
    fontWeight: 'medium',
    color: '#333333',
    marginBottom: 6,
    textTransform: 'uppercase',
    lineHeight: 1.25,
    letterSpacing: 0.12,
    fontFamily: 'Helvetica',
    maxWidth: '100%',
  },
  descriptionWrap: {
    width: '100%',
    marginBottom: 6,
    flexGrow: 1,
    flexShrink: 1,
  },
  productDescription: {
    fontSize: 10,
    fontWeight: 'normal',
    color: '#333333',
    lineHeight: 1.5,
    fontFamily: 'Helvetica',
    maxWidth: '100%',
    textTransform: 'uppercase',
  },
  sku: {
    fontSize: 7,
    color: '#333333',
    marginBottom: 4,
    fontFamily: 'Helvetica-Oblique',
    letterSpacing: 0.03,
    lineHeight: 1,
    maxWidth: '100%',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    alignSelf: 'flex-start',
  },
  categoryLine: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 6,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.1,
    lineHeight: 1.1,
    maxWidth: '100%',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  priceFooter: {
    width: '100%',
    marginTop: 'auto',
    flexShrink: 0,
    alignItems: 'flex-start',
  },
  pricePlaceholder: {
    backgroundColor: CATALOG_PRICE_PLACEHOLDER_BG,
    borderRadius: 16,
    height: 30,
    minWidth: 72,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  pricePlaceholderPortrait: {
    borderRadius: 18,
    height: 36,
    minWidth: 80,
    paddingHorizontal: 10,
  },
  pricePlaceholderDash: {
    fontSize: 13,
    color: '#666666',
    fontFamily: 'Helvetica',
  },
  pricePlaceholderDashPortrait: {
    fontSize: 14,
  },
  priceBadge: {
    backgroundColor: CATALOG_PRICE_BG,
    borderRadius: 16,
    height: 30,
    minWidth: 72,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  priceBadgePortrait: {
    borderRadius: 18,
    height: 36,
    minWidth: 80,
    paddingHorizontal: 10,
  },
  priceText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a1a1a',
    fontFamily: 'Helvetica-Bold',
  },
  priceTextPortrait: {
    fontSize: 15,
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
  coverPage: {
    backgroundColor: CATALOG_LINE_PILL_BG,
    padding: 0,
  },
  coverInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  coverLogoLandscape: {
    width: 300,
    objectFit: 'contain',
  },
  coverLogoPortrait: {
    width: 240,
    objectFit: 'contain',
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

/** SKU en cursiva; si es largo, reduce tamaño (siempre una línea). */
const getSkuSingleLineStyles = (
  text: string
): (typeof styles.sku | { fontSize: number; letterSpacing: number })[] => {
  const len = text.length;
  if (len <= 22) return [styles.sku];
  if (len <= 34) return [styles.sku, { fontSize: 6, letterSpacing: 0.02 }];
  return [styles.sku, { fontSize: 5, letterSpacing: 0.01 }];
};

const getBadgeTextStyle = (text: string, isPortrait: boolean) => {
  const textLength = text.length;
  if (isPortrait) {
    if (textLength <= 10) return styles.materialBadgeTextPortrait;
    if (textLength <= 16) return styles.materialBadgeTextSmallPortrait;
    return styles.materialBadgeTextTinyPortrait;
  }
  if (textLength <= 10) return styles.materialBadgeText;
  if (textLength <= 16) return styles.materialBadgeTextSmall;
  return styles.materialBadgeTextTiny;
};

function CatalogProductTextColumn({
  product,
  layout,
}: {
  product: InventoryItem;
  layout: CatalogLayout;
}) {
  const t = (key: string) => translate(key);
  const skuDisplay = product.sku || t('inventory.catalog.noSku');
  const skuPdf = formatSkuNonBreaking(skuDisplay);
  const nameTrim = (product.name || '').trim();
  const descriptionTrim = (product.description || '').trim();
  const duplicateNameAndDescription =
    Boolean(nameTrim && descriptionTrim) && catalogTextsAreDuplicate(nameTrim, descriptionTrim);
  const showName = Boolean(nameTrim) && !duplicateNameAndDescription;
  const showDescription = Boolean(descriptionTrim);
  const categoryTrim = (product.category || '').trim();
  const categoryDisplay = categoryTrim ? categoryTrim.toUpperCase() : '';
  const lineLabel = product.line ? translateMaterialName(product.line) : '';
  const skuTextStyles = getSkuSingleLineStyles(skuDisplay);
  const categoryTextStyles = categoryDisplay
    ? getNarrowSingleLineStyles(categoryDisplay, styles.categoryLine)
    : [];
  const priceLabel = formatCatalogSalePrice(product.salePrice);
  const hasPrice = priceLabel !== '—';
  const detailFontSize = layout.productDetailFontSize;
  const descriptionPdf = formatCatalogDescriptionText(descriptionTrim);
  const namePdf = formatCatalogDescriptionText(nameTrim);
  const isPortrait = layout.columnsPerRow === 1;

  return (
    <View
      style={{
        width: layout.textPanel.width,
        height: layout.textPanel.height,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <View style={{ height: layout.imageTopOffset, width: '100%', flexShrink: 0 }} />

      <View
        style={{
          flexGrow: 1,
          flexShrink: 1,
          width: '100%',
          paddingLeft: 12,
          paddingRight: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        {lineLabel ? (
          <View style={[styles.materialBadge, ...(isPortrait ? [styles.materialBadgePortrait] : [])]}>
            <Text style={getBadgeTextStyle(lineLabel, isPortrait)} wrap={false}>
              {lineLabel}
            </Text>
          </View>
        ) : null}

        {categoryDisplay ? (
          <Text style={categoryTextStyles} wrap={false}>
            {categoryDisplay}
          </Text>
        ) : null}

        {showName ? (
          <Text
            style={[styles.productDetail, { fontSize: detailFontSize }]}
            wrap
            hyphenationCallback={catalogNoHyphenation}
          >
            {namePdf.toUpperCase()}
          </Text>
        ) : null}

        {showDescription ? (
          <View style={[styles.descriptionWrap, { maxHeight: layout.descriptionMaxHeight }]}>
            <Text
              style={[styles.productDescription, { fontSize: detailFontSize - 1 }]}
              wrap
              hyphenationCallback={catalogNoHyphenation}
            >
              {descriptionPdf.toUpperCase()}
            </Text>
          </View>
        ) : !showName ? (
          <Text
            style={[styles.productDetail, { fontSize: detailFontSize }]}
            wrap
            hyphenationCallback={catalogNoHyphenation}
          >
            {t('inventory.catalog.noName')}
          </Text>
        ) : null}
      </View>

      <View style={[styles.priceFooter, { paddingLeft: 12, paddingRight: 4, flexShrink: 0, width: '100%' }]}>
        <Text style={skuTextStyles} wrap={false}>
          {skuPdf}
        </Text>
        {hasPrice ? (
          <View style={[styles.priceBadge, ...(isPortrait ? [styles.priceBadgePortrait] : [])]}>
            <Text style={[styles.priceText, ...(isPortrait ? [styles.priceTextPortrait] : [])]} wrap={false}>
              {priceLabel}
            </Text>
          </View>
        ) : (
          <View style={[styles.pricePlaceholder, ...(isPortrait ? [styles.pricePlaceholderPortrait] : [])]}>
            <Text
              style={[styles.pricePlaceholderDash, ...(isPortrait ? [styles.pricePlaceholderDashPortrait] : [])]}
              wrap={false}
            >
              —
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function CatalogProductBlock({
  product,
  layout,
  noImageLabel,
}: {
  product: InventoryItem;
  layout: CatalogLayout;
  noImageLabel: string;
}) {
  const hasImage =
    product.images?.[0]?.startsWith('data:image/jpeg') ||
    product.images?.[0]?.startsWith('data:image/jpg') ||
    product.images?.[0]?.startsWith('data:image/png');

  const imageSize = layout.imagePanel.width;

  return (
    <View
      style={{
        width: layout.productBlock.width,
        height: layout.productBlock.height,
        flexDirection: 'row',
      }}
    >
      <View
        style={{
          width: imageSize,
          height: layout.productBlock.height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: imageSize,
            height: imageSize,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {hasImage ? (
            <Image
              src={product.images![0]}
              style={{
                width: imageSize,
                height: imageSize,
                objectFit: 'contain',
              }}
              cache={false}
            />
          ) : (
            <View style={styles.noImage}>
              <Text style={styles.noImageText}>{noImageLabel}</Text>
            </View>
          )}
        </View>
      </View>

      <CatalogProductTextColumn product={product} layout={layout} />
    </View>
  );
}

function chunkProducts(products: InventoryItem[], chunkSize: number): InventoryItem[][] {
  const pages: InventoryItem[][] = [];
  for (let i = 0; i < products.length; i += chunkSize) {
    const pageProducts = products.slice(i, i + chunkSize);
    if (pageProducts.length > 0) {
      pages.push(pageProducts);
    }
  }
  return pages;
}

function CatalogProductPage({
  pageProducts,
  layout,
  noImageLabel,
}: {
  pageProducts: InventoryItem[];
  layout: CatalogLayout;
  noImageLabel: string;
}) {
  if (layout.columnsPerRow === 1) {
    const singleProductPage = pageProducts.length === 1;

    return (
      <View
        style={{
          flexDirection: 'column',
          width: layout.grid.width,
          height: layout.grid.height,
          justifyContent: singleProductPage ? 'center' : 'flex-start',
        }}
      >
        {pageProducts.map((product, rowIndex) => (
          <View
            key={product.id}
            style={{
              flexDirection: 'row',
              width: layout.grid.width,
              height: layout.productBlock.height,
              marginBottom: rowIndex < pageProducts.length - 1 ? layout.rowGap : 0,
              justifyContent: 'flex-start',
            }}
          >
            <CatalogProductBlock product={product} layout={layout} noImageLabel={noImageLabel} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'column',
        width: layout.grid.width,
        height: layout.grid.height,
      }}
    >
      {pageProducts.length > 0 && (
        <View
          style={{
            flexDirection: 'row',
            width: layout.grid.width,
            height: layout.productBlock.height,
            marginBottom: pageProducts.length > 2 ? layout.rowGap : 0,
            justifyContent: 'space-between',
          }}
        >
          {pageProducts.slice(0, 2).map((product) => (
            <CatalogProductBlock
              key={product.id}
              product={product}
              layout={layout}
              noImageLabel={noImageLabel}
            />
          ))}
        </View>
      )}

      {pageProducts.length > 2 && (
        <View
          style={{
            flexDirection: 'row',
            width: layout.grid.width,
            height: layout.productBlock.height,
            justifyContent: 'space-between',
          }}
        >
          {pageProducts.slice(2, 4).map((product) => (
            <CatalogProductBlock
              key={product.id}
              product={product}
              layout={layout}
              noImageLabel={noImageLabel}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function CatalogCoverPage({
  orientation,
  logoSrc,
}: {
  orientation: 'landscape' | 'portrait';
  logoSrc: string;
}) {
  const logoStyle =
    orientation === 'portrait' ? styles.coverLogoPortrait : styles.coverLogoLandscape;

  return (
    <Page size="A4" orientation={orientation} style={styles.coverPage} wrap={false}>
      <View style={styles.coverInner}>
        {logoSrc ? <Image src={logoSrc} style={logoStyle} cache={false} /> : null}
      </View>
    </Page>
  );
}

interface ProductCatalogPDFProps {
  products: InventoryItem[];
  catalogTitle?: string;
  includeStock: boolean;
  orientation: 'landscape' | 'portrait';
  logoSrc?: string;
}

export default function ProductCatalogPDF({
  products = [],
  catalogTitle,
  includeStock = false,
  orientation = 'landscape',
  logoSrc = '',
}: ProductCatalogPDFProps) {
  void catalogTitle;
  void includeStock;
  const t = (key: string) => translate(key);
  const layout = getCatalogLayout(orientation);
  const noImageLabel = t('inventory.catalog.noImage');

  // Handle empty products
  if (!products || products.length === 0) {
    return (
      <Document>
        <CatalogCoverPage orientation={orientation} logoSrc={logoSrc} />
        <Page size="A4" orientation={orientation} style={catalogPageStyle(layout)}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: '#666' }}>{t('inventory.catalog.noProductsAvailable')}</Text>
          </View>
        </Page>
      </Document>
    );
  }

  const validPages = chunkProducts(products, layout.productsPerPage);

  return (
    <Document>
      <CatalogCoverPage orientation={orientation} logoSrc={logoSrc} />
      {validPages.map((pageProducts, pageIndex) => (
        <Page
          key={pageIndex}
          size="A4"
          orientation={orientation}
          style={catalogPageStyle(layout)}
          wrap={false}
        >
          <CatalogProductPage
            pageProducts={pageProducts}
            layout={layout}
            noImageLabel={noImageLabel}
          />

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
