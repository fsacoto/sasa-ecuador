# SASA Ecuador — Hub de inventario

Sistema de inventario (Firebase) para SASA Ecuador. Fuente de verdad de productos, precios y stock.

## Desarrollo local

```bash
cp .env.example .env.local
# Completa las variables Firebase (proyecto sasa-ecuador-dev) y la Store API (ver abajo)
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

---

## Store API (Tienda SASA Ecuador)

API de solo lectura para que la tienda (otro repo, también en local) consuma productos publicados.

**Base URL (local):** `http://localhost:3000`

### Autenticación

Todas las rutas requieren API key compartida:

| Header | Ejemplo |
|--------|---------|
| `X-API-Key` | `dev-sasa-store-key-change-me` |
| `Authorization` | `Bearer dev-sasa-store-key-change-me` |

### Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `STORE_API_KEY` | Sí | Secreto compartido con la tienda |
| `STORE_API_CORS_ORIGIN` | No | Orígenes CORS separados por coma (default: `*`) |

La Store API lee Firestore con el SDK cliente (lectura pública de `inventory`). No requiere service account.

**Ejemplo `.env.local` (fragmento):**

```env
STORE_API_KEY=dev-sasa-store-key-change-me
STORE_API_CORS_ORIGIN=http://localhost:3001
```

### Endpoints

#### `GET /api/store/products`

Lista productos activos listos para la tienda.

**Query opcional:** `?category=earrings|necklaces|rings|bracelets`

```bash
curl -s "http://localhost:3000/api/store/products" \
  -H "X-API-Key: dev-sasa-store-key-change-me"
```

```bash
curl -s "http://localhost:3000/api/store/products?category=earrings" \
  -H "Authorization: Bearer dev-sasa-store-key-change-me"
```

**Respuesta:**

```json
{
  "products": [
    {
      "id": "abc123",
      "slug": "aretes-luna-arba0001",
      "name": "Aretes Luna",
      "price": 24.5,
      "category": "earrings",
      "material": "gold-plated",
      "images": ["https://firebasestorage.googleapis.com/..."],
      "description": "Aretes delicados...",
      "details": "",
      "care": "",
      "stock": 3,
      "isBestSeller": false,
      "isNew": false,
      "variants": []
    }
  ]
}
```

#### `GET /api/store/products/[slug]`

Un producto por slug.

```bash
curl -s "http://localhost:3000/api/store/products/aretes-luna-arba0001" \
  -H "X-API-Key: dev-sasa-store-key-change-me"
```

**Respuesta:** `{ "product": { ... } }` — mismo shape que cada ítem del listado.

**Errores:** `401` sin API key, `404` slug inexistente, `400` categoría inválida.

---

## Contrato de producto (tienda)

| Campo | Tipo | Origen en Firebase |
|-------|------|-------------------|
| `id` | string | ID del documento `inventory` |
| `slug` | string | Campo `slug` o generado desde `name` + `sku` |
| `name` | string | `name` |
| `price` | number | `salePrice` (USD) |
| `category` | enum | `category` → ver mapeo abajo |
| `material` | enum | `line` → ver mapeo abajo |
| `images` | string[] | `images` + CMS publicado (URLs https) |
| `description` | string | `description` |
| `details` | string | Campo `details` (opcional) |
| `care` | string | Campo `care` (opcional) |
| `stock` | number | `ecuadorStock` (+ legacy `usaStock`) |
| `isBestSeller` | boolean | Campo `isBestSeller` (default `false`) |
| `isNew` | boolean | Campo `isNew` (default `false`) |
| `variants` | string[] | Campo `variants` (default `[]`) |

### Mapeo de categorías

| Firebase (`category`) | API (`category`) |
|-----------------------|------------------|
| Aretes | `earrings` |
| Cadenas | `necklaces` |
| Anillos | `rings` |
| Pulseras | `bracelets` |

También acepta valores legados en inglés (`Earring`, `Necklace`, etc.). **Sets** y **Tobilleras** no se exponen en la API de tienda.

### Mapeo de material (`line`)

| Firebase (`line`) | API (`material`) |
|-------------------|------------------|
| Baño en Oro | `gold-plated` |
| Enchapado en Oro | `gold-filled` |
| Plata esterlina | `sterling-silver` |

### Productos “activos”

Un producto aparece en la API si:

1. No tiene `storeActive: false`
2. Su categoría mapea a Aretes / Cadenas / Anillos / Pulseras

`salePrice` ausente se envía como `price: 0`. Sets y Tobilleras no se exponen.

### Campos recomendados para agregar en Firestore

| Campo | Tipo | Para qué |
|-------|------|----------|
| `slug` | string | URL estable en la tienda (sin depender del nombre) |
| `storeActive` | boolean | Control explícito de publicación (`true` / `false`) |
| `details` | string | Ficha extendida del producto |
| `care` | string | Cuidados del material |
| `isBestSeller` | boolean | Destacado en vitrina |
| `isNew` | boolean | Badge “nuevo” |
| `variants` | string[] | Tallas, acabados u opciones |

Sin estos campos la API funciona con defaults (slug generado, strings vacíos, flags en `false`).

---

## Otros scripts

```bash
npm run build
npm run lint
npm run firebase:deploy:dev
```

Ver también: `CMS_README.md`, `QUICK_SETUP.md`, `VERCEL_PRODUCTION_SETUP.md`.
