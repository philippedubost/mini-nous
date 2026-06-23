import { Outlet } from 'react-router-dom'
import AppBuildFooter from '../components/AppBuildFooter'

export default function LabLayout() {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col">
      <header className="border-b border-stone-800 bg-stone-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <a href="/pipeline/" className="text-sm text-stone-500 hover:text-stone-300">← Pipeline</a>
          <h1 className="text-lg font-bold mt-0.5">Labo trace</h1>
        </div>
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
      <AppBuildFooter variant="dark" />
    </div>
  )
}
