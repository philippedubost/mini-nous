import { NavLink, Outlet, Link } from 'react-router-dom'

const NAV = [
  { to: '/admin', label: 'Générations', end: true },
  { to: '/admin/settings', label: 'Paramètres' },
  { to: '/lab', label: 'Labo trace' },
]

export default function AdminLayout() {
  return (
    <div className="min-h-screen bg-stone-950 flex flex-col">
      <header className="border-b border-stone-800 bg-stone-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link to="/" className="text-sm text-stone-500 hover:text-stone-300 shrink-0">← Pipeline</Link>
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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
