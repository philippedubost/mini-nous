import { useState, useCallback, useEffect, useRef } from 'react'
import Upload from './Upload'
import StudioWorkspace from './StudioWorkspace'
import StudioFlowSteps from './StudioFlowSteps'
import CharacterReviewPanel from './CharacterReviewPanel'
import PaywallCompositionEditor from './PaywallCompositionEditor'
import ShippingAddressEditor from './ShippingAddressEditor'
import { useSettings } from '../context/SettingsContext'
import { buildPrompt1, resolveImageUrls, falStepFormat, fetchReferenceBlob } from '../lib/settings'
import { buildMegaRegenPrompt } from '../lib/regenPrompt'
import { FAL_MODEL, runFalStep, uploadToFal } from '../lib/fal'
import { canShowStudioReview, resolveStudioCaps, displayLineartVersion } from '../lib/studioFlow'
import {
  createGeneration, updateGeneration, persistAsset, markStepRunning,
  fetchOrderByToken, linkOrderGeneration, orderAction, confirmCheckout,
  fetchGeneration, urlMapFromSteps, submitRevision, selectLineartVersion,
} from '../lib/storage'

async function fileFromImageUrl(url, name = 'photo.jpg') {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Impossible de charger votre photo')
  const blob = await res.blob()
  return new File([blob], name, { type: blob.type || 'image/jpeg' })
}

function phaseForOrder(order) {
  if (!order.isPaid) return 'awaiting_payment'
  if (order.previewUrl && order.workflowStatus !== 'revision_requested') return 'review'
  return 'upload'
}

const PROCESSING_STEPS = [
  { key: 'prep', label: 'Préparation photo' },
  { key: 'scene', label: 'Mise en scène atelier' },
  { key: 'line', label: 'Traitement du tracé' },
]

