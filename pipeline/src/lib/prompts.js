export const DEFAULT_PROMPTS = {
  prompt1: `Mettre ces personnes debout de gauche à droite, les transformer en figurines en bois découpées au laser style flat lay, fond blanc, vue de face, style épuré minimaliste, bois clair naturel, traits simplifiés`,
  prompt2: `Améliorer le rendu des figurines en bois : affiner les contours de découpe laser, rendre le grain du bois plus visible, conserver exactement la même composition et les mêmes personnages, fond blanc pur`,
  prompt3: `Finaliser les figurines en bois pour impression : traits nets de découpe laser, bois naturel clair uniforme, proportions harmonieuses, fond blanc pur, ombres douces au sol, rendu photoréaliste d'artisanat`,
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
  return basePrompt.replace('ces personnes', who)
}
