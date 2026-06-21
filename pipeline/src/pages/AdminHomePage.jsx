import { Link } from 'react-router-dom'

function MermaidBlock({ chart }) {
  return (
    <pre className="admin-mermaid overflow-x-auto text-xs leading-relaxed p-4 rounded-xl bg-stone-900 border border-stone-800 text-stone-300">
      {chart.trim()}
    </pre>
  )
}

function RouteCard({ method, path, desc, note }) {
  return (
    <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-4 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {method && (
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-stone-800 text-amber-400">
            {method}
          </span>
        )}
        <code className="text-sm text-stone-100">{path}</code>
      </div>
      <p className="text-sm text-stone-400">{desc}</p>
      {note && <p className="text-xs text-stone-500">{note}</p>}
    </div>
  )
}

function FeatureBlock({ title, items }) {
  return (
    <div className="rounded-xl border border-stone-800 bg-stone-900/40 p-5 space-y-3">
      <h3 className="text-base font-semibold text-stone-100">{title}</h3>
      <ul className="space-y-2 text-sm text-stone-400 list-disc pl-5">
        {items.map(item => <li key={item}>{item}</li>)}
      </ul>
    </div>
  )
}

export default function AdminHomePage() {
  return (
    <div className="space-y-10 max-w-5xl">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-500">Carte du produit</p>
        <h2 className="text-2xl font-bold text-stone-100">MiniNous — de la photo au figurine</h2>
        <p className="text-stone-400 leading-relaxed max-w-3xl">
          Trois surfaces distinctes : la <strong className="text-stone-200">boutique</strong> (landing),
          le <strong className="text-stone-200">pipeline client</strong> (studio + suivi commande),
          et cet <strong className="text-stone-200">admin</strong> (production, FAL, batch).
          Ne pas confondre le studio réel avec la maquette « Editor » de la landing.
        </p>
      </header>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-stone-100">1 · Parcours client (boutique → figurine)</h3>
        <MermaidBlock chart={`
flowchart TD
  A["/ — Landing index.html"] --> B["Upload photo"]
  B --> C["POST /api/order-start"]
  C --> D["Paywall — composition adultes/enfants"]
  D --> E["Étape livraison — adresse, port, express"]
  E --> F["POST /api/checkout → Stripe"]
  F --> G["/pipeline/studio?order=TOKEN"]
  G --> H["Studio — FAL nano-banana-pro"]
  H --> I["Tracé v1 → ajustement auto v2 → révision équipe v3"]
  I --> J{"Client valide"}
  J -->|Oui| K["approved — prêt à fabriquer"]
  J -->|Non| I
  K --> L["Admin — in_production"]
  L --> M["Admin — shipped + email coupon -10%"]
  M --> N["NPS Trustpilot + #MiniNous"]
        `} />
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-stone-100">2 · Pipeline technique (photo → tracé → SVG)</h3>
        <MermaidBlock chart={`
flowchart LR
  subgraph paywall["Paywall / R2"]
    P0["source.webp"] --> P1["draft_generation"]
  end
  subgraph fal["FAL — fal-ai/nano-banana-pro/edit"]
    S1["step1 — mise en scène"] --> S2["step2 — line art"]
  end
  subgraph studio["Studio client"]
    V1["Tracé v1"] --> V2["Regen auto v2"]
    V2 --> V3["Révision manuelle v3"]
    V3 --> VAL["Validation + choix version"]
  end
  subgraph lab["Labo trace — /admin/lab/trace"]
    SVG["Autotrace / SVG export"]
  end
  P0 --> S1
  S2 --> V1
  S2 --> SVG
  VAL --> FAB["Fabrication atelier Nantes"]
        `} />
        <p className="text-sm text-stone-500">
          Prompts et ref line art : Supabase <code className="text-stone-400">mini_nous_pipeline_settings</code>
          {' '}· éditables dans <Link to="/settings" className="text-amber-400 hover:underline">Paramètres</Link>.
          Tarifs : <code className="text-stone-400">lib/server/packs.js</code> via <code className="text-stone-400">GET /api/quote</code>.
        </p>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-stone-100">3 · Statuts commande (workflow)</h3>
        <MermaidBlock chart={`
stateDiagram-v2
  [*] --> pending: order-start
  pending --> paid: Stripe OK
  paid --> awaiting_photo: sans photo paywall
  paid --> in_studio: photo paywall / upload studio
  in_studio --> pending_validation: tracé prêt
  pending_validation --> revision_requested: ajustement v2 manuel
  revision_requested --> pending_validation: équipe publie v3
  pending_validation --> approved: client valide
  approved --> in_production: admin drag
  in_production --> shipped: admin drag + email
        `} />
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <FeatureBlock
          title="Routes admin (cette app — /admin)"
          items={[
            '/admin — cette page (carte produit)',
            '/admin/commandes — kanban drag-and-drop (approved → fab → expédié)',
            '/admin/generations — liste générations + batch fabrication',
            '/admin/g/:id — détail génération, rerun FAL, assets',
            '/admin/settings — prompts pipeline + ref line art',
            '/admin/lab/trace — labo autotrace SVG (hors client)',
          ]}
        />
        <FeatureBlock
          title="Routes pipeline client (/pipeline)"
          items={[
            '/pipeline/studio — studio post-paiement (flux principal)',
            '/pipeline/commande — suivi commande + studio embarqué',
            '/pipeline/compte — commandes liées au compte',
            '/pipeline/test — harness E2E Stripe (admin, mot de passe)',
            '/pipeline/legacy — ancien pipeline dev (éviter)',
            '/pipeline/nouvelle-commande — création admin/test',
          ]}
        />
        <FeatureBlock
          title="Boutique (/)"
          items={[
            'Landing + paywall React inline (index.html)',
            'Packs, quote dynamique, étape livraison, Stripe Checkout',
            'Maquette Editor/Success = démo uniquement, pas le vrai studio',
          ]}
        />
        <FeatureBlock
          title="API clés (/api/*)"
          items={[
            'order-start, checkout, checkout-confirm, quote',
            'orders — link_generation, validate, regen, select_lineart',
            'generations, revisions, pipeline-settings',
            'admin-board — kanban + workflow drag',
            'test-flow — parcours auto (header X-MiniNous-Admin)',
            'engagement — NPS, #MiniNous',
          ]}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-stone-100">4 · Liens rapides</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <RouteCard path="/admin/commandes" desc="Kanban commandes payées — drag statut fabrication." />
          <RouteCard path="/admin/generations" desc="Toutes les générations FAL + export batch." />
          <RouteCard path="/admin/settings" desc="Prompts step1/step2, ref line art, résolution." />
          <RouteCard path="/admin/lab/trace" desc="Test autotrace potrace / SVG hors commande." />
          <RouteCard path="/pipeline/studio" desc="Studio client (nécessite token commande)." note="URL type ?order=TOKEN&auto=1" />
          <RouteCard path="/pipeline/test" desc="Test E2E complet Stripe 4242… → expédié." />
          <RouteCard path="/" desc="Boutique landing + paywall." />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-stone-100">5 · Rappels dev</h3>
        <div className="rounded-xl border border-stone-800 bg-stone-900/40 p-5 text-sm text-stone-400 space-y-2">
          <p><code className="text-stone-300">npm run dev</code> → gateway <code className="text-stone-300">localhost:3333</code> (API + /pipeline + /admin)</p>
          <p>Source tarifs : <code className="text-stone-300">lib/server/packs.js</code> · Auth admin : header <code className="text-stone-300">X-MiniNous-Admin</code></p>
          <p>Assets images : <code className="text-stone-300">/images/*.webp</code> · Stockage pipeline : Supabase + R2</p>
        </div>
      </section>
    </div>
  )
}