export default function StudioCustomerFlow({
  orderToken,
  bearerToken = null,
  autoStart = false,
  stripeSessionId = null,
  embedMode = false,
  onOrderChange,
}) {
  const { settings } = useSettings()
  const [order, setOrder] = useState(null)
  const [orderError, setOrderError] = useState(null)
  const [phase, setPhase] = useState('loading')
  const [busy, setBusy] = useState(false)
  const [lineartUrl, setLineartUrl] = useState(null)
  const [statusMsg, setStatusMsg] = useState(null)
  const [error, setError] = useState(null)
  const [selectedVersionId, setSelectedVersionId] = useState(null)
  const autoStarted = useRef(false)
  const confirmTried = useRef(false)

  const applyOrder = useCallback((o) => {
    setOrder(o)
    if (o.previewUrl) setLineartUrl(o.previewUrl)
    const selected = o.lineartVersions?.find(v => v.isSelected)
      ?? o.lineartVersions?.[o.lineartVersions.length - 1]
    if (selected) {
      setSelectedVersionId(selected.versionId)
      if (o.studio?.showVersionPicker) setLineartUrl(selected.url)
    }
    if (o.generationStatus === 'error' && o.generationError && !o.previewUrl) {
      setError(o.generationError)
    }
    setPhase(phaseForOrder(o))
    onOrderChange?.(o)
    return o
  }, [onOrderChange])

  const reloadOrder = useCallback(async () => {
    if (!orderToken) return null
    const { order: o } = await fetchOrderByToken(orderToken, bearerToken)
    return applyOrder(o)
  }, [orderToken, bearerToken, applyOrder])

  useEffect(() => {
    if (!orderToken) {
      setOrderError('Lien incomplet')
      setPhase('error')
      return
    }
    fetchOrderByToken(orderToken, bearerToken)
      .then(({ order: o }) => applyOrder(o))
      .catch(err => {
        setOrderError(err.message)
        setPhase('error')
      })
  }, [orderToken, bearerToken, applyOrder])

  useEffect(() => {
    if (!orderToken || !stripeSessionId || confirmTried.current) return
    confirmTried.current = true
    confirmCheckout(stripeSessionId, orderToken)
      .then(({ order: o, paid }) => {
        if (o) applyOrder(o)
        else if (paid === false) setStatusMsg('Paiement en cours de validation…')
      })
      .catch(() => {})
  }, [orderToken, stripeSessionId, applyOrder])

  useEffect(() => {
    if (!orderToken || order?.isPaid) return undefined
    let cancelled = false
    const poll = () => {
      if (stripeSessionId && !confirmTried.current) return
      fetchOrderByToken(orderToken, bearerToken)
        .then(({ order: o }) => { if (!cancelled) applyOrder(o) })
        .catch(() => {})
    }
    const t = setInterval(poll, 2000)
    return () => { cancelled = true; clearInterval(t) }
  }, [orderToken, bearerToken, order?.isPaid, stripeSessionId, applyOrder])

  useEffect(() => {
    if (order?.workflowStatus !== 'revision_requested') return undefined
    const t = setInterval(() => { reloadOrder().catch(() => {}) }, 30000)
    return () => clearInterval(t)
  }, [order?.workflowStatus, reloadOrder])

  useEffect(() => {
    if (!orderToken || busy || lineartUrl || order?.previewUrl) return undefined
    if (!order?.isPaid) return undefined
    if (!['in_studio', 'awaiting_photo'].includes(order?.workflowStatus)) return undefined
    const poll = () => { reloadOrder().catch(() => {}) }
    poll()
    const t = setInterval(poll, 5000)
    return () => clearInterval(t)
  }, [orderToken, busy, lineartUrl, order?.previewUrl, order?.isPaid, order?.workflowStatus, reloadOrder])

  const runPipeline = useCallback(async (file, feedbackCharacters = null) => {
    if (!order?.isPaid) return
    setBusy(true)
    setError(null)
    setStatusMsg('Préparation de votre photo…')
    let generationId = order.generationId ?? null
    const isAutoRegen = !!feedbackCharacters?.length

    try {
      let urlMap = { user: null, ref: null, step1: null, step2: null }

      if (!generationId) {
        const generation = await createGeneration({
          faceCount: order.faceCount,
          resolution: settings.resolution,
          aspectRatio: settings.aspectRatio,
          settings,
          falModel: FAL_MODEL,
          orderId: order.id,
        })
        generationId = generation.id
        await linkOrderGeneration(orderToken, generationId, bearerToken)
      } else {
        await updateGeneration(generationId, { status: 'running' }).catch(() => {})
        const { steps } = await fetchGeneration(generationId)
        urlMap = { ...urlMap, ...urlMapFromSteps(steps) }
        if (urlMap.step2 && !isAutoRegen) {
          await orderAction(orderToken, 'pending_validation', bearerToken, { lineartVersion: 1 })
          setLineartUrl(urlMap.step2)
          setPhase('review')
          setStatusMsg(null)
          await reloadOrder()
          return
        }
      }

      if (isAutoRegen && generationId) {
        const { steps } = await fetchGeneration(generationId)
        urlMap = { ...urlMap, ...urlMapFromSteps(steps) }
      }

      if (!urlMap.user) {
        let userUrl
        if (file) {
          userUrl = await uploadToFal(file)
          await persistAsset(generationId, 'source', { falUrl: userUrl, url: userUrl, status: 'done' })
        } else if (order.sourcePhotoUrl) {
          setStatusMsg('Chargement de votre photo…')
          const photoFile = await fileFromImageUrl(order.sourcePhotoUrl)
          userUrl = await uploadToFal(photoFile)
          await persistAsset(generationId, 'source', { falUrl: userUrl, url: userUrl, status: 'done' })
        } else {
          throw new Error('Aucune photo disponible — uploadez votre photo de groupe.')
        }
        urlMap.user = userUrl
      }

      if (!urlMap.ref) {
        const refBlob = await fetchReferenceBlob(settings)
        const refUrl = await uploadToFal(new File([refBlob], 'reference-line.png', { type: refBlob.type || 'image/png' }))
        await persistAsset(generationId, 'ref', { falUrl: refUrl, url: refUrl, status: 'done' })
        urlMap.ref = refUrl
      }

      const [cfg1, cfg2] = settings.steps
      const fmt1 = falStepFormat(cfg1, settings)
      const fmt2 = falStepFormat(cfg2, settings)

      if (!urlMap.step1) {
        setStatusMsg('Mise en scène atelier…')
        await markStepRunning(generationId, 'step1')
        const prompt1 = buildPrompt1(order.faceCount, cfg1.prompt)
        const url1 = await runFalStep(
          { ...cfg1, ...fmt1, prompt: prompt1 },
          resolveImageUrls(cfg1.imageInputs, urlMap),
        )
        urlMap.step1 = url1
        await persistAsset(generationId, 'step1', { falUrl: url1, url: url1, prompt: prompt1, status: 'done' })
      }

      setStatusMsg(isAutoRegen ? 'Regénération automatique du tracé v2…' : 'Traitement du tracé…')
      await markStepRunning(generationId, 'step2')
      const prompt2 = isAutoRegen
        ? buildMegaRegenPrompt(cfg2.prompt, feedbackCharacters)
        : cfg2.prompt
      const step2Inputs = isAutoRegen
        ? ['step1', 'ref']
        : (cfg2.imageInputs ?? ['step1', 'ref'])
      const url2 = await runFalStep(
        { ...cfg2, ...fmt2, prompt: prompt2 },
        resolveImageUrls(step2Inputs, urlMap),
      )
      await persistAsset(generationId, 'step2', { falUrl: url2, url: url2, prompt: prompt2, status: 'done' })
      await updateGeneration(generationId, { status: 'done' })

      const nextVersion = isAutoRegen ? 2 : 1
      await orderAction(orderToken, 'pending_validation', bearerToken, { lineartVersion: nextVersion })
      setLineartUrl(url2)
      setPhase('review')
      setStatusMsg(null)
      await reloadOrder()
    } catch (err) {
      if (generationId) {
        await updateGeneration(generationId, { status: 'error', errorMessage: err.message }).catch(() => {})
      }
      setError(err.message)
      setStatusMsg(null)
      setPhase(order.previewUrl ? 'review' : 'upload')
    } finally {
      setBusy(false)
    }
  }, [order, orderToken, bearerToken, settings, reloadOrder])

  useEffect(() => {
    if (!autoStart || autoStarted.current || busy || !order?.isPaid) return
    if (order.previewUrl || phase !== 'upload') return
    if (!order.sourcePhotoUrl && !order.hasPaywallPhoto) return
    autoStarted.current = true
    runPipeline(null)
  }, [autoStart, busy, order, phase, runPipeline])

  const handleAutoAdjust = async (characters) => {
    const caps = resolveStudioCaps(order)
    if (!caps.canAutoAdjust) return
    setError(null)
    setBusy(true)
    try {
      await orderAction(orderToken, 'regen', bearerToken, { characters })
      setLineartUrl(null)
      setPhase('upload')
      await runPipeline(null, characters)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  const handleManualRevision = async (characters) => {
    const caps = resolveStudioCaps(order)
    if (!caps.canManualAdjust) return
    setError(null)
    setBusy(true)
    try {
      await submitRevision(orderToken, characters, bearerToken)
      setStatusMsg('Ajustements envoyés — notre équipe reprend le tracé sous 24 h.')
      await reloadOrder()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleSelectVersion = async (version) => {
    if (!version?.versionId) return
    setBusy(true)
    setError(null)
    try {
      await selectLineartVersion(orderToken, version.versionId, bearerToken)
      setSelectedVersionId(version.versionId)
      setLineartUrl(version.url)
      await reloadOrder()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleValidate = async () => {
    setBusy(true)
    setError(null)
    try {
      const caps = resolveStudioCaps(order)
      const multiVersion = (order.lineartVersions?.length ?? 0) >= 2
      await orderAction(orderToken, 'validate', bearerToken, {
        ...((caps.showVersionPicker || multiVersion) && selectedVersionId ? { versionId: selectedVersionId } : {}),
      })
      setStatusMsg(null)
      await reloadOrder()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleRetry = () => {
    autoStarted.current = false
    setError(null)
    runPipeline(null)
  }

  const canUpload = order?.isPaid && (order?.editable || order?.isAdminView)
  const lineartVersion = displayLineartVersion(order)
  const showReviewActions = canShowStudioReview({ order, lineartUrl })
  const studioCaps = resolveStudioCaps(order)
  const showRetry = order?.isPaid && !busy && !lineartUrl && !order?.previewUrl
    && (error || order?.generationStatus === 'error')

  const activeStep = busy
    ? (statusMsg?.includes('v2') || statusMsg?.includes('tracé') || statusMsg?.includes('Tracé') ? 2
      : statusMsg?.includes('scène') || statusMsg?.includes('Mise') ? 1
      : 0)
    : -1

  const revisionDueLabel = order?.revisionDueAt
    ? new Date(order.revisionDueAt).toLocaleString('fr-FR', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
    : null

  if (phase === 'loading' && !embedMode) {
    return <p className="customer-muted text-sm text-center py-8">Chargement…</p>
  }

  if (orderError) {
    return <div className="customer-alert-warn">{orderError}</div>
  }

  if (!order) return null

  const showCompositionEditor = order?.isPaid && order?.editable && !order?.isAdminView
    && !order?.previewUrl && !lineartUrl

  return (
    <div className="space-y-4">
      {showCompositionEditor && (
        <PaywallCompositionEditor
          variant="studio"
          orderToken={orderToken}
          bearerToken={bearerToken}
          faceCount={order.faceCount}
          childCount={order.childCount ?? 0}
          maxFaces={order.maxFaces ?? 8}
          onUpdated={applyOrder}
          disabled={busy}
        />
      )}

      {!embedMode && (
        <StudioFlowSteps order={order} lineartUrl={lineartUrl} busy={busy} phase={phase} />
      )}

      <StudioWorkspace
        sourcePhotoUrl={order.sourcePhotoUrl}
        lineartUrl={lineartUrl}
        busy={busy}
        statusMsg={statusMsg}
        phase={phase}
        lineartVersion={lineartVersion}
        workflowStatus={order.workflowStatus}
        processingSteps={PROCESSING_STEPS}
        activeStep={activeStep}
        embedMode={embedMode}
      >
        {showReviewActions && (
          <CharacterReviewPanel
            faceCount={order.faceCount}
            lineartVersion={lineartVersion}
            lineartUrl={lineartUrl}
            studio={studioCaps}
            lineartVersions={order.lineartVersions ?? []}
            selectedVersionId={selectedVersionId}
            disabled={busy}
            onAutoAdjust={handleAutoAdjust}
            onManualRevision={handleManualRevision}
            onSelectVersion={handleSelectVersion}
            onValidate={handleValidate}
            validateBusy={busy}
          />
        )}
      </StudioWorkspace>

      {order.shippingAddress && !embedMode && (
        <ShippingAddressEditor
          orderToken={orderToken}
          bearerToken={bearerToken}
          shippingAddress={order.shippingAddress}
          onUpdated={applyOrder}
          disabled={busy || order.workflowStatus === 'shipped'}
        />
      )}

      {phase === 'awaiting_payment' && !order.sourcePhotoUrl && !embedMode && (
        <div className="customer-card text-center space-y-3 py-8">
          <div className="customer-spinner mx-auto" aria-hidden />
          <p className="text-sm font-medium text-[#C0684A]">Confirmation du paiement Stripe…</p>
          <p className="text-xs customer-muted">Le studio démarrera automatiquement dès validation.</p>
        </div>
      )}

      {statusMsg && !busy && (
        <div className="customer-alert-ok">{statusMsg}</div>
      )}

      {error && (
        <div className="customer-alert-warn space-y-3">
          <p>{error}</p>
          {showRetry && (
            <button type="button" className="customer-btn-clay w-full" onClick={handleRetry}>
              Relancer le traitement
            </button>
          )}
        </div>
      )}

      {phase === 'upload' && canUpload && !busy && !autoStart && !order.sourcePhotoUrl && (
        <Upload
          theme="light"
          onReady={runPipeline}
          initialFaceCount={order.faceCount}
          lockedCount
        />
      )}

      {!order.isAdminView && order.workflowStatus === 'approved' && lineartUrl && !embedMode && (
        <p className="text-sm text-center text-[#4A8A52]">
          Prêt à fabriquer — votre commande est en file d&apos;impression.
        </p>
      )}

      {order.workflowStatus === 'revision_requested' && (
        <div className="customer-card-muted !p-5 text-center space-y-2">
          <p className="text-sm font-semibold text-[#C0684A]">Révision en cours chez nos équipes</p>
          <p className="text-xs customer-muted">
            Nous reprenons votre tracé à la main pour produire la version v3.
            {revisionDueLabel ? ` Réponse attendue avant ${revisionDueLabel}.` : ' Réponse sous 24 h.'}
          </p>
          <p className="text-xs customer-muted">Cette page se mettra à jour dès que le tracé v3 sera prêt.</p>
        </div>
      )}

      {['in_production', 'shipped'].includes(order.workflowStatus) && !order.isAdminView && order.isPaid && (
        <p className="text-sm customer-muted text-center">
          Votre commande est en fabrication — modifications fermées.
        </p>
      )}
    </div>
  )
}
