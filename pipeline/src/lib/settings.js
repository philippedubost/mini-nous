export const STEP_LABELS = ['Détection', 'Mise en scène', 'Line Art', 'Contour final']

export const RESOLUTIONS = ['1K', '2K', '4K']

export const ASPECT_RATIOS = ['16:9', '4:3', '1:1', '3:4', '9:16']

export const IMAGE_INPUT_OPTIONS = [
  { id: 'user',  label: 'Photo source (upload)' },
  { id: 'ref',   label: 'Reference line art' },
  { id: 'step1', label: 'Résultat étape 1' },
  { id: 'step2', label: 'Résultat étape 2' },
]

export const DEFAULT_SETTINGS = {
  resolution: '2K',
  aspectRatio: '16:9',
  steps: [
    {
      prompt: `Mettre ces personnes debout de gauche à droite séparées de 50cm en vue orthogonale sur fond blanc

Gap entre chaque personne ne doivent passe toucher

Séparer en 3 individus, Maman Papa sans l'enfant dans les bras et l'enfant seul

legerement souriant , heureux sans etre trop cartoon

Aucun texte, aucun label, aucune annotation sur l'image`,
      imageInputs: ['user'],
    },
    {
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

const STORAGE_KEY = 'mn_pipeline_settings_v6'

export function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Merge with defaults to handle new fields gracefully
      return {
        resolution: parsed.resolution ?? DEFAULT_SETTINGS.resolution,
        aspectRatio: parsed.aspectRatio ?? DEFAULT_SETTINGS.aspectRatio,
        steps: DEFAULT_SETTINGS.steps.map((def, i) => ({
          ...def,
          ...(parsed.steps?.[i] ?? {}),
        })),
      }
    }
  } catch {}
  return structuredClone(DEFAULT_SETTINGS)
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function resetSettings() {
  localStorage.removeItem(STORAGE_KEY)
  return structuredClone(DEFAULT_SETTINGS)
}

/**
 * Inject face count into step 1 prompt.
 * Replaces first occurrence of "ces personnes" with "ces N personnes".
 */
export function buildPrompt1(faceCount, basePrompt) {
  const who = faceCount > 0 ? `ces ${faceCount} personnes` : 'ces personnes'
  return basePrompt.replace('ces personnes', who)
}

/**
 * Resolve imageInputs string ids to actual uploaded URLs.
 * urlMap: { user, ref, step1, step2 }
 */
export function resolveImageUrls(imageInputs, urlMap) {
  return imageInputs.map(id => urlMap[id]).filter(Boolean)
}
