const ISSUE_LABELS = {
  cheveux: 'cheveux / coiffure',
  habits: 'habits / vêtements',
  expression: 'expression du visage',
  age_jeune: 'paraît trop jeune',
  age_vieux: 'paraît trop âgé',
  proportions: 'proportions',
  posture: 'posture',
  visage: 'visage',
  vetements: 'vêtements',
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

/** Mega-prompt v1→v2 : regénération complète en une passe sans revue humaine. */
export function buildMegaRegenPrompt(basePrompt, characters) {
  const filled = (characters ?? []).filter(c => c.issues?.length || c.freeText?.trim())
  if (!filled.length) return basePrompt

  const detailLines = filled.map(c => {
    const n = (c.index ?? 0) + 1
    const issues = (c.issues ?? []).map(id => ISSUE_LABELS[id] || id).join(', ')
    const extra = c.freeText?.trim()
    return `Personnage ${n} (position ${n} de gauche à droite) :
  - Points à corriger : ${issues || 'voir remarque'}
  ${extra ? `- Remarque client : ${extra}` : ''}`
  }).join('\n\n')

  return `${basePrompt}

=== REGÉNÉRATION TRACÉ V2 — APPLICATION COMPLÈTE DES RETOURS CLIENT ===
Objectif : produire une nouvelle version du line art (tracé v2) intégrant TOUTES les corrections ci-dessous en une seule passe.
Ne pas demander de validation intermédiaire. Corriger simultanément tous les personnages concernés.

${detailLines}

Règles impératives :
- Disposition des personnages : de gauche à droite, même ordre que la photo source
- Style : line art épuré, silhouette extérieure uniquement, un tracé fermé par personnage
- Aucun détail interne (pas de traits à l'intérieur des silhouettes)
- Appliquer chaque correction listée sans en omettre aucune
- Conserver la cohérence d'ensemble et les proportions entre personnages`
}
