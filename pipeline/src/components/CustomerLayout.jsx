import { Link } from 'react-router-dom'

export default function CustomerLayout({ children, navRight, title, subtitle, center }) {
  return (
    <div className="customer-page">
      <header className="customer-nav">
        <Link to="/" className="customer-logo">
          <span>Mini</span>Nous
        </Link>
        {navRight}
      </header>
      <main className={`customer-main${center ? ' flex flex-col items-center justify-center min-h-[calc(100vh-64px)]' : ''}`}>
        {(title || subtitle) && (
          <div className="space-y-1">
            {title && <h1 className="text-2xl font-bold">{title}</h1>}
            {subtitle && <p className="customer-muted text-sm leading-relaxed">{subtitle}</p>}
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
