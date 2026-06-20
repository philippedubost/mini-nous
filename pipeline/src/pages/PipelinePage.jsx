import { useState, useCallback, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Upload from '../components/Upload'
import Step from '../components/Step'
import Preview from '../components/Preview'
import { useSettings } from '../context/SettingsContext'
import { buildPrompt1, resolveImageUrls, STEP_LABELS, falStepFormat, fetchReferenceBlob } from '../lib/settings'
import { loadTraceSettings } from '../lib/traceSettings'
import { extractAndBuildLaserSvg, svgToDataUrl } from '../lib/laserPipeline'
import { FAL_MODEL, runFalStep, uploadToFal } from '../lib/fal'
import {
  createGeneration, updateGeneration, persistAsset, markStepRunning,
  fetchOrderByToken, linkOrderGeneration,
} from '../lib/storage'


const INITIAL_STEPS = [
  { status: 'idle', image: null, log: null, error: null },
  { status: 'idle', image: null, log: null, error: null },
  { status: 'idle', image: null, log: null, error: null },
]

export default function PipelinePage() {
  const [searchParams] = useSearchParams()
  const orderToken = searchParams.get('order')
  const { settings } = useSettings()
  const [orderInfo, setOrderInfo] = useState(null)
  const [orderError, setOrderError] = useState(null)
  const [phase, setPhase] = useState('upload')
  const [steps, setSteps] = useState(INITIAL_STEPS)
  const [globalError, setGlobalError] = useState(null)
  const [resultUrls, setResultUrls] = useState({ laserMerged: null })

  const patchStep = useCallback((i, patch) => {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }, [])

  useEffect(() => {
    if (!orderToken) return
    fetchOrderByToken(orderToken)
      .then(({ order }) => setOrderInfo(order))
      .catch(err => setOrderError(err.message))
  }, [orderToken])

  const handleStart = useCallback(async (file, faceCount) => {
    setPhase('running')
    setGlobalError(null)
    setSteps(INITIAL_STEPS)
    setResultUrls({ laserMerged: null })

    let generationId = null
    const traceSettings = loadTraceSettings()
    const effectiveFaceCount = orderInfo?.faceCount ?? faceCount
    const [cfg1, cfg2] = settings.steps
    const fmt1 = falStepFormat(cfg1, settings)
    const fmt2 = falStepFormat(cfg2, settings)

    try {

      try {
        const generation = await createGeneration({
          faceCount: effectiveFaceCount,
          resolution: settings.resolution,
          aspectRatio: settings.aspectRatio,
          settings: { ...settings, traceSettings },
          falModel: FAL_MODEL,
          orderId: orderInfo?.id ?? null,
        })
        generationId = generation.id
        if (orderToken && orderInfo?.id) {
          await linkOrderGeneration(orderToken, generationId).catch(() => {})
        }
      } catch (storageErr) {
        console.warn('[storage] création génération:', storageErr.message)
      }

      patchStep(0, { status: 'init' })

      const userUrl = await uploadToFal(file)
      await persistAsset(generationId, 'source', { falUrl: userUrl, url: userUrl, status: 'done' })

      const refBlob = await fetchReferenceBlob(settings)
      const refUrl = await uploadToFal(new File([refBlob], 'reference-line.png', { type: refBlob.type || 'image/png' }))
      await persistAsset(generationId, 'ref', { falUrl: refUrl, url: refUrl, status: 'done' })

      const urlMap = { user: userUrl, ref: refUrl, step1: null, step2: null }
      let url1, url2

      patchStep(0, { status: 'running' })
      await markStepRunning(generationId, 'step1')
      try {
        const prompt = buildPrompt1(effectiveFaceCount, cfg1.prompt)
        const imgs = resolveImageUrls(cfg1.imageInputs, urlMap)
        url1 = await runFalStep({ ...cfg1, ...fmt1, prompt }, imgs, log => patchStep(0, { log }))
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
        url2 = await runFalStep({ ...cfg2, ...fmt2, prompt: cfg2.prompt }, imgs, log => patchStep(1, { log }))
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
          faceCount: effectiveFaceCount,
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
  }, [settings, patchStep, orderInfo, orderToken])

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

        {phase === 'upload' && (
          <>
            {orderInfo && (
              <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/30 p-4 text-sm text-emerald-200">
                Commande confirmée · {orderInfo.packType} · {orderInfo.faceCount} personnage{orderInfo.faceCount > 1 ? 's' : ''}
                {orderInfo.shipDate && ` · Expédition ${new Date(orderInfo.shipDate + 'T12:00:00').toLocaleDateString('fr-FR')}`}
              </div>
            )}
            {orderError && (
              <div className="rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-300">
                {orderError} — <Link to="/" className="underline">Retour boutique</Link>
              </div>
            )}
            <Upload
              onReady={handleStart}
              initialFaceCount={orderInfo?.faceCount}
              lockedCount={!!orderInfo?.faceCount}
            />
          </>
        )}

        {phase !== 'upload' && (
          <div className="space-y-4">
            <Step number={1} label={STEP_LABELS[1]} {...steps[0]} config={{ ...settings.steps[0], ...falStepFormat(settings.steps[0], settings) }} />
            <Step number={2} label={STEP_LABELS[2]} {...steps[1]} config={{ ...settings.steps[1], ...falStepFormat(settings.steps[1], settings) }} />
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
