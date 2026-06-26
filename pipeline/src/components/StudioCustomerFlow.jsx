import { useState, useCallback, useEffect, useRef } from 'react'
import Upload from './Upload'
import StudioWorkspace from './StudioWorkspace'
import StudioFlowSteps from './StudioFlowSteps'
import CharacterReviewPanel from './CharacterReviewPanel'
import PaywallCompositionEditor from './PaywallCompositionEditor'
import ShippingAddressEditor from './ShippingAddressEditor'
import { useSettings } from '../context/SettingsContext'
import { FAL_MODEL, uploadToFal } from '../lib/fal'
import { canShowStudioReview, resolveStudioCaps, displayLineartVersion } from '../lib/studioFlow'
import {
  createGeneration, persistAsset,
  fetchOrderByToken, linkOrderGeneration, orderAction, confirmCheckout,
  submitRevision, selectLineartVersion, startServerStudio,
} from '../lib/storage'
import { scrollPageTo } from '../lib/scrollPage'

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
    if (!orderToken || lineartUrl || order?.previewUrl) return undefined
    if (!order?.isPaid) return undefined
    if (!order?.studioGenerateActive && !['in_studio', 'awaiting_photo'].includes(order?.workflowStatus)) return undefined
    const poll = () => { reloadOrder().catch(() => {}) }
    poll()
    const t = setInterval(poll, 5000)
    return () => clearInterval(t)
  }, [orderToken, lineartUrl, order?.previewUrl, order?.isPaid, order?.workflowStatus, order?.studioGenerateActive, reloadOrder])

  useEffect(() => {
    if (!order?.previewUrl || lineartUrl) return
    if (order?.studioGenerateActive) return
    setLineartUrl(order.previewUrl)
    setPhase('review')
    setBusy(false)
    setStatusMsg(null)
    scrollPageTo('top')
  }, [order?.previewUrl, lineartUrl, order?.studioGenerateActive])

  useEffect(() => {
    if (!order?.studioGenerateActive) return
    setLineartUrl(null)
    setBusy(true)
    setError(null)
    const phaseLabel = order.studioGeneratePhase === 'step2'
      ? 'Traitement du tracé…'
      : order.studioGeneratePhase === 'step1'
        ? 'Mise en scène atelier…'
        : 'Préparation de votre photo…'
    setStatusMsg(phaseLabel)
  }, [order?.studioGenerateActive, order?.studioGeneratePhase])

  const runPipeline = useCallback(async (file) => {
    if (!order?.isPaid) return
    setBusy(true)
    setError(null)
    setStatusMsg('Préparation de votre photo…')

    try {
      let generationId = order.generationId ?? null

      if (file) {
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
        }
        const userUrl = await uploadToFal(file)
        await persistAsset(generationId, 'source', { falUrl: userUrl, url: userUrl, status: 'done' })
      } else if (!order.sourcePhotoUrl && !order.hasPaywallPhoto) {
        throw new Error('Aucune photo disponible — uploadez votre photo de groupe.')
      }

      await startServerStudio(orderToken, bearerToken)
      setStatusMsg('Demande envoyée au moteur studio — vous pouvez fermer cette page. Un e-mail vous préviendra quand le tracé est prêt.')
      setPhase('upload')
      await reloadOrder()
    } catch (err) {
      setError(err.message)
      setStatusMsg(null)
      setPhase(order.previewUrl ? 'review' : 'upload')
      setBusy(false)
    }
  }, [order, orderToken, bearerToken, settings, reloadOrder])

  useEffect(() => {
    if (!autoStart || autoStarted.current || !order?.isPaid) return
    if (order.previewUrl || order.studioGenerateActive) return
    if (!order.sourcePhotoUrl && !order.hasPaywallPhoto) return
    autoStarted.current = true
    startServerStudio(orderToken, bearerToken).catch(err => setError(err.message))
  }, [autoStart, order, orderToken, bearerToken])

  const handleAutoAdjust = async (characters) => {
    const caps = resolveStudioCaps(order)
    if (!caps.canAutoAdjust) return
    setError(null)
    setBusy(true)
    try {
      await orderAction(orderToken, 'regen', bearerToken, { characters })
      setLineartUrl(null)
      setPhase('upload')
      setStatusMsg('Regénération en cours côté serveur…')
      await reloadOrder()
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
    startServerStudio(orderToken, bearerToken).catch(err => setError(err.message))
  }

  const canUpload = order?.isPaid && (order?.editable || order?.isAdminView)
  const lineartVersion = displayLineartVersion(order)
  const showReviewActions = canShowStudioReview({ order, lineartUrl })
  const studioCaps = resolveStudioCaps(order)
  const serverBusy = order?.studioGenerateActive
  const showRetry = order?.isPaid && !busy && !serverBusy && !lineartUrl && !order?.previewUrl
    && (error || order?.generationStatus === 'error')

  const activeStep = (busy || serverBusy)
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
    && !order?.previewUrl && !lineartUrl && !busy

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
        <StudioFlowSteps order={order} lineartUrl={lineartUrl} busy={busy || serverBusy} phase={phase} />
      )}

      <StudioWorkspace
        sourcePhotoUrl={order.sourcePhotoUrl}
        lineartUrl={lineartUrl}
        busy={busy || serverBusy}
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
          <p className="text-xs customer-muted">La génération démarre sur notre moteur studio — vous recevrez un e-mail quand le tracé est prêt.</p>
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
