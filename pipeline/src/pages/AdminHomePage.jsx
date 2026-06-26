import { Link } from 'react-router-dom'
import {
  FlowArrowDown,
  FlowArrowRight,
  FlowBranch,
  FlowCard,
  FlowLane,
  FlowPanel,
  FlowStepper,
  SurfaceLegend,
} from '../components/AdminFlowDiagram'

function RouteCard({ path, desc, note, href, to }) {
  const inner = (
    <>
      <code className="text-sm text-stone-100">{path}</code>
      <p className="text-sm text-stone-400 mt-1">{desc}</p>
      {note && <p className="text-xs text-stone-500 mt-1">{note}</p>}
    </>
  )
  const cls = 'block rounded-xl border border-stone-800 bg-stone-900/60 p-4 hover:border-stone-600 transition-colors'
  if (href) return <a href={href} className={cls}>{inner}</a>
  if (to) return <Link to={to} className={cls}>{inner}</Link>
  return <div className={cls}>{inner}</div>
}

export default function AdminHomePage() {
  return (
    <div className="space-y-8 max-w-6xl">
      <header className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-500">Carte du produit</p>
        <h2 className="text-2xl font-bold text-stone-100">MiniNous — de la photo à la figurine</h2>
        <p className="text-stone-400 leading-relaxed max-w-3xl">
          Trois apps distinctes. Le vrai studio est dans <code className="text-stone-300">/pipeline/studio</code>
          {' '}— pas la maquette « Editor » de la landing.
        </p>
        <SurfaceLegend />
      </header>

      <FlowPanel
        title="1 · Parcours client"
        subtitle="De l’upload photo à la figurine reçue — ce que vit le client."
      >
        <div className="flex flex-col items-center">
          <FlowCard tone="shop" icon="🏠" title="Landing boutique" path="/"
            detail="Upload photo, choix pack ou détection visages." tag="Boutique" />
          <FlowArrowDown label="POST /api/order-start · photo → R2" />
          <FlowCard tone="shop" icon="🛒" title="Paywall" path="index.html"
            detail="Adultes / enfants, total figurines, mode cadeau." tag="Composition" />
          <FlowArrowDown label="Étape livraison · FR / international · newsletter" />
          <FlowCard tone="shop" icon="📦" title="Livraison + tarif" path="GET /api/quote"
            detail="Port, express vendredi, adresse saisie." tag="Devis serveur" />
          <FlowArrowDown label="POST /api/checkout" />
          <FlowCard tone="api" icon="💳" title="Stripe Checkout" path="checkout.stripe.com"
            detail="Paiement sécurisé · promo codes." tag="Paiement" />
          <FlowArrowDown label="Retour success_url + session_id" />
          <FlowCard tone="pipeline" icon="🎨" title="Studio client" path="/pipeline/studio?order=TOKEN"
            detail="FAL génère tracé · validation v1→v2→v3." tag="Studio" />
          <FlowArrowDown label="Client valide le tracé" />
          <FlowCard tone="pipeline" icon="✓" title="Tracé validé" path="workflow: approved"
            detail="Email confirmation · prêt à fabriquer." tag="Validation" />
          <FlowArrowDown label="Admin drag kanban" />
          <div className="flex flex-wrap justify-center gap-3 items-start">
            <FlowCard tone="admin" icon="⚙️" title="Fabrication" path="/admin/commandes"
              detail="in_production — atelier Nantes." tag="Admin" />
            <FlowArrowRight label="expédie" />
            <FlowCard tone="admin" icon="🚚" title="Expédié" path="workflow: shipped"
              detail="Email tracé validé + coupon -10 %." tag="Admin" />
            <FlowArrowRight label="post-livraison" />
            <FlowCard tone="pipeline" icon="⭐" title="Engagement" path="/pipeline/commande"
              detail="NPS Trustpilot · #MiniNous -20 %." tag="Fidélité" />
          </div>
        </div>
      </FlowPanel>

      <FlowPanel
        title="2 · Pipeline technique"
        subtitle="Photo → assets R2 → FAL → tracé → (optionnel) SVG labo → fabrication."
      >
        <div className="space-y-4">
          <FlowLane title="Entrée paywall" tone="shop">
            <FlowCard tone="shop" icon="📷" title="Photo source" detail="JPEG/WebP max 3 Mo" tag="source" />
            <FlowArrowRight label="upload R2" />
            <FlowCard tone="api" icon="🗄️" title="draft_generation" detail="mini_nous_generations" tag="Supabase" />
          </FlowLane>

          <div className="flex justify-center">
            <FlowArrowDown label="Studio auto=1 · fal-ai/nano-banana-pro/edit" />
          </div>

          <FlowLane title="Génération FAL" tone="fal">
            <FlowCard tone="fal" icon="1️⃣" title="Step 1" detail="Mise en scène atelier · prompt settings" tag="step1" />
            <FlowArrowRight label="enchaîne" />
            <FlowCard tone="fal" icon="2️⃣" title="Step 2" detail="Line art · ref line art admin" tag="step2" />
            <FlowArrowRight label="versions" />
            <FlowCard tone="fal" icon="↻" title="v1 · v2 · v3" detail="Regen auto puis révision équipe" tag="assets" />
          </FlowLane>

          <FlowBranch
            label="branches parallèles"
            left={(
              <FlowCard tone="pipeline" icon="👤" title="Studio client" path="/pipeline/studio"
                detail="Valider · ajuster · choisir version." tag="Client" />
            )}
            right={(
              <FlowCard tone="admin" icon="🔬" title="Labo trace" path="/admin/lab/trace"
                detail="Autotrace potrace → SVG export." tag="Admin only" />
            )}
          />

          <div className="flex justify-center">
            <FlowArrowDown label="validated_lineart_version en metadata" />
          </div>

          <div className="flex justify-center">
            <FlowCard tone="fab" icon="🏭" title="Fabrication 1/10" detail="Impression · peinture · colis Nantes." tag="Atelier" />
          </div>
        </div>

        <p className="text-xs text-stone-500 border-t border-stone-800 pt-4">
          Prompts : <Link to="/settings" className="text-amber-400 hover:underline">Paramètres admin</Link>
          {' '}· Tarifs : <code className="text-stone-400">lib/server/packs.js</code>
          {' '}· <code className="text-stone-400">GET /api/quote</code>
        </p>
      </FlowPanel>

      <FlowPanel
        title="3 · Statuts commande"
        subtitle="Machine à états — ce que voit le client et ce que l’admin peut drag sur le kanban."
      >
        <FlowStepper steps={[
          { id: 'pending', tone: 'shop', label: 'pending', hint: 'Brouillon paywall', tag: 'Avant paiement' },
          { id: 'paid', tone: 'api', label: 'paid', hint: 'Stripe OK', arrowLabel: 'webhook' },
          { id: 'in_studio', tone: 'fal', label: 'in_studio', hint: 'FAL en cours' },
          { id: 'pending_validation', tone: 'pipeline', label: 'pending_validation', hint: 'Tracé prêt', arrowLabel: 'email' },
          { id: 'revision', tone: 'pipeline', label: 'revision_requested', hint: 'Équipe 24h', arrowLabel: 'ajust. v2' },
          { id: 'approved', tone: 'pipeline', label: 'approved', hint: 'Client OK', arrowLabel: 'valide' },
          { id: 'production', tone: 'fab', label: 'in_production', hint: 'Atelier', arrowLabel: 'admin drag' },
          { id: 'shipped', tone: 'admin', label: 'shipped', hint: 'Colis parti', arrowLabel: 'admin drag' },
        ]} />
      </FlowPanel>

      <FlowPanel title="4 · Où aller ?" subtitle="Raccourcis vers les outils du quotidien.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <RouteCard to="/commandes" path="/admin/commandes" desc="Kanban — drag approved → fab → expédié." />
          <RouteCard to="/generations" path="/admin/generations" desc="Liste FAL + batch fabrication." />
          <RouteCard to="/metrics" path="/admin/metrics" desc="Conversion funnel · liste d'attente · taux upload→paiement." />
          <RouteCard to="/settings" path="/admin/settings" desc="Prompts step1/2 + ref line art." />
          <RouteCard to="/lab/trace" path="/admin/lab/trace" desc="Test SVG / autotrace hors commande." />
          <RouteCard href="/server" path="/server" desc="Worker studio — pico PC, chaînage FAL." note="Mot de passe atelier" />
          <RouteCard href="/pipeline/studio" path="/pipeline/studio" desc="Studio client." note="?order=TOKEN&auto=1" />
          <RouteCard href="/pipeline/test" path="/pipeline/test" desc="Test E2E Stripe 4242…" />
          <RouteCard href="/" path="/" desc="Boutique landing + paywall." />
          <RouteCard href="/pipeline/commande" path="/pipeline/commande" desc="Suivi commande + galerie tracé." />
          <RouteCard href="/pipeline/legacy" path="/pipeline/legacy" desc="Ancien pipeline dev — éviter." />
        </div>
      </FlowPanel>

      <div className="rounded-xl border border-stone-800 bg-stone-900/40 p-5 text-sm text-stone-400 space-y-2">
        <p className="font-semibold text-stone-300">Dev local</p>
        <p><code className="text-stone-300">npm run dev</code> → <code className="text-stone-300">localhost:3333</code> · API + /pipeline + /admin</p>
        <p>Auth admin : header <code className="text-stone-300">X-MiniNous-Admin</code> · Test flow : <code className="text-stone-300">/pipeline/test</code></p>
      </div>
    </div>
  )
}
