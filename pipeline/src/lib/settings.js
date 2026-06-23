export const STEP_LABELS = ['Détection', 'Mise en scène', 'Line Art', 'SVG laser']

export const RESOLUTIONS = ['2K']
export const FAL_STEP_RESOLUTIONS = ['2K']
export const DEFAULT_FAL_STEP_RESOLUTION = '2K'

export function normalizeResolution(value) {
  if (!value || value === '1K') return DEFAULT_FAL_STEP_RESOLUTION
  return FAL_STEP_RESOLUTIONS.includes(value) ? value : DEFAULT_FAL_STEP_RESOLUTION
}

export const ASPECT_RATIOS = ['16:9', '4:3', '1:1', '3:4', '9:16']

export const IMAGE_INPUT_OPTIONS = [
  { id: 'user',  label: 'Photo source (upload)' },
  { id: 'ref',   label: 'Reference line art' },
  { id: 'step1', label: 'Résultat étape 1' },
  { id: 'step2', label: 'Résultat étape 2' },
]

export const DEFAULT_REFERENCE_LINE_URL = '/images/referenceLine2.webp'

/** Valeurs par défaut — alignées sur lib/server/pipeline-settings.js */
export const DEFAULT_SETTINGS = {
  resolution: '2K',
  aspectRatio: '16:9',
  referenceLineUrl: DEFAULT_REFERENCE_LINE_URL,
  steps: [
    {
      resolution: '2K',
      prompt: `Mettre ces personnes debout de gauche à droite séparées de 50cm en vue orthogonale sur fond blanc
On doit voir le corps en entier avec un espace entre le bord et les personnages des 4 côtés.

Bien garder des proportions réalistes et un look photoréaliste fidèle à la photo en input

Gap entre chaque personne ne doivent pas se toucher

Légèrement souriant, heureux sans être trop cartoon

Aucun texte, aucun label, aucune annotation sur l'image`,
      imageInputs: ['user'],
    },
    {
      resolution: '2K',
      prompt: `Mettre toutes les personnes de l'image 1 debout de gauche à droite séparées de 1m en vue orthogonale sur fond blanc pur
Les personnages ne doivent pas se toucher, garder un espace clair entre chacun

Styliser en line art épuré comme dans l'image 2 : traits fins, style illustration simplifié
Utiliser l'image 1 pour les caractéristiques des personnages (vêtements, accessoires, morphologie)
L'image 2 est la référence de style graphique : niveau de détail, épaisseur de trait, rendu final

RÈGLES ABSOLUES — à respecter impérativement :
- ZERO forme remplie : aucun aplat noir, aucun aplat gris, aucune zone colorée
- ZERO remplissage sur les cheveux, vêtements, chaussures, corps ou ombres
- Uniquement des lignes et contours fins — tout doit être blanc à l'intérieur des formes
- Fond blanc pur, aucune ombre portée, aucun dégradé
- Les personnages ne doivent pas être coupés en bas, laisser une marge blanche en bas`,
      imageInputs: ['step1', 'ref'],
    },
    {
      prompt: `Tracer uniquement le contour extérieur de la silhouette de chaque personnage, trait noir fin sur fond blanc pur

RÈGLES ABSOLUES :
- Uniquement le tracé de silhouette extérieure — aucun trait à l'intérieur des personnages
- Aucun détail interne : pas de vêtements, pas de visage, pas de membres tracés à l'intérieur
- Aucune forme remplie, aucun aplat noir, fond blanc pur partout
- Un seul tracé fermé par personnage : la silhouette externe uniquement
- Garder exactement la même disposition, taille et espacement que l'image source pour pouvoir superposer`,
      imageInputs: ['step2'],
    },
  ],
}

export function mergeSettings(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return structuredClone(DEFAULT_SETTINGS)
  }
  return {
    resolution: '2K',
    aspectRatio: '16:9',
    referenceLineUrl: parsed.referenceLineUrl ?? DEFAULT_REFERENCE_LINE_URL,
    steps: DEFAULT_SETTINGS.steps.map((def, i) => {
      const step = parsed.steps?.[i] ?? {}
      return {
        ...def,
        ...step,
        resolution: normalizeResolution(step.resolution ?? def.resolution),
      }
    }),
  }
}

/** @deprecated Utiliser useSettings() — repli synchrone sur les défauts */
export function loadSettings() {
  return structuredClone(DEFAULT_SETTINGS)
}

export function buildPrompt1(faceCount, basePrompt) {
  const who = faceCount > 0 ? `ces ${faceCount} personnes` : 'ces personnes'
  return basePrompt.replace('ces personnes', who)
}

export function getReferenceLineUrl(settings) {
  return settings?.referenceLineUrl || DEFAULT_REFERENCE_LINE_URL
}

export async function fetchReferenceBlob(settings) {
  let url = getReferenceLineUrl(settings)
  if (url.startsWith('/')) {
    url = `${window.location.origin}${url}`
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error('Impossible de charger la référence line art')
  return res.blob()
}

export function resolveImageUrls(imageInputs, urlMap) {
  return imageInputs.map(id => urlMap[id]).filter(Boolean)
}

export function falStepFormat(step, globalSettings = {}) {
  return {
    resolution: normalizeResolution(step?.resolution ?? globalSettings.resolution),
    aspectRatio: step?.aspectRatio
      ?? globalSettings.aspectRatio
      ?? globalSettings.aspect_ratio
      ?? DEFAULT_SETTINGS.aspectRatio,
  }
}
