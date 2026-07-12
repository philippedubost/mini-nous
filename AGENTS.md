# Wood-Tribe / MiniNous — guide agent Cursor

Monorepo e-commerce : figurines en bois personnalisées depuis une photo de groupe, édition hebdomadaire (« Édition du Mardi »), atelier Nantes.

**État du rebrand :** la marque **WoodTribe** existe en landing générée (`woodtribe.html`). Le code interne, la DB et les APIs restent largement **`mini_nous_*` / `mini-nous`**. Ne pas renommer en masse sans demande explicite.

---

## Architecture (4 couches — ne pas mélanger)

```
index.html, woodtribe.html   Landing marketing + paywall (React inline Babel CDN)
pipeline/                    3 SPAs Vite React (client, admin, atelier)
lib/server/                  Logique métier (Supabase, Stripe, R2, FAL, batch)
lib/api/handlers/            Handlers HTTP minces → lib/server
api/                         Entrées Vercel (index.js router, stripe-webhook.js)
scripts/                     Gateway dev (3333), build, batch CLI, sync WoodTribe
supabase/migrations/         Schéma Postgres incrémental
```

**Dev local :** `npm run dev` → `http://localhost:3333` (gateway + API hot-reload + proxy Vite).

---

## Marques & landings

| Marque | Fichier source | URL prod | Paywall |
|--------|----------------|----------|---------|
| **WoodTribe** (principal) | `woodtribe.html` (**généré**) | `/`, `/commander` | `/commander` |
| MiniNous (legacy) | `index.html` | `/mininous` | `/mininous/commander` |

**Domaine prod :** `https://woodtribe.fr` (`getSiteUrl()` force cette URL en production).

**Règle WoodTribe :** modifier **`index.html`** (base partagée), puis regénérer via `npm run gen:woodtribe`. **Ne jamais éditer `woodtribe.html` à la main.**

Script : `scripts/gen-woodtribe-html.mjs` — produit la landing home avec `BRAND_ID='woodtribe'`, chemins `/` + `/commander`.

Redirections legacy : `/woodtribe` → `/`, `/mes-figurines` → `/commander`.

---

## Flux produit (canonique)

### 1. Landing → paiement
1. Upload photo → `POST /api/order-start` (photo → R2, brouillon)
2. Paywall : `GET /api/quote?faces=N` (+ `friday=1` si option)
3. `POST /api/checkout` → Stripe Checkout
4. Catalogue / capacité : `GET /api/week-status`

### 2. Retour Stripe → studio client
- **Success URL :** `/pipeline/commande?order=TOKEN&auto=1&session_id=…`
- Au load : `GET /api/checkout-confirm` (via `pipeline/src/lib/storage.js`)
- **Page principale post-paiement :** `OrderStatusPage.jsx` + `StudioCustomerFlow.jsx`
- `/pipeline/studio` = **redirect legacy** vers `/commande` (`StudioPage.jsx`)

### 3. Studio → production
1. Génération FAL étapes 1–2 (`/api/studio-generate`, `/api/fal` proxy)
2. Validation line art client (`/api/orders` PATCH workflow)
3. Révisions manuelles (`/api/revisions`)
4. Laser SVG (`/api/studio-laser`, lazy route)
5. Batch hebdo (`/api/production-weeks`, `lib/server/batch.js`)
6. Expédition (workflow `shipped`)

### 4. Compte client
- `/pipeline/compte` — historique commandes, magic link Supabase
- `GET/POST /api/me` — claim commande, création admin

### 5. Atelier / admin
- **Admin :** `/admin/` — kanban, générations, settings, metrics
- **Atelier :** `/server/` — kanban motor (auth mot de passe)
- API atelier : `/api/studio-worker`, `/api/studio-generate`

**Piège :** `Editor` / `Success` / `PEOPLE` dans `index.html` = **maquette démo UI**, pas le vrai studio.

---

## 3 SPAs React (`pipeline/`)

Build Vite produit 3 bundles (`pipeline/vite.config.js`) :

