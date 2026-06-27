import {
  DEFAULT_TRACE_OPTS,
  OUTLINE_TRACE_OPTS,
  optimizeSvgForLaser,
  traceCenterline,
} from './centerline.js'
import { gravureTraceOpts } from './settings.js'

export function traceRgbaImage(imageData, opts = {}) {
  const o = { ...DEFAULT_TRACE_OPTS, ...opts }
  const traced = traceCenterline(imageData, o)
  return {
    svg: optimizeSvgForLaser(traced.svg, o),
    preview: traced.preview,
    width: traced.width,
    height: traced.height,
    engine: 'browser',
  }
}

export function traceOutlineLayer(outlineRgba) {
  return traceRgbaImage(outlineRgba, OUTLINE_TRACE_OPTS)
}

export function traceGravureLayer(gravureRgba, gravureOpts) {
  return traceRgbaImage(gravureRgba, gravureTraceOpts(gravureOpts))
}
