export const GRAVURE_TRACE_PARAMS = [
  { key: 'threshold', label: 'Seuil', hint: 'Niveau de gris → noir/blanc (≈ 200–240 pour line art)', min: 1, max: 254, step: 1 },
  { key: 'despeckleLevel', label: 'Désépoussiérage', hint: 'Supprime les petits îlots parasites', min: 0, max: 12, step: 1 },
  { key: 'filterIterations', label: 'Lissage (filtre)', hint: 'Passes de flou avant le tracé', min: 0, max: 8, step: 1 },
  { key: 'smoothness', label: 'Lissage du tracé', hint: 'Adoucit les crénelures (0 = brut, 100 = très lisse)', min: 0, max: 100, step: 1 },
  { key: 'errorThreshold', label: 'Seuil d\'erreur', hint: '0 = max de détails', min: 0, max: 10, step: 0.1 },
  { key: 'mergeDistance', label: 'Fusion segments', hint: 'Polylignes coupées (px)', min: 0, max: 12, step: 1 },
  { key: 'lineThreshold', label: 'Longueur min. ligne', hint: 'Ignore les polylignes trop courtes', min: 1, max: 20, step: 1 },
  { key: 'strokeWidth', label: 'Épaisseur SVG', hint: 'Épaisseur du trait exporté', min: 0.25, max: 8, step: 0.25 },
  { key: 'chunkSize', label: 'Taille des blocs', hint: 'Plus petit = plus de détails', min: 2, max: 24, step: 1 },
]

export const MASK_CONTOUR_PARAM = {
  key: 'maskContourSw',
  label: 'Épaisseur masque contour',
  hint: 'Zone autour du contour extérieur retirée de la gravure (px). Nécessite step2 pour l\'aperçu.',
  min: 0,
  max: 16,
  step: 1,
}

export const DECOUPE_PARAMS = [
  {
    key: 'pathSmoothness',
    label: 'Lissage paths corps',
    hint: 'Réduit les points des silhouettes (0 = brut).',
    min: 0,
    max: 100,
    step: 1,
  },
]
