import { Link } from 'react-router-dom'
import AppBuildFooter from './AppBuildFooter'
import BrandLogo from './BrandLogo'

export default function CustomerLayout({ children, navRight, title, subtitle, center }) {
  return (
    <div className="customer-page flex flex-col min-h-screen">
      <header className="customer-nav">
        <Link to="/compte" className="customer-logo brand-logo" aria-label="WoodTribe — accueil">
          <BrandLogo />
        </Link>
        {navRight}
      </header>
      <main className={`customer-main flex-1${center ? ' flex flex-col items-center justify-center min-h-[calc(100vh-64px)]' : ''}`}>
        {(title || subtitle) && (
          <div className="space-y-1">
            {title && <h1 className="text-2xl font-bold">{title}</h1>}
            {subtitle && <p className="customer-muted text-sm leading-relaxed">{subtitle}</p>}
          </div>
        )}
        {children}
      </main>
      <AppBuildFooter />
    </div>
  )
}
