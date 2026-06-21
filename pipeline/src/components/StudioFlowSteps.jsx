import { STUDIO_FLOW_STEPS, studioFlowStep } from '../lib/studioFlow'

export default function StudioFlowSteps({ order, lineartUrl, busy, phase }) {
  if (!order?.isPaid) return null

  const current = studioFlowStep({ order, lineartUrl, busy, phase })
  if (current < 1) return null

  return (
    <div className="customer-card-muted !p-4">
      <p className="text-xs customer-muted mb-3">Parcours studio</p>
      <div className="flex justify-between gap-2">
        {STUDIO_FLOW_STEPS.map((step) => {
          const done = step.key < current
          const active = step.key === current
          const visible = step.key <= current

          if (!visible) return null

          return (
            <div key={step.key} className="flex-1 min-w-0 text-center">
              <div
                className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mb-1.5 ${
                  done ? 'customer-step-active' : active ? 'customer-step-active ring-2 ring-[#C0684A]/30' : 'customer-step-idle'
                }`}
              >
                {done ? '✓' : step.key}
              </div>
              <p className={`text-[10px] sm:text-xs font-semibold truncate ${active || done ? 'text-[#2C1F14]' : 'customer-muted'}`}>
                {step.label}
              </p>
              {active && (
                <p className="text-[10px] customer-muted mt-1 leading-snug hidden sm:block">
                  {step.hint}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
