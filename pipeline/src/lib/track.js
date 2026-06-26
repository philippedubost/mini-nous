function getFunnelSessionId() {
  try {
    let id = sessionStorage.getItem('mn_funnel_sid')
    if (!id) {
      id = crypto.randomUUID?.() || `s${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      sessionStorage.setItem('mn_funnel_sid', id)
    }
    return id
  } catch {
    return null
  }
}

export function trackClientEvent(event, payload = {}) {
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, sessionId: getFunnelSessionId(), ...payload }),
  }).catch(() => {})
}
