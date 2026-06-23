import { STUDIO_FLOW_STEPS, isStudioSurpriseDone, studioFlowStep } from '../lib/studioFlow'

function stepLabel(step) {
  return step.emoji ? `${step.emoji} ${step.label}` : step.label
}

export default function StudioFlowSteps({ order, lineartUrl, busy, phase }) {
  if (!order?.isPaid) return null

  const current = studioFlowStep({ order, lineartUrl, busy, phase })
  if (current < 1) return null

  const surpriseDone = isStudioSurpriseDone(order)

  return (
    <div className="customer-card-muted !p-4">
      <p className="text-xs customer-muted mb-3">Parcours studio</p>
      <div className="flex justify-between gap-1">
        {STUDIO_FLOW_STEPS.map((step) => {
          const done = step.key < current || (step.key === 5 && surpriseDone)
          const active = step.key === current && !done
          const future = !done && !active

          return (
            <div
              key={step.key}
              className={`flex-1 min-w-0 text-center${future ? ' customer-step-future' : ''}`}
            >
              <div
                className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mb-1.5 ${
                  done || active ? 'customer-step-active' : 'customer-step-idle'
                }${active ? ' ring-2 ring-[#C0684A]/30' : ''}`}
              >
                {done ? '✓' : step.emoji && future ? step.emoji : step.key}
              </div>
              <p
                className={`text-[10px] sm:text-xs font-semibold leading-snug ${
                  future ? 'customer-muted' : 'text-[#2C1F14]'
                }`}
                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {stepLabel(step)}
              </p>
              {active && (
                <p className="text-[10px] customer-muted mt-1 leading-snug hidden lg:block px-0.5">
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
