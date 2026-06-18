export default function PaymentCancelPage() {
  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-stone-800 bg-stone-900/80 p-8 text-center space-y-5">
        <div className="text-5xl">🌿</div>
        <h1 className="text-2xl font-bold text-stone-100">Pas de souci</h1>
        <p className="text-stone-400 text-sm leading-relaxed">
          Vous avez annulé le paiement — rien n&apos;a été débité.
          Vos places pour l&apos;édition du mardi vous attendent toujours.
        </p>
        <a
          href="/#packs"
          className="inline-block w-full py-3.5 rounded-xl font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950 transition-colors"
        >
          Revoir les packs
        </a>
        <a href="/" className="block text-sm text-stone-500 hover:text-stone-300">
          ← Accueil
        </a>
      </div>
    </div>
  )
}