| Entrée | Basename | Fichier bootstrap | Usage |
|--------|----------|-------------------|-------|
| `index.html` | `/pipeline` | `main.jsx` | Client post-paiement, compte, lab |
| `admin.html` | `/admin` | `admin-main.jsx` | Back-office |
| `server.html` | `/server` | `server-main.jsx` | Atelier (écran atelier dédié) |

### Routes client (`main.jsx`)

| Route | Page | Notes |
|-------|------|-------|
| `/commande` | `OrderStatusPage` | **Flux principal post-paiement** |
| `/studio` | `StudioPage` | Redirect → `/commande` |
| `/compte` | `AccountPage` | |
| `/compte/connexion` | `AccountLoginPage` | |
| `/nouvelle-commande` | `NewOrderPage` | Admin / tests |
| `/legacy` | `PipelinePage` | **Legacy — éviter** |
| `/lab/trace` | `TraceLabPage` | Algo trace |
| `/test` | `TestFlowPage` | Harness E2E |
| `/paiement/reussi`, `/paiement/annule` | Payment pages | Legacy / annulation MiniNous |

### Routes admin (`admin-main.jsx`)

| Route | Page |
|-------|------|
| `/` | `AdminHomePage` |
| `/serveur`, `/serveur/c/:orderId` | Kanban atelier |
| `/generations`, `/g/:id` | Liste + détail génération |
| `/settings` | Prompts FAL + ref line art |
| `/metrics` | Funnel |
| `/lab/trace` | Trace lab |

### Routes atelier (`server-main.jsx`)

| Route | Page |
|-------|------|
| `/` | `ServerWorkerPage` |
| `/c/:orderId` | `ServerOrderPage` |

---

## API — registre complet

Dispatch : `vercel.json` rewrite → `api/index.js` → `lib/api/router.js` → `lib/api/handlers/<name>.js`.

Routes **lazy** (import dynamique) : `trace-autotrace`, `studio-laser`.

| Route | Méthodes | Rôle | Auth |
|-------|----------|------|------|
| `order-start` | POST, PATCH | Brouillon landing + photo R2 | Public |
| `quote` | GET | Devis paywall `?faces=N` | Public |
| `week-status` | GET | Semaine prod, packs, capacité | Public |
| `checkout` | POST | Session Stripe | Public |
| `checkout-confirm` | GET | Confirmation retour Stripe | Token commande |
| `stripe-webhook` | POST | Webhooks Stripe (fonction séparée) | Signature Stripe |
| `orders` | GET, PATCH | Détail + actions workflow | Token / JWT / admin |
| `revisions` | GET, POST | Révisions manuelles | Token payé |
| `me` | GET, POST | Compte, claim, create_order | JWT Bearer |
| `generations` | GET, POST, PATCH | CRUD générations | Admin pour publish |
| `pipeline-settings` | GET, PUT, POST | Prompts globaux FAL | GET public ; PUT/POST admin |
| `fal` | * | Proxy FAL (`FAL_KEY` serveur) | Public |
| `studio-generate` | POST | Orchestration FAL studio | Token ou worker |
| `studio-worker` | GET, POST, PATCH | Kanban atelier + locks | Worker Bearer |
| `studio-laser` | POST | Pipeline SVG laser | Worker |
| `production-weeks` | GET, POST | Batch hebdo | Admin UI (convention) |
| `upload-r2` | POST | Upload assets pipeline | — |
| `proxy-image` | GET | Proxy images R2/FAL | Public (allowlist) |
| `landing-preview` | GET, POST | Preview FAL landing | Public |
| `trace-autotrace` | POST | Autotrace serveur | Public |
| `engagement` | POST | NPS + programme partage | Token |
| `track` | POST | Analytics funnel | Public |
| `metrics` | GET | Dashboard funnel | Admin |
| `waitlist` | POST | Liste d'attente sold out | Public |
| `promo-codes` | GET, POST, DELETE | Codes promo Stripe | Admin |
| `test-flow` | GET, POST | Harness tests E2E | Dev ou admin |

**Enregistrer une route :** handler → `lib/api/router.js` → compter fonctions Vercel (~12 max, préférer router unique).

