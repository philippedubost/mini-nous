import { useState, useCallback, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Upload from '../components/Upload'
import RevisionPanel from '../components/RevisionPanel'
import CustomerLayout from '../components/CustomerLayout'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { buildPrompt1, resolveImageUrls, falStepFormat, fetchReferenceBlob } from '../lib/settings'
import { FAL_MODEL, runFalStep, uploadToFal } from '../lib/fal'
import {
  createGeneration, updateGeneration, persistAsset, markStepRunning,
  fetchOrderByToken, linkOrderGeneration, orderAction, confirmCheckout,
} from '../lib/storage'

async function fileFromImageUrl(url, name = 'photo.jpg') {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Impossible de charger votre photo')
  const blob = await res.blob()
  return new File([blob], name, { type: blob.type || 'image/jpeg' })
}

function phaseForOrder(order) {
  if (!order.isPaid) return 'awaiting_payment'
  if (order.previewUrl) return 'review'
  return 'upload'
}

export default function StudioPage() {
  const [searchParams] = useSearchParams()
  const orderToken = searchParams.get('order')
  const stripeSessionId = searchParams.get('session_id')
  const autoStart = searchParams.get('auto') === '1'
  const { accessToken: bearerToken } = useAuth()
  const { settings } = useSettings()
  const [order, setOrder] = useState(null)
  const [orderError, setOrderError] = useState(null)
  const [phase, setPhase] = useState('loading')
  const [busy, setBusy] = useState(false)
  const [lineartUrl, setLineartUrl] = useState(null)
  const [statusMsg, setStatusMsg] = useState(null)
  const [error, setError] = useState(null)
  const autoStarted = useRef(false)
  const confirmTried = useRef(false)

  const applyOrder = useCallback((o) => {
    setOrder(o)
    if (o.previewUrl) setLineartUrl(o.previewUrl)
    setPhase(phaseForOrder(o))
    return o
  }, [])

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
        .then(({ order: o }) => {
          if (cancelled) return
          applyOrder(o)
        })
        .catch(() => {})
    }
    const t = setInterval(poll, 2000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [orderToken, bearerToken, order?.isPaid, stripeSessionId, applyOrder])

  const runPipeline = useCallback(async (file) => {
    if (!order?.isPaid) return
    setBusy(true)
    setError(null)
    setStatusMsg('Préparation de votre photo…')
    let generationId = order.generationId ?? null

    try {
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
      }

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

      const refBlob = await fetchReferenceBlob(settings)
      const refUrl = await uploadToFal(new File([refBlob], 'reference-line.png', { type: refBlob.type || 'image/png' }))
      await persistAsset(generationId, 'ref', { falUrl: refUrl, url: refUrl, status: 'done' })

      const urlMap = { user: userUrl, ref: refUrl, step1: null, step2: null }
      const [cfg1, cfg2] = settings.steps
      const fmt1 = falStepFormat(cfg1, settings)
      const fmt2 = falStepFormat(cfg2, settings)

      setStatusMsg('Mise en scène atelier…')
      await markStepRunning(generationId, 'step1')
      const prompt1 = buildPrompt1(order.faceCount, cfg1.prompt)
      const url1 = await runFalStep(
        { ...cfg1, ...fmt1, prompt: prompt1 },
        resolveImageUrls(cfg1.imageInputs, urlMap),
      )
      urlMap.step1 = url1
      await persistAsset(generationId, 'step1', { falUrl: url1, url: url1, prompt: prompt1, status: 'done' })

      setStatusMsg('Génération du tracé…')
      await markStepRunning(generationId, 'step2')
      const url2 = await runFalStep(
        { ...cfg2, ...fmt2, prompt: cfg2.prompt },
        resolveImageUrls(cfg2.imageInputs, urlMap),
      )
      await persistAsset(generationId, 'step2', { falUrl: url2, url: url2, prompt: cfg2.prompt, status: 'done' })
      await updateGeneration(generationId, { status: 'done' })

      await orderAction(orderToken, 'pending_validation', bearerToken)
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
      setPhase('upload')
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

  const handleRegen = async () => {
    if (order?.regenRemaining != null && order.regenRemaining <= 0) return
    setError(null)
    try {
      await orderAction(orderToken, 'regen', bearerToken)
      setPhase('upload')
      setLineartUrl(null)
      autoStarted.current = false
      await reloadOrder()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleValidate = async () => {
    setBusy(true)
    setError(null)
    try {
      await orderAction(orderToken, 'validate', bearerToken)
      setStatusMsg('Design validé — merci ! Vos figurines partent en file d\'impression.')
      await reloadOrder()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const shipLabel = order?.shipDate
    ? new Date(`${order.shipDate}T12:00:00`).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
    : null

  const canUpload = order?.isPaid && (order?.editable || order?.isAdminView)

  return (
    <CustomerLayout
      title="Studio MiniNous"
      subtitle="Tracé atelier · validation avant impression"
      navRight={(
        <Link
          to={orderToken ? `/commande?order=${encodeURIComponent(orderToken)}` : '/compte'}
          className="customer-link text-xs"
        >
          Ma commande
        </Link>
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
          <p className="font-semibold text-[#2C1F14]">{order.packLabel} · {order.faceCount} figurine{order.faceCount > 1 ? 's' : ''}</p>
          <p className="customer-muted">{order.isPaid ? order.workflowLabel : 'En attente de paiement'}</p>
          {shipLabel && <p className="customer-muted text-xs">Livraison {shipLabel}</p>}
        </div>
      )}

      {order?.sourcePhotoUrl && (
        <div className="customer-card overflow-hidden !p-0">
          <p className="text-xs customer-muted px-4 pt-3">Votre photo originale</p>
          <img src={order.sourcePhotoUrl} alt="Photo de groupe" className="w-full object-contain max-h-56 bg-[#F5EDE0]"/>
        </div>
      )}

      {phase === 'awaiting_payment' && (
        <div className="customer-card text-center space-y-3 py-8">
          <div className="customer-spinner mx-auto" aria-hidden />
          <p className="text-sm font-medium text-[#C0684A]">Confirmation du paiement Stripe…</p>
          <p className="text-xs customer-muted">Votre photo est enregistrée — le studio démarrera automatiquement.</p>
        </div>
      )}

      {statusMsg && (
        <div className="customer-alert-ok">{statusMsg}</div>
      )}

      {error && (
        <div className="customer-alert-warn">{error}</div>
      )}

      {phase === 'upload' && canUpload && !busy && !autoStart && (
        <Upload
          theme="light"
          onReady={runPipeline}
          initialFaceCount={order.faceCount}
          lockedCount
        />
      )}

      {busy && (
        <div className="customer-card text-center space-y-3 py-8">
          <div className="customer-spinner mx-auto" aria-hidden />
          <p className="text-sm customer-muted">{statusMsg || 'Génération en cours…'}</p>
        </div>
      )}

      {lineartUrl && (phase === 'review' || !order?.editable) && (
        <div className="space-y-4">
          <div className="customer-card overflow-hidden !p-0">
            <p className="text-xs customer-muted px-4 pt-3">Votre tracé atelier</p>
            <img src={lineartUrl} alt="Tracé lineart" className="w-full object-contain max-h-96 bg-[#F5EDE0]"/>
          </div>

          {(order?.editable || order?.isAdminView)
            && (order.isAdminView || (order.workflowStatus !== 'approved' && order.workflowStatus !== 'revision_requested'))
            && (
            <div className="space-y-3">
              {!order.isAdminView && order.workflowStatus !== 'approved' && (
              <button type="button" onClick={handleValidate} disabled={busy} className="customer-btn-clay w-full">
                Valider mon design → impression
              </button>
              )}

              {(order.regenRemaining == null || order.regenRemaining > 0) && (
                <button type="button" onClick={handleRegen} className="customer-btn-ghost w-full">
                  {order.regenRemaining == null
                    ? 'Regénérer le tracé (illimité)'
                    : `Regénérer le tracé (${order.regenRemaining} restante${order.regenRemaining > 1 ? 's' : ''})`}
                </button>
              )}

              {!order.isAdminView && (
              <RevisionPanel
                token={orderToken}
                faceCount={order.faceCount}
                bearerToken={bearerToken}
                disabled={busy}
                onSubmitted={reloadOrder}
              />
              )}
            </div>
          )}

          {!order?.isAdminView && order?.workflowStatus === 'approved' && (
            <p className="text-sm text-center text-[#4A8A52]">
              Design validé — votre commande est en file d&apos;impression.
            </p>
          )}

          {order?.workflowStatus === 'revision_requested' && (
            <p className="text-sm text-center text-[#C0684A]">
              Révision en cours chez nos équipes — nous vous recontactons.
            </p>
          )}
        </div>
      )}

      {!order?.editable && !order?.isAdminView && order?.isPaid && order && !lineartUrl && (
        <p className="text-sm customer-muted text-center">
          Cette commande n&apos;est plus modifiable (fabrication lancée).
        </p>
      )}
    </CustomerLayout>
  )
}
