const STEPS = [
  { key: 'lineart', label: 'Tracé sur mesure' },
  { key: 'validation', label: 'Validation' },
  { key: 'fabrication', label: 'Fabrication' },
  { key: 'shipped', label: 'Expédition' },
]

export function timelineIndex(order) {
  if (!order?.isPaid) return -1
  const s = order.workflowStatus
  if (s === 'shipped') return 3
  if (s === 'approved' || s === 'in_production') return 2
  if (['pending_validation', 'revision_requested'].includes(s)) return 1
  return 0
}

export default function OrderTimeline({ order }) {
  const current = timelineIndex(order)
  if (current < 0) return null

  return (
    <div className="customer-card">
      <p className="text-xs customer-muted mb-4">Avancement</p>
      <div className="flex justify-between gap-1 mb-6">
        {STEPS.map((s, i) => {
          const done = i < current
          const active = i === current
          const future = i > current

          return (
            <div
              key={s.key}
              className={`flex-1 text-center min-w-0${future ? ' customer-step-future' : ''}`}
            >
              <div className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mb-2 ${
                done || active ? 'customer-step-active' : 'customer-step-idle'
              }`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] sm:text-xs font-medium block truncate ${
                future ? 'customer-muted' : 'text-[#2C1F14]'
              }`}>
                {s.label}
              </span>
            </div>
          )
        })}
      </div>

      <div className="customer-status-box">
        <p className="font-semibold text-[#C0684A]">{order.workflowLabel}</p>
        <p className="text-sm customer-muted mt-1">{order.workflowHint}</p>
      </div>
    </div>
  )
}