**Auth admin :** header `X-MiniNous-Admin: <ADMIN_PASSWORD>` ou JWT Supabase admin (`lib/server/admin.js`).

**Auth atelier :** `Authorization: Bearer` avec `ADMIN_PASSWORD` ou `STUDIO_GENERATE_SECRET`.

---

## Source de vérité par domaine

| Domaine | Fichiers autoritaires | Ne pas dupliquer dans |
|---------|----------------------|------------------------|
| Tarifs / packs | `lib/server/packs.js` | `index.html` — utiliser `/api/quote` |
| Commandes | `orders.js`, `paywall-order.js`, `order-workflow.js` | — |
| Checkout Stripe | `handlers/checkout.js`, `checkout-confirm.js`, `checkout-fulfill.js` | — |
| Prompts FAL | Supabase `mini_nous_pipeline_settings` + `pipeline-settings.js` | localStorage (sauf trace lab) |
| Defaults prompts | `pipeline-settings.js` (seed) | Aligner avec `pipeline/src/lib/settings.js` |
| Settings runtime | API + `SettingsContext.jsx` | localStorage prompts |
| Génération FAL client | `pipeline/src/lib/fal.js` + pages studio | landing |
| Auth admin | `lib/server/admin.js`, `adminAuth.js` | — |
| Auth client | `AuthContext.jsx`, `lib/server/auth.js` | — |
| Emails | `lib/server/order-email.js` (Resend) | — |
| Semaines prod | `lib/server/weeks.js`, `week-status-fallback.js` | — |
| Batch laser | `batch.js`, `batchPaths.js`, `studio-laser.js` | — |
| Assets R2 | `r2.js`, `assets.js`, `asset-url.js` | — |

---

## Base de données (Supabase)

Préfixe tables : **`mini_nous_*`** (ne pas renommer sans migration).

| Table | Rôle |
|-------|------|
| `mini_nous_orders` | Commandes (status, workflow_status, pack_type, metadata) |
| `mini_nous_generations` | Runs FAL liés à une commande |
| `mini_nous_generation_steps` | Étapes + assets par génération |
| `mini_nous_asset_versions` | Versions R2 (line art, etc.) |
| `mini_nous_production_weeks` | Éditions hebdo (cutoff, ship, capacité) |
| `mini_nous_pipeline_settings` | JSON prompts (`id='global'`) |
| `mini_nous_revision_requests` | Révisions manuelles |
| `mini_nous_waitlist` | Liste d'attente |
| `mini_nous_funnel_events` | Analytics |

**workflow_status :** `awaiting_photo` → `in_studio` → `pending_validation` → `revision_requested` → `approved` → `in_production` → `shipped`

**pack_type :** `solo`, `duo`, `famille`, `grande_famille` — utiliser `packTypeForDatabase()` à l'insert (repli `solo`→`duo` si migration absente).

Migrations : `supabase/migrations/`.

---

## Services externes & env

Fichier unique : **`.env` à la racine** (jamais `pipeline/.env`). Voir `.env.example`.

| Service | Variables clés |
|---------|----------------|
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_*` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_*_TEST`, `STRIPE_USE_TEST`, webhooks |
| R2 | `R2_ACCOUNT_ID`, `R2_*`, `R2_PUBLIC_DOMAIN` |
| FAL | `FAL_KEY` |
| Resend | `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL` |
| Site | `SITE_URL` (prod forcée `https://woodtribe.fr` dans `stripe-client.js`) |
| Atelier | `ADMIN_PASSWORD`, `STUDIO_GENERATE_SECRET`, `STUDIO_AUTO_CHAIN` |
| Prod | `PRODUCTION_WEEK_CAPACITY` |

---

## Build & déploiement

| Commande | Effet |
|----------|-------|
| `npm run dev` | Gateway :3333, Vite :3400, sync WoodTribe, build info |
| `npm run build` | `dist/` — landings, pipeline/admin/server SPAs, assets |
| `npm run gen:woodtribe` | Regénère `woodtribe.html` depuis `index.html` |
| `npm run batch` | CLI production batch |
| `npm run test:e2e` | Playwright (`tests/e2e/`) |

