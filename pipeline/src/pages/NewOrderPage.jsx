import { useState, useCallback, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Upload from '../components/Upload'
import Step from '../components/Step'
import Preview from '../components/Preview'
import CustomerLayout from '../components/CustomerLayout'
import { useAuth } from '../context/AuthContext'
import { loadSettings, buildPrompt1, resolveImageUrls, STEP_LABELS, falStepFormat } from '../lib/settings'
import { loadTraceSettings } from '../lib/traceSettings'
import { extractAndBuildLaserSvg, svgToDataUrl } from '../lib/laserPipeline'
import { FAL_MODEL, runFalStep, uploadToFal } from '../lib/fal'
import {
  createGeneration, updateGeneration, persistAsset, markStepRunning,
  fetchOrderByToken, linkOrderGeneration, orderAction, updateOrderFaceCount,
} from '../lib/storage'

const REFERENCE_LINE_URL = `${import.meta.env.BASE_URL}referenceLine2.png`

const INITIAL_STEPS = [
  { status: 'idle', image: null, log: null, error: null },
  { status: 'idle', image: null, log: null, error: null },
  { status: 'idle', image: null, log: null, error: null },
]

export default function NewOrderPage() {
  const [searchParams] = useSearchParams()
  const orderToken = searchParams.get('order')
  const { accessToken: bearerToken } = useAuth()
  const [settings] = useState(loadSettings)
  const [order, setOrder] = useState(null)
  const [orderError, setOrderError] = useState(null)
  const [phase, setPhase] = useState('loading')
  const [steps, setSteps] = useState(INITIAL_STEPS)
  const [globalError, setGlobalError] = useState(null)
  const [resultUrls, setResultUrls] = useState({ laserMerged: null })

  const patchStep = useCallback((i, patch) => {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }, [])

  useEffect(() => {
    if (!orderToken) {
      setOrderError('Lien incomplet')
      setPhase('error')
      return
    }
    fetchOrderByToken(orderToken, bearerToken)
      .then(({ order: o }) => {
        setOrder(o)
        setPhase('upload')
      })
      .catch(err => {
        setOrderError(err.message)
        setPhase('error')
      })
  }, [orderToken, bearerToken])

  const handleStart = useCallback(async (file, faceCount) => {
    if (!order) return
    setPhase('running')
    setGlobalError(null)
    setSteps(INITIAL_STEPS)
    setResultUrls({ laserMerged: null })

    let generationId = null
    const traceSettings = loadTraceSettings()
    const effectiveFaceCount = faceCount ?? order.faceCount
    const [cfg1, cfg2] = settings.steps
    const fmt1 = falStepFormat(cfg1, settings)
    const fmt2 = falStepFormat(cfg2, settings)

    try {
      if (effectiveFaceCount !== order.faceCount && order.isAdminView) {
        await updateOrderFaceCount(orderToken, effectiveFaceCount, bearerToken)
      }

      const generation = await createGeneration({
        faceCount: effectiveFaceCount,
        resolution: settings.resolution,
        aspectRatio: settings.aspectRatio,
        settings: { ...settings, traceSettings },
        falModel: FAL_MODEL,
        orderId: order.id,
      })
      generationId = generation.id
      await linkOrderGeneration(orderToken, generationId, bearerToken)

      patchStep(0, { status: 'init' })

      const userUrl = await uploadToFal(file)
      await persistAsset(generationId, 'source', { falUrl: userUrl, url: userUrl, status: 'done' })

      const refResp = await fetch(REFERENCE_LINE_URL)
      const refBlob = await refResp.blob()
      const refUrl = await uploadToFal(new File([refBlob], 'referenceLine2.png', { type: 'image/png' }))
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
        const finalLaser = laserPersisted?.imageUrl ?? laserMergedUrl
        patchStep(2, { status: 'done', image: finalLaser, log: null })
        setResultUrls({ laserMerged: finalLaser })
        await Promise.all([
          persistAsset(generationId, 'outline', { base64: outlineUrl, status: 'done' }),
          persistAsset(generationId, 'outline_bulk', { base64: outlineBulkyUrl, status: 'done' }),
          persistAsset(generationId, 'gravure', { base64: gravureUrl, status: 'done' }),
          persistAsset(generationId, 'overlay', { base64: overlayUrl, status: 'done' }),
        ])
        await updateGeneration(generationId, { status: 'done' })
        await orderAction(orderToken, 'pending_validation', bearerToken)
      } catch (err) {
        patchStep(2, { status: 'error', error: err.message })
        await updateGeneration(generationId, { status: 'error', errorMessage: err.message })
        throw err
      }
      setPhase('done')
      const { order: refreshed } = await fetchOrderByToken(orderToken, bearerToken)
      setOrder(refreshed)
    } catch (err) {
      if (generationId) {
        await updateGeneration(generationId, { status: 'error', errorMessage: err.message }).catch(() => {})
      }
      setGlobalError(err.message)
      setPhase('error')
    }
  }, [settings, patchStep, order, orderToken, bearerToken])

  const reset = () => {
    setPhase('upload')
    setSteps(INITIAL_STEPS)
    setGlobalError(null)
    setResultUrls({ laserMerged: null })
  }

  const shipLabel = order?.shipDate
    ? new Date(`${order.shipDate}T12:00:00`).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
    : null

  const lockedCount = !order?.isAdminView

  return (
    <CustomerLayout
      title="Nouvelle commande"
      subtitle="Photo → mise en scène → tracé → fichier laser"
      navRight={(
        <Link to="/compte" className="customer-link text-xs">Mon compte</Link>
      )}
    >
      {phase === 'loading' && (
        <p className="customer-muted text-sm text-center py-8">Chargement…</p>
      )}

      {orderError && (
        <div className="customer-alert-warn">{orderError}</div>
      )}

      {order && phase !== 'loading' && (
        <div className="customer-card space-y-1 text-sm">
          <p className="font-semibold text-[#2C1F14]">{order.packLabel}</p>
          <p className="customer-muted">{order.workflowLabel}{shipLabel ? ` · Livraison ${shipLabel}` : ''}</p>
        </div>
      )}

      {phase === 'upload' && order && (
        <Upload
          theme="light"
          onReady={handleStart}
          initialFaceCount={order.faceCount}
          lockedCount={lockedCount}
        />
      )}

      {phase !== 'upload' && phase !== 'loading' && (
        <div className="space-y-4">
          <Step number={1} label={STEP_LABELS[1]} theme="light" {...steps[0]} config={{ ...settings.steps[0], ...falStepFormat(settings.steps[0], settings) }} />
          <Step number={2} label={STEP_LABELS[2]} theme="light" {...steps[1]} config={{ ...settings.steps[1], ...falStepFormat(settings.steps[1], settings) }} />
          <Step number={3} label={STEP_LABELS[3]} theme="light" {...steps[2]} config={{ ...settings.steps[2], resolution: settings.resolution, aspectRatio: settings.aspectRatio }} />

          {globalError && (
            <div className="customer-alert-warn">{globalError}</div>
          )}

          {phase === 'done' && resultUrls.laserMerged && (
            <>
              <Preview laserSvg={resultUrls.laserMerged} theme="light" />
              <div className="flex flex-wrap gap-2">
                <Link
                  to={`/commande?order=${encodeURIComponent(orderToken)}`}
                  className="customer-btn-ghost"
                >
                  Suivre la commande
                </Link>
                {order?.generationId && (
                  <Link to={`/admin/g/${order.generationId}`} className="customer-btn-clay !py-2 !px-4 !text-xs">
                    Ouvrir dans l&apos;admin
                  </Link>
                )}
              </div>
            </>
          )}

          {(phase === 'done' || phase === 'error') && (
            <button type="button" onClick={reset} className="customer-btn-ghost w-full">
              Nouvelle photo
            </button>
          )}
        </div>
      )}
    </CustomerLayout>
  )
}
