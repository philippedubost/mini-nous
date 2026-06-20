export const ISSUE_OPTIONS = [
  'cheveux', 'visage', 'vetements', 'posture', 'proportions', 'accessoires',
]

export const ISSUE_LABELS = {
  cheveux: 'cheveux / coiffure',
  visage: 'visage',
  vetements: 'vêtements',
  posture: 'posture',
  proportions: 'proportions',
  accessoires: 'accessoires',
}

export function sanitizeRevisionCharacters(characters) {
  if (!Array.isArray(characters) || !characters.length) return []
  return characters.map((c, i) => ({
    index: Number(c.index ?? i),
    label: String(c.label || `Personnage ${i + 1}`).slice(0, 80),
    issues: (c.issues ?? []).filter(x => ISSUE_OPTIONS.includes(x)).slice(0, 8),
    freeText: String(c.freeText || '').slice(0, 500),
  })).filter(c => c.issues.length || c.freeText)
}
