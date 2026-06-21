/** Composants visuels pour les cartes produit admin. */

const TONES = {
  shop: {
    card: 'border-amber-500/30 bg-amber-500/5',
    accent: 'bg-amber-500',
    tag: 'bg-amber-500/20 text-amber-300',
    dot: 'bg-amber-400',
  },
  pipeline: {
    card: 'border-sky-500/30 bg-sky-500/5',
    accent: 'bg-sky-500',
    tag: 'bg-sky-500/20 text-sky-300',
    dot: 'bg-sky-400',
  },
  admin: {
    card: 'border-violet-500/30 bg-violet-500/5',
    accent: 'bg-violet-500',
    tag: 'bg-violet-500/20 text-violet-300',
    dot: 'bg-violet-400',
  },
  api: {
    card: 'border-emerald-500/30 bg-emerald-500/5',
    accent: 'bg-emerald-500',
    tag: 'bg-emerald-500/20 text-emerald-300',
    dot: 'bg-emerald-400',
  },
  fal: {
    card: 'border-orange-500/30 bg-orange-500/5',
    accent: 'bg-orange-500',
    tag: 'bg-orange-500/20 text-orange-300',
    dot: 'bg-orange-400',
  },
  fab: {
    card: 'border-rose-500/30 bg-rose-500/5',
    accent: 'bg-rose-500',
    tag: 'bg-rose-500/20 text-rose-300',
    dot: 'bg-rose-400',
  },
  muted: {
    card: 'border-stone-700 bg-stone-900/50',
    accent: 'bg-stone-600',
    tag: 'bg-stone-800 text-stone-400',
    dot: 'bg-stone-500',
  },
}

export function FlowCard({
  tone = 'muted', icon, title, path, detail, tag, className = '',
}) {
  const t = TONES[tone] ?? TONES.muted
  return (
    <div className={`flow-card relative rounded-xl border p-4 pl-5 min-w-[9.5rem] max-w-[15rem] ${t.card} ${className}`}>
      <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${t.accent}`} aria-hidden />
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          {icon && <span className="text-lg leading-none shrink-0" aria-hidden>{icon}</span>}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-stone-100 leading-snug">{title}</p>
            {path && (
              <code className="text-[11px] text-stone-400 block mt-1 break-all">{path}</code>
            )}
          </div>
        </div>
        {detail && <p className="text-xs text-stone-400 leading-relaxed">{detail}</p>}
        {tag && (
          <span className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${t.tag}`}>
            {tag}
          </span>
        )}
      </div>
    </div>
  )
}

export function FlowArrowDown({ label, short }) {
  return (
    <div className={`flow-arrow-v flex flex-col items-center ${short ? 'py-1' : 'py-2'}`}>
      <div className="flex flex-col items-center text-stone-600">
        <div className="w-px h-3 bg-stone-600" />
        {label && (
          <span className="text-[10px] font-medium text-stone-500 bg-stone-900 border border-stone-700 px-2 py-0.5 rounded-full my-0.5 whitespace-nowrap max-w-[12rem] text-center leading-tight">
            {label}
          </span>
        )}
        <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-stone-500" />
      </div>
    </div>
  )
}

export function FlowArrowRight({ label }) {
  return (
    <div className="flow-arrow-h flex items-center px-1 shrink-0">
      <div className="flex items-center gap-1">
        <div className="w-4 h-px bg-stone-600" />
        {label && (
          <span className="text-[10px] font-medium text-stone-500 bg-stone-900 border border-stone-700 px-1.5 py-0.5 rounded whitespace-nowrap">
            {label}
          </span>
        )}
        <div className="w-0 h-0 border-t-[4px] border-b-[4px] border-l-[6px] border-t-transparent border-b-transparent border-l-stone-500" />
      </div>
    </div>
  )
}

export function FlowLane({ title, tone = 'muted', children, className = '' }) {
  const t = TONES[tone] ?? TONES.muted
  return (
    <div className={`flow-lane rounded-2xl border border-stone-800 p-4 space-y-3 ${className}`}>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${t.dot}`} />
        <h4 className="text-xs font-bold uppercase tracking-widest text-stone-400">{title}</h4>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

export function FlowBranch({ left, right, label }) {
  return (
    <div className="flow-branch grid sm:grid-cols-[1fr_auto_1fr] gap-3 items-start py-2">
      <div className="flex justify-center sm:justify-end">{left}</div>
      <div className="flex flex-col items-center justify-center pt-6">
        <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide">{label}</span>
        <div className="text-stone-600 text-lg">↔</div>
      </div>
      <div className="flex justify-center sm:justify-start">{right}</div>
    </div>
  )
}

export function FlowStepper({ steps }) {
  return (
    <div className="flow-stepper overflow-x-auto pb-2">
      <div className="flex items-start min-w-max gap-0 px-1">
        {steps.map((step, i) => {
          const t = TONES[step.tone] ?? TONES.muted
          return (
            <div key={step.id} className="flex items-start">
              <div className="flex flex-col items-center w-[7.5rem] shrink-0">
                <div className={`w-3 h-3 rounded-full ring-4 ring-stone-950 ${t.dot}`} />
                <p className="text-[11px] font-semibold text-stone-200 mt-2 text-center leading-tight px-1">
                  {step.label}
                </p>
                {step.hint && (
                  <p className="text-[10px] text-stone-500 mt-1 text-center leading-snug px-1">{step.hint}</p>
                )}
                {step.tag && (
                  <span className={`mt-1.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${t.tag}`}>
                    {step.tag}
                  </span>
                )}
              </div>
              {i < steps.length - 1 && (
                <div className="flex items-center pt-1 px-0.5 shrink-0">
                  <div className="w-8 sm:w-12 h-px bg-stone-700 relative">
                    {step.arrowLabel && (
                      <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] text-stone-500 whitespace-nowrap">
                        {step.arrowLabel}
                      </span>
                    )}
                  </div>
                  <div className="w-0 h-0 border-t-[3px] border-b-[3px] border-l-[5px] border-t-transparent border-b-transparent border-l-stone-600" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function FlowPanel({ title, subtitle, children }) {
  return (
    <section className="flow-panel rounded-2xl border border-stone-800 bg-stone-900/30 p-5 sm:p-6 space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-stone-100">{title}</h3>
        {subtitle && <p className="text-sm text-stone-500 mt-1 max-w-3xl">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

export function SurfaceLegend() {
  const items = [
    { tone: 'shop', label: 'Boutique /' },
    { tone: 'pipeline', label: 'Pipeline /pipeline' },
    { tone: 'admin', label: 'Admin /admin' },
    { tone: 'api', label: 'API' },
    { tone: 'fal', label: 'FAL / IA' },
    { tone: 'fab', label: 'Atelier' },
  ]
  return (
    <div className="flex flex-wrap gap-3">
      {items.map(({ tone, label }) => {
        const t = TONES[tone]
        return (
          <span key={tone} className="inline-flex items-center gap-2 text-xs text-stone-400">
            <span className={`w-2.5 h-2.5 rounded-full ${t.dot}`} />
            {label}
          </span>
        )
      })}
    </div>
  )
}
