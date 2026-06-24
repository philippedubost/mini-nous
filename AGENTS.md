# MiniNous — guide agent

Carte du repo pour limiter le scope et éviter les edits cross-couche.

## Architecture

```
/                    index.html — landing + paywall (React inline Babel)
/pipeline/           Vite React SPA (studio client, admin, trace lab)
/lib/server/         Logique métier (Supabase, Stripe, R2, FAL, batch)
/lib/api/handlers/   Handlers HTTP Vercel (minces → lib/server)
/api/                Entrées Vercel (index.js, stripe-webhook.js)
/scripts/            Dev gateway (3333), build, batch CLI
/supabase/migrations/ Schéma Postgres
```

Dev local : `npm run dev` → `http://localhost:3333` (gateway + API + proxy Vite `/pipeline`).

## Flux produit (canonique)

1. **Landing** : upload photo → `POST /api/order-start` → paywall → `POST /api/checkout` (Stripe)
2. **Retour Stripe** : `/pipeline/studio?order=TOKEN&session_id=…` → `GET /api/checkout-confirm`
3. **Studio** : génération FAL (étapes 1–2) → révision → production

**Ne pas confondre** : `Editor` / `Success` dans `index.html` = **maquette démo**, pas le vrai studio.

## Source de vérité par domaine

| Domaine | Fichiers autoritaires | Ne pas dupliquer dans |
|---------|----------------------|------------------------|
| Tarifs / packs | `lib/server/packs.js` | `index.html` paywall via `GET /api/quote` |
| Prompts pipeline | Supabase `mini_nous_pipeline_settings` + `lib/server/pipeline-settings.js` | `localStorage` prompts |
| Defaults prompts | `lib/server/pipeline-settings.js` (seed) | Garder aligné avec `pipeline/src/lib/settings.js` jusqu’à fusion JSON |
| Commandes | `lib/server/orders.js`, `paywall-order.js`, `order-workflow.js` | — |
| Checkout Stripe | `lib/api/handlers/checkout.js`, `checkout-confirm.js`, `checkout-fulfill.js` | — |
| Settings runtime | `GET/PUT /api/pipeline-settings`, `SettingsContext.jsx` | localStorage (sauf trace) |
| Génération FAL client | `pipeline/src/lib/fal.js` + pages studio | landing |
| Auth admin | `lib/server/admin.js`, `pipeline/src/lib/adminAuth.js` | — |

## Pages pipeline — laquelle modifier ?

| Page | Route | Usage |
|------|-------|--------|
| `OrderStatusPage.jsx` | `/commande` | **Page unique** — commande + studio post-paiement |
| `StudioPage.jsx` | `/studio` | Redirect → `/commande` (compatibilité liens) |
| `NewOrderPage.jsx` | `/commande/nouvelle` | Admin / tests commande |
| `PipelinePage.jsx` | `/legacy` | **Legacy** — éviter sauf fix ciblé |
| `AdminGenerationPage.jsx` | `/admin/generations/:id` | Rerun FAL admin |
| `AdminSettingsPage.jsx` | `/admin/settings` | Prompts + ref line art |

## API — enregistrer une route

1. Handler dans `lib/api/handlers/<name>.js`
2. Export dans `lib/api/router.js` → `routes`
3. Limite Vercel : ~12 fonctions — préférer router `api/index.js`

## Pack `solo` et DB

- Tarif : `solo` dans `lib/server/packs.js`
- Contrainte Postgres : `pack_type IN ('solo','duo','famille','grande_famille')` — migration `20260620140000_solo_pack_type.sql`
- Repli temporaire : `packTypeForDatabase()` mappe `solo` → `duo` si migration non appliquée

## Stripe / URLs

- Production : `getSiteUrl()` force `https://mininous.app` (`lib/server/stripe-client.js`)
- Variables : `SITE_URL`, clés `STRIPE_*` / `STRIPE_*_TEST`

## Règles Cursor

Détails par zone : `.cursor/rules/*.mdc`

## Checklist avant PR

- [ ] Prix modifié → `packs.js` uniquement (paywall lit `/api/quote`)
- [ ] Prompt modifié → serveur + admin settings (Supabase)
- [ ] Nouvelle route API → `router.js` + handler + CORS si POST
- [ ] Pas de commit sauf demande explicite
