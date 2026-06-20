import { useState, useCallback, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Upload from '../components/Upload'
import StudioWorkspace from '../components/StudioWorkspace'
import CharacterReviewPanel from '../components/CharacterReviewPanel'
import CustomerLayout from '../components/CustomerLayout'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { buildPrompt1, resolveImageUrls, falStepFormat, fetchReferenceBlob } from '../lib/settings'
import { buildRegenPromptSuffix } from '../lib/regenPrompt'
import { FAL_MODEL, runFalStep, uploadToFal } from '../lib/fal'
import {
  createGeneration, updateGeneration, persistAsset, markStepRunning,
  fetchOrderByToken, linkOrderGeneration, orderAction, confirmCheckout,
  fetchGeneration, urlMapFromSteps,
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

const PROCESSING_STEPS = [
  { key: 'prep', label: 'Préparation photo' },
  { key: 'scene', label: 'Mise en scène atelier' },
  { key: 'line', label: 'Génération du tracé' },
]

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
  const [personOk, setPersonOk] = useState({})
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

  useEffect(() => {
    setPersonOk({})
  }, [lineartUrl])

  const runPipeline = useCallback(async (file, feedbackCharacters = null) => {
    if (!order?.isPaid) return
    setBusy(true)
    setError(null)
    setStatusMsg('Préparation de votre photo…')
    let generationId = order.generationId ?? null
    const isRegen = !!feedbackCharacters?.length

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

      let urlMap = { user: null, ref: null, step1: null, step2: null }

      if (isRegen && generationId) {
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

      setStatusMsg(isRegen ? 'Regénération du tracé avec vos retours…' : 'Génération du tracé…')
      await markStepRunning(generationId, 'step2')
      const feedbackSuffix = buildRegenPromptSuffix(feedbackCharacters)
      const prompt2 = cfg2.prompt + feedbackSuffix
      const url2 = await runFalStep(
        { ...cfg2, ...fmt2, prompt: prompt2 },
        resolveImageUrls(cfg2.imageInputs, urlMap),
      )
      await persistAsset(generationId, 'step2', { falUrl: url2, url: url2, prompt: prompt2, status: 'done' })
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

  const handleRegen = async (characters) => {
    if (order?.regenRemaining != null && order.regenRemaining <= 0) return
    setError(null)
    setBusy(true)
    try {
      await orderAction(orderToken, 'regen', bearerToken, { characters })
      setLineartUrl(null)
      setPersonOk({})
      setPhase('upload')
      await runPipeline(null, characters)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  const handleValidate = async () => {
    const fc = order?.faceCount ?? 0
    const approvedPersons = Array.from({ length: fc }, (_, i) => i).filter(i => personOk[i])
    if (approvedPersons.length < fc) {
      setError(`Cochez les ${fc} personnage${fc > 1 ? 's' : ''} validé${fc > 1 ? 's' : ''} avant de confirmer.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await orderAction(orderToken, 'validate', bearerToken, { approvedPersons })
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
  const showReviewActions = lineartUrl && (phase === 'review' || !order?.editable)
    && (order?.editable || order?.isAdminView)
    && (order.isAdminView || (order.workflowStatus !== 'approved' && order.workflowStatus !== 'revision_requested'))
  const lineartVersion = (order?.regenCount ?? 0) + 1

  const activeStep = statusMsg?.includes('Regénération') || statusMsg?.includes('tracé') ? 2
    : statusMsg?.includes('scène') || statusMsg?.includes('Mise') ? 1
    : busy ? 0 : -1

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

      <StudioWorkspace
        sourcePhotoUrl={order?.sourcePhotoUrl}
        lineartUrl={lineartUrl}
        busy={busy}
        statusMsg={statusMsg}
        phase={phase}
        lineartVersion={lineartVersion}
        processingSteps={PROCESSING_STEPS}
        activeStep={activeStep}
      />

      {phase === 'awaiting_payment' && !order?.sourcePhotoUrl && (
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
        <div className="customer-alert-warn">{error}</div>
      )}

      {phase === 'upload' && canUpload && !busy && !autoStart && !order?.sourcePhotoUrl && (
        <Upload
          theme="light"
          onReady={runPipeline}
          initialFaceCount={order.faceCount}
          lockedCount
        />
      )}

      {showReviewActions && (
        <div className="space-y-4">
          {!order.isAdminView && order.workflowStatus !== 'approved' && (
            <CharacterReviewPanel
              faceCount={order.faceCount}
              disabled={busy}
              regenRemaining={order.regenRemaining}
              onRegen={handleRegen}
              personOk={personOk}
              onPersonOkChange={(i, v) => setPersonOk(prev => ({ ...prev, [i]: v }))}
              onValidate={handleValidate}
              validateDisabled={busy}
              validateBusy={busy}
            />
          )}
        </div>
      )}

      {!order?.isAdminView && order?.workflowStatus === 'approved' && lineartUrl && (
        <p className="text-sm text-center text-[#4A8A52]">
          Design validé — votre commande est en file d&apos;impression.
        </p>
      )}

      {order?.workflowStatus === 'revision_requested' && (
        <p className="text-sm text-center text-[#C0684A]">
          Révision en cours chez nos équipes — nous vous recontactons.
        </p>
      )}

      {!order?.editable && !order?.isAdminView && order?.isPaid && order && !lineartUrl && !busy && (
        <p className="text-sm customer-muted text-center">
          Cette commande n&apos;est plus modifiable (fabrication lancée).
        </p>
      )}
    </CustomerLayout>
  )
}
