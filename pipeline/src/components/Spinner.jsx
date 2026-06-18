export default function Spinner({ size = 'md', className = '' }) {
  const sz = size === 'sm' ? 'w-3.5 h-3.5 border' : size === 'lg' ? 'w-8 h-8 border-[3px]' : 'w-5 h-5 border-2'
  return (
    <span
      className={`inline-block shrink-0 rounded-full border-amber-500/25 border-t-amber-500 animate-spin ${sz} ${className}`}
      role="status"
      aria-hidden="true"
    />
  )
}

export function SpinnerBlock({ label = 'En cours…', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 text-center ${className}`}>
      <Spinner size="lg" />
      <p className="text-sm text-amber-200/90">{label}</p>
    </div>
  )
}
