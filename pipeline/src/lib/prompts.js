export const DEFAULT_PROMPTS = {
  prompt1: `Mettre ces personnes debout de gauche à droite séparées de 50cm en vue orthogonale sur fond blanc

Gap entre chaque personne ne doivent passe toucher

Séparer en 3 individus, Maman Papa sans l'enfant dans les bras et l'enfant seul

legerement souriant , heureux sans etre trop cartoon`,

  prompt2: `Mettre toutes les personnes de l'image 1 debout de gauche à droite séparées de 1m en vue orthogonale sur fond blanc
Gap entre chaque personne ne doivent pas se toucher
Styliser les personnes en line art comme dans l'image 2 avec un style simplifié illustration en gardant les caractéristiques principales des personnes
Pour les accessoires vetements, caracteristiques des personnages bien utiliser l'image 1; l'image 2 est surtout une reference pour le trait et le niveau de détails
Ne pas faire de formes noires pleines, juste les contours lignes
s'assurer que les personnages ont un rectangle au niveau des pieds comme dans l'image 2
bien garder l'espace entre chaque personne, rectangle compris, les personnages et les rectangles ne doivent pas se toucher
bien s'assurer que les personnages et rectangles ne sont pas coupés en bas , laisser une marge blanche bottom`,

  prompt3: `J'ai besoin juste du contour extérieur de ces illustrations, trait noir sur fond blanc
bien garder exactement la disposition pour que je puisse superposer les deux images par la suite`,
}

const STORAGE_KEY = 'mn_pipeline_prompts'

export function loadPrompts() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return { ...DEFAULT_PROMPTS, ...JSON.parse(stored) }
  } catch {}
  return { ...DEFAULT_PROMPTS }
}

export function savePrompts(prompts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts))
}

export function resetPrompts() {
  localStorage.removeItem(STORAGE_KEY)
  return { ...DEFAULT_PROMPTS }
}

export function buildPrompt1(faceCount, basePrompt) {
  const who = faceCount > 0 ? `ces ${faceCount} personnes` : 'ces personnes'
  // Replace only the first occurrence
  return basePrompt.replace('ces personnes', who)
}

export const STEP_LABELS = ['Détection', 'Mise en scène', 'Line Art', 'Contour final']
