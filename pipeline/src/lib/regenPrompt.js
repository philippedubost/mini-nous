const ISSUE_LABELS = {
  cheveux: 'cheveux / coiffure',
  visage: 'visage',
  vetements: 'vêtements',
  posture: 'posture',
  proportions: 'proportions',
  accessoires: 'accessoires',
}

/** Suffixe prompt FAL étape 2 — retours client par personnage (gauche → droite). */
export function buildRegenPromptSuffix(characters) {
  const filled = (characters ?? []).filter(c => c.issues?.length || c.freeText?.trim())
  if (!filled.length) return ''

  const lines = filled.map(c => {
    const n = (c.index ?? 0) + 1
    const label = c.label?.trim() || `Personnage ${n}`
    const issues = (c.issues ?? []).map(id => ISSUE_LABELS[id] || id).join(', ')
    const extra = c.freeText?.trim()
    return `- Personnage ${n} (${label}, de gauche à droite) : ajuster ${issues || 'les détails'}${extra ? `. ${extra}` : ''}`
  })

  return `

Corrections demandées pour cette nouvelle version du tracé (personnages disposés de gauche à droite) :
${lines.join('\n')}
Respecter impérativement ces retours tout en gardant le style line art épuré.`
}
