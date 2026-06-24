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
Conserver le même style d'illustration et le même niveau de détail que le tracé v1 — ne pas simplifier.`
}

/** Mega-prompt v1→v2 : même pipeline que v1 (photo step1 + ref), prompt enrichi des retours client. */
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

=== TRACÉ V2 — REGÉNÉRATION COMPLÈTE (même méthode que le tracé v1) ===
Générer une NOUVELLE version du line art (v2) en repartant de la photo de face séparée (image 1) et de la référence de style (image 2).
NE PAS utiliser le tracé v1 comme image d'entrée : pas d'édition, pas d'inpainting, pas de retouche du tracé existant.

À CONSERVER IMPÉRATIVEMENT (identique au tracé v1) :
- Le même style d'illustration line art : finesse des traits, hachures/stippling, niveau de détail vestimentaire
- Proportions réalistes et fidèles aux vrais corps — pas de style schématique ou pictogramme
- Tous les détails de la prompt d'origine : vêtements, coiffures, accessoires, chaussures, expression
- Même technique graphique que v1 — ne pas simplifier, ne pas aplatir en silhouettes vides
- Aucun texte, label, annotation de distance ou marqueur sur l'image

CORRECTIONS CIBLÉES (formulaire client — appliquer uniquement sur les personnages listés) :
${detailLines}

Règles :
- Disposition de gauche à droite, même ordre que la photo source
- Appliquer chaque correction listée sans omettre aucune
- Ne pas dégrader le reste du tracé : le rendu global doit rester aussi détaillé et fidèle que le v1`
}
