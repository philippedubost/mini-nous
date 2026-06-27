import { useState } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import CustomerLayout from '../components/CustomerLayout'
import AppBuildFooter from '../components/AppBuildFooter'
import { checkAdminPassword, isAdminAuthed, setAdminAuthed } from '../lib/adminAuth'

const NAV = [
  { to: '/', label: 'Accueil', end: true },
  { to: '/metrics', label: 'Métriques' },
  { to: '/serveur', label: 'Serveur' },
  { to: '/generations', label: 'Générations' },
  { to: '/settings', label: 'Paramètres' },
  { to: '/lab/trace', label: 'Labo trace' },
]

function AdminLogin() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)

  return (
    <CustomerLayout center title="Admin MiniNous" subtitle="Carte produit · production · labo">
      <form
        className="customer-card w-full max-w-sm space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (checkAdminPassword(password)) {
            setAdminAuthed()
            window.location.reload()
            return
          }
          setError('Mot de passe incorrect')
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide customer-muted">Mot de passe</span>
          <input
            type="password"
            autoComplete="current-password"
            className="customer-input w-full"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null) }}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="customer-btn-clay w-full">Entrer →</button>
        <Link to="/" className="customer-link block text-center text-sm">← Boutique</Link>
      </form>
    </CustomerLayout>
  )
}

export default function AdminLayout() {
  if (!isAdminAuthed()) return <AdminLogin />

  return (
    <div className="min-h-screen bg-stone-950 flex flex-col">
      <header className="border-b border-stone-800 bg-stone-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link to="/" className="text-sm text-stone-500 hover:text-stone-300 shrink-0">← Boutique</Link>
            <h1 className="text-lg font-bold text-stone-100 truncate">Admin Mini-Nous</h1>
          </div>
          <nav className="flex gap-1 p-1 bg-stone-800 rounded-xl shrink-0">
            {NAV.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-stone-700 text-stone-100' : 'text-stone-500 hover:text-stone-300'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 w-full max-w-[1680px] mx-auto px-4 py-6">
        <Outlet />
      </main>
      <AppBuildFooter variant="dark" />
    </div>
  )
}
