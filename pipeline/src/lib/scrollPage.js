const NAV_OFFSET = 76

/** Scroll fiable (iOS) — top ou ancre avec offset nav sticky. */
export function scrollPageTo(target = 'top', { behavior = 'auto' } = {}) {
  const apply = () => {
    if (target === 'top') {
      window.scrollTo({ top: 0, left: 0, behavior })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      return
    }
    const el = typeof target === 'string' ? document.getElementById(target) : target
    if (!el) {
      window.scrollTo({ top: 0, left: 0, behavior })
      return
    }
    const y = el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET
    window.scrollTo({ top: Math.max(0, y), left: 0, behavior })
  }
  requestAnimationFrame(() => requestAnimationFrame(apply))
}
