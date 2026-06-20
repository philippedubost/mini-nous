const ADMIN_KEY = 'mn_admin_ok'
export const ADMIN_PASSWORD = 'admininous'

export function isAdminAuthed() {
  try {
    return sessionStorage.getItem(ADMIN_KEY) === '1'
  } catch {
    return false
  }
}

export function setAdminAuthed() {
  try {
    sessionStorage.setItem(ADMIN_KEY, '1')
  } catch { /* ignore */ }
}

export function clearAdminAuthed() {
  try {
    sessionStorage.removeItem(ADMIN_KEY)
  } catch { /* ignore */ }
}

export function adminHeaders() {
  return isAdminAuthed() ? { 'X-MiniNous-Admin': ADMIN_PASSWORD } : {}
}

export function checkAdminPassword(value) {
  return value === ADMIN_PASSWORD
}
