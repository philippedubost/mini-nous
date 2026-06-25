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

=== TRACÉ V2 — REGÉNÉRATION DU LINE ART (même mise en scène que v1) ===
Générer une NOUVELLE version du line art (v2) à partir de la MÊME photo de face séparée que le v1 (image 1) et de la référence de style (image 2).
L'image 1 (step1) est identique au v1 : conserver strictement le même ordre des personnages de gauche à droite, les mêmes positions et espacements.
NE PAS utiliser le tracé v1 comme image d'entrée : pas d'édition, pas d'inpainting, pas de retouche du tracé existant — uniquement un nouveau step2.

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