**Gateway (`scripts/gateway.mjs`) :** `/api/*` hot-reload ; `/` + `/commander` → `woodtribe.html` ; `/mininous` → `index.html` ; `/pipeline`, `/admin`, `/server` → Vite.

**Build :** `dist/index.html` = WoodTribe (home) ; `dist/mininous.html` = MiniNous legacy.

**Vercel :** `vercel.json` — output `dist/`, rewrites SPA + API.

---

## Modules serveur (`lib/server/`)

| Module | Rôle |
|--------|------|
| `packs.js` | Tarifs, `computeQuote`, `formatQuoteForClient` |
| `orders.js` | CRUD commandes, tokens, mark paid |
| `paywall-order.js` | Brouillon landing |
| `checkout-fulfill.js` | Post-Stripe, email, queue studio |
| `order-access.js` | Auth token, payload client |
| `order-workflow.js` | Statuts workflow |
| `order-email.js` | Templates Resend |
| `pipeline-settings.js` | Prompts globaux Supabase |
| `fal-studio.js`, `fal-landing.js` | FAL serveur |
| `studio-generate.js` | Orchestration étapes 1–2 |
| `studio-laser.js`, `studio-laser-pipeline.js` | SVG laser |
| `studio-board.js`, `studio-worker-actions.js`, `motor-lock.js` | Kanban atelier |
| `weeks.js`, `week-status-fallback.js` | Semaines production |
| `batch.js`, `batchPaths.js`, `fabrication.js` | Batch hebdo |
| `r2.js`, `assets.js`, `asset-url.js` | Stockage |
| `stripe-client.js`, `stripe-config.js` | Stripe |
| `admin.js`, `admin-workflow.js` | Auth + overrides admin |
| `auth.js` | JWT Supabase |
| `funnel.js`, `waitlist.js` | Analytics + waitlist |
| `shipping.js`, `delivery-dates.js` | Livraison |
| `test-flow.js` | Harness E2E |
| `promo-coupon.js` | Codes promo fidélité |

Trace serveur : `lib/server/trace/` (dom, outline, socle).

---

## Tests

- **E2E :** `tests/e2e/full-flow.spec.mjs` — Playwright, base `:3333`, timeout 180s
- **Harness :** `/pipeline/test` + `/api/test-flow` (actions : `create_draft`, `checkout`, `confirm_payment`, `full_start`)
- Activer : `ENABLE_TEST_FLOW` ou header admin en dev/preview

Pas de suite unitaire JS hors Playwright.

---

## Règles Cursor (détails par zone)

| Fichier | Scope |
|---------|-------|
| `.cursor/rules/mini-nous-core.mdc` | Toujours — cartographie couches |
| `.cursor/rules/landing.mdc` | `index.html` |
| `.cursor/rules/woodtribe-landing.mdc` | Sync WoodTribe |
| `.cursor/rules/commerce.mdc` | Packs, checkout, commandes |
| `.cursor/rules/pipeline-customer.mdc` | Studio client `/commande` |
| `.cursor/rules/pipeline-admin.mdc` | Admin |
| `.cursor/rules/worker-server.mdc` | Atelier `/server` |
| `.cursor/rules/pipeline-settings.mdc` | Prompts FAL |
| `.cursor/rules/trace-laser.mdc` | Trace + laser |
| `.cursor/rules/auth-account.mdc` | Compte Supabase |
| `.cursor/rules/api-server.mdc` | Handlers + serveur |
| `.cursor/rules/testing.mdc` | E2E + test-flow |

---

## Checklist avant PR

- [ ] Prix modifié → `packs.js` uniquement (paywall lit `/api/quote`)
- [ ] Landing MiniNous modifiée → regénérer WoodTribe (`gen:woodtribe`)
- [ ] Prompt modifié → serveur + admin settings (Supabase) + defaults client si besoin
- [ ] Nouvelle route API → `router.js` + handler + CORS si POST
- [ ] Fonctions Vercel ≤ ~12
- [ ] Pas de commit sauf demande explicite
