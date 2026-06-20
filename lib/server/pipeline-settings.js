import { getSupabase } from './supabase.js'
import { uploadGlobalPipelineAssetToR2 } from './r2.js'

const SETTINGS_ID = 'global'

export const DEFAULT_PIPELINE_SETTINGS = {
  resolution: '2K',
  aspectRatio: '16:9',
  referenceLineUrl: null,
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

function normalizeResolution(value) {
  if (!value || value === '1K') return '2K'
  return value === '2K' ? '2K' : '2K'
}

export function mergePipelineSettings(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return structuredClone(DEFAULT_PIPELINE_SETTINGS)
  }
  return {
    resolution: '2K',
    aspectRatio: '16:9',
    referenceLineUrl: parsed.referenceLineUrl ?? null,
    steps: DEFAULT_PIPELINE_SETTINGS.steps.map((def, i) => {
      const step = parsed.steps?.[i] ?? {}
      return {
        ...def,
        ...step,
        resolution: normalizeResolution(step.resolution ?? def.resolution),
      }
    }),
  }
}

export function normalizePipelineSettings(settings) {
  return mergePipelineSettings(settings)
}

export async function getPipelineSettings() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('mini_nous_pipeline_settings')
    .select('settings, updated_at')
    .eq('id', SETTINGS_ID)
    .maybeSingle()

  if (error) throw new Error(error.message)

  if (!data?.settings) {
    const defaults = structuredClone(DEFAULT_PIPELINE_SETTINGS)
    const { error: insertErr } = await supabase
      .from('mini_nous_pipeline_settings')
      .insert({ id: SETTINGS_ID, settings: defaults })
    if (insertErr && !insertErr.message?.includes('duplicate')) {
      throw new Error(insertErr.message)
    }
    return { settings: defaults, updatedAt: null }
  }

  return {
    settings: mergePipelineSettings(data.settings),
    updatedAt: data.updated_at,
  }
}

export async function savePipelineSettings(settings) {
  const supabase = getSupabase()
  const normalized = normalizePipelineSettings(settings)
  const updatedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('mini_nous_pipeline_settings')
    .upsert({
      id: SETTINGS_ID,
      settings: normalized,
      updated_at: updatedAt,
    })
    .select('settings, updated_at')
    .single()
  if (error) throw new Error(error.message)
  return {
    settings: mergePipelineSettings(data.settings),
    updatedAt: data.updated_at,
  }
}

export async function resetPipelineSettings() {
  return savePipelineSettings(DEFAULT_PIPELINE_SETTINGS)
}

export async function uploadReferenceLineArt(base64, env = process.env) {
  if (!base64) throw new Error('Image requise')
  const { url } = await uploadGlobalPipelineAssetToR2({
    assetKey: 'reference-line-art',
    base64,
    cacheControl: 'public, max-age=300',
  }, env)
  const { settings } = await getPipelineSettings()
  return savePipelineSettings({ ...settings, referenceLineUrl: url })
}
