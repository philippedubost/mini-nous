export const DEFAULT_MASK_CONTOUR_SW = 8

export const DEFAULT_OUTLINE_OPTS = {
  thresh: 240,
  dm: 2,
  sw: 8,
  swTight: 0,
  swr: 1,
}

export const DEFAULT_TRACE_SETTINGS = {
  gravure: {
    threshold: 200,
    maskContourSw: DEFAULT_MASK_CONTOUR_SW,
    despeckleLevel: 0,
    filterIterations: 0,
    errorThreshold: 0,
    lineThreshold: 2,
    strokeWidth: 1,
    smoothness: 35,
    pathOrderDebug: true,
    laserRoundTrip: true,
    laserMinPathLength: 20,
  },
  decoupe: {
    pathOrderDebug: false,
    laserRoundTrip: false,
    strokeWidth: 1,
    pathSmoothness: 14,
    kerfMm: 0,
  },
  outline: { ...DEFAULT_OUTLINE_OPTS, sw: DEFAULT_MASK_CONTOUR_SW },
}

export function outlineOptsForExtraction(settings = DEFAULT_TRACE_SETTINGS) {
  const sw = settings.gravure?.maskContourSw ?? settings.outline?.sw ?? DEFAULT_MASK_CONTOUR_SW
  return { ...DEFAULT_OUTLINE_OPTS, ...(settings.outline ?? {}), sw }
}

export function gravureTraceOpts(gravureOpts) {
  const { maskContourSw, ...rest } = gravureOpts ?? {}
  return rest
}
