# Configuración producción — sasa-ecuador (Vercel)

Proyecto Firebase **prod**: `sasa-ecuador`  
Proyecto Firebase **dev** (local): `sasa-ecuador-dev`

## 1. Variables en Vercel

Vercel → tu proyecto → **Settings → Environment Variables** → entorno **Production**.

Copia los valores de `.env.production.local` (o desde Firebase Console → Project settings → Web app):

| Variable | Valor (prod) |
|----------|----------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | (ver `.env.production.local`) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `sasa-ecuador.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `sasa-ecuador` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `sasa-ecuador.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `1019768152120` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:1019768152120:web:030b19882cd353141446cd` |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | `G-BC3FYB4SB5` |

**No** pongas estas variables en `.env.local` — ahí van solo las credenciales de **dev**.

## 2. Firebase Console (proyecto sasa-ecuador)

En [Firebase Console](https://console.firebase.google.com/project/sasa-ecuador):

1. **Authentication** → Sign-in method → habilitar **Email/Password**
2. **Firestore** → Create database (región recomendada: `nam5`, igual que dev)
3. **Storage** → Get started (bucket: `sasa-ecuador.firebasestorage.app`)
4. **Authentication → Settings → Authorized domains** → agregar tu URL de Vercel (ej. `tu-app.vercel.app`)

## 3. Desplegar reglas e índices a prod (terminal)

```bash
firebase login --reauth   # si hace falta
firebase use prod
npm run firebase:deploy:prod
```

Esto sube `firestore.rules`, `firestore.indexes.json` y `storage.rules` al proyecto **sasa-ecuador** (no copia datos de dev).

## 4. CORS de Storage (después del primer deploy en Vercel)

1. Edita `storage-cors.json` y reemplaza `https://your-production-domain.com` por tu URL real de Vercel.
2. Aplica CORS al bucket de prod:

```bash
gsutil cors set storage-cors.json gs://sasa-ecuador.firebasestorage.app
```

## 5. Primer usuario admin en prod

Los usuarios de dev **no** existen en prod. Crea usuarios en Authentication del proyecto prod.

Para el primer admin, después del primer login crea en Firestore:

- Colección: `users`
- Documento: `{uid del usuario}`
- Campos: `{ "role": "admin", "name": "...", "email": "..." }`

(O agrega el UID de prod a `ADMIN_USER_IDS` en `app/services/userRoles.ts` y vuelve a desplegar en Vercel.)

## 6. Desarrollo local (sin tocar prod)

Archivo `.env.local` (solo en tu Mac, gitignored):

```env
# Credenciales de sasa-ecuador-dev — NO las de prod
NEXT_PUBLIC_FIREBASE_PROJECT_ID=sasa-ecuador-dev
# ... resto desde Firebase Console → sasa-ecuador-dev → Web app
```

```bash
yarn dev
```

Todo lo que subas en localhost va a **dev**, no a Vercel/prod.

## 7. Conectar repo a Vercel

1. Push a GitHub
2. Vercel → Import project
3. Framework: Next.js (auto)
4. Variables de prod en **Production** (paso 1)
5. Deploy

## Comandos útiles

```bash
firebase use dev    # CLI apunta a sasa-ecuador-dev (default)
firebase use prod   # CLI apunta a sasa-ecuador
```
