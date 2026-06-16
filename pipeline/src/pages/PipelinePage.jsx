import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import Upload from '../components/Upload'
import Step from '../components/Step'
import Preview from '../components/Preview'
import { loadSettings, buildPrompt1, resolveImageUrls, STEP_LABELS } from '../lib/settings'
import { loadTraceSettings } from '../lib/traceSettings'
import { extractAndBuildLaserSvg, svgToDataUrl } from '../lib/laserPipeline'
import { FAL_MODEL, runFalStep, uploadToFal } from '../lib/fal'
import {
  createGeneration, updateGeneration, persistAsset, markStepRunning,
} from '../lib/storage'

const REFERENCE_LINE_URL = `${import.meta.env.BASE_URL}referenceLine2.png`

const INITIAL_STEPS = [
  { status: 'idle', image: null, log: null, error: null },
  { status: 'idle', image: null, log: null, error: null },
  { status: 'idle', image: null, log: null, error: null },
]

export default function PipelinePage() {
  const [settings] = useState(loadSettings)
  const [phase, setPhase] = useState('upload')
  const [steps, setSteps] = useState(INITIAL_STEPS)
  const [globalError, setGlobalError] = useState(null)
  const [resultUrls, setResultUrls] = useState({ laserMerged: null })

  const patchStep = useCallback((i, patch) => {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }, [])

  const handleStart = useCallback(async (file, faceCount) => {
    setPhase('running')
    setGlobalError(null)
    setSteps(INITIAL_STEPS)
    setResultUrls({ laserMerged: null })

    let generationId = null
    const traceSettings = loadTraceSettings()

    try {
      const globalFmt = { resolution: settings.resolution, aspectRatio: settings.aspectRatio }

      try {
        const generation = await createGeneration({
          faceCount,
          resolution: settings.resolution,
          aspectRatio: settings.aspectRatio,
          settings: { ...settings, traceSettings },
          falModel: FAL_MODEL,
        })
        generationId = generation.id
      } catch (storageErr) {
        console.warn('[storage] création génération:', storageErr.message)
      }

      patchStep(0, { status: 'init' })

      const userUrl = await uploadToFal(file)
      await persistAsset(generationId, 'source', { falUrl: userUrl, url: userUrl, status: 'done' })

      const refResp = await fetch(REFERENCE_LINE_URL)
      const refBlob = await refResp.blob()
      const refUrl = await uploadToFal(new File([refBlob], 'referenceLine2.png', { type: 'image/png' }))
      await persistAsset(generationId, 'ref', { falUrl: refUrl, url: refUrl, status: 'done' })

      const urlMap = { user: userUrl, ref: refUrl, step1: null, step2: null }
      let url1, url2
      const [cfg1, cfg2] = settings.steps

      patchStep(0, { status: 'running' })
      await markStepRunning(generationId, 'step1')
      try {
        const prompt = buildPrompt1(faceCount, cfg1.prompt)
        const imgs = resolveImageUrls(cfg1.imageInputs, urlMap)
        url1 = await runFalStep({ ...cfg1, ...globalFmt, prompt }, imgs, log => patchStep(0, { log }))
        urlMap.step1 = url1
        patchStep(0, { status: 'done', image: url1, log: null })
        await persistAsset(generationId, 'step1', { falUrl: url1, url: url1, prompt, status: 'done' })
      } catch (err) {
        patchStep(0, { status: 'error', error: err.message })
        await updateGeneration(generationId, { status: 'error', errorMessage: err.message })
        throw err
      }

      patchStep(1, { status: 'running' })
      await markStepRunning(generationId, 'step2')
      try {
        const imgs = resolveImageUrls(cfg2.imageInputs, urlMap)
        url2 = await runFalStep({ ...cfg2, ...globalFmt }, imgs, log => patchStep(1, { log }))
        urlMap.step2 = url2
        patchStep(1, { status: 'done', image: url2, log: null })
        await persistAsset(generationId, 'step2', { falUrl: url2, url: url2, prompt: cfg2.prompt, status: 'done' })
      } catch (err) {
        patchStep(1, { status: 'error', error: err.message })
        await updateGeneration(generationId, { status: 'error', errorMessage: err.message })
        throw err
      }

      patchStep(2, { status: 'running', log: 'Extraction silhouette…' })
      await markStepRunning(generationId, 'outline', 'Extraction silhouette…')
      try {
        const { layers, merged } = await extractAndBuildLaserSvg({
          step2Url: url2,
          photoUrl: url1,
          faceCount,
          traceSettings: loadTraceSettings(),
          onProgress: log => patchStep(2, { log }),
        })
        const outlineUrl = layers.outline.toDataURL('image/png')
        const outlineBulkyUrl = layers.outlineBulky.toDataURL('image/png')
        const gravureUrl = layers.gravure.toDataURL('image/png')
        const overlayUrl = layers.overlay.toDataURL('image/png')
        const laserMergedUrl = svgToDataUrl(merged)
        const traceSettingsSnapshot = loadTraceSettings()
        const laserPersisted = await persistAsset(generationId, 'laser_merged', {
          base64: laserMergedUrl,
          status: 'done',
          metadata: { traceSettings: traceSettingsSnapshot },
        })
        patchStep(2, { status: 'done', image: laserPersisted?.imageUrl ?? laserMergedUrl, log: null })
        setResultUrls({ laserMerged: laserPersisted?.imageUrl ?? laserMergedUrl })
        await Promise.all([
          persistAsset(generationId, 'outline', { base64: outlineUrl, status: 'done' }),
          persistAsset(generationId, 'outline_bulk', { base64: outlineBulkyUrl, status: 'done' }),
          persistAsset(generationId, 'gravure', { base64: gravureUrl, status: 'done' }),
          persistAsset(generationId, 'overlay', { base64: overlayUrl, status: 'done' }),
        ])
        await updateGeneration(generationId, { status: 'done' })
      } catch (err) {
        patchStep(2, { status: 'error', error: err.message })
        await updateGeneration(generationId, { status: 'error', errorMessage: err.message })
        throw err
      }
      setPhase('done')
    } catch (err) {
      if (generationId) {
        await updateGeneration(generationId, { status: 'error', errorMessage: err.message }).catch(() => {})
      }
      setGlobalError(err.message)
      setPhase('error')
    }
  }, [settings, patchStep])

  const reset = () => {
    setPhase('upload')
    setSteps(INITIAL_STEPS)
    setGlobalError(null)
    setResultUrls({ laserMerged: null })
  }

  return (
    <div className="min-h-screen bg-stone-950 px-4 py-8">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <a href="/" className="text-xs text-stone-600 hover:text-stone-400 block mb-1">← Accueil</a>
            <h1 className="text-xl font-bold text-stone-100">Mini-Nous Pipeline</h1>
            <p className="text-sm text-stone-500 mt-0.5">Génération figurines bois</p>
          </div>
          <Link
            to="/lab"
            className="text-xs text-stone-500 hover:text-stone-300 border border-stone-700 rounded-lg px-3 py-1.5"
          >
            Labo trace
          </Link>
          <Link
            to="/admin"
            className="text-xs text-stone-500 hover:text-stone-300 border border-stone-700 rounded-lg px-3 py-1.5"
          >
            Admin
          </Link>
        </div>

        {phase === 'upload' && <Upload onReady={handleStart} />}

        {phase !== 'upload' && (
          <div className="space-y-4">
            <Step number={1} label={STEP_LABELS[1]} {...steps[0]} config={{ ...settings.steps[0], resolution: settings.resolution, aspectRatio: settings.aspectRatio }} />
            <Step number={2} label={STEP_LABELS[2]} {...steps[1]} config={{ ...settings.steps[1], resolution: settings.resolution, aspectRatio: settings.aspectRatio }} />
            <Step number={3} label={STEP_LABELS[3]} {...steps[2]} config={{ ...settings.steps[2], resolution: settings.resolution, aspectRatio: settings.aspectRatio }} />

            {globalError && (
              <div className="rounded-xl border border-red-700 bg-stone-900 p-4 text-red-400 text-sm">
                {globalError}
              </div>
            )}

            {phase === 'done' && resultUrls.laserMerged && (
              <Preview laserSvg={resultUrls.laserMerged} />
            )}

            {(phase === 'done' || phase === 'error') && (
              <button
                onClick={reset}
                className="w-full py-3 rounded-xl border border-stone-600 hover:border-stone-400 text-stone-300 hover:text-stone-100 transition-colors"
              >
                Recommencer
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
