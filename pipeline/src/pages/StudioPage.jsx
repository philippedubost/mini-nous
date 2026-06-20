import { useState, useCallback, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Upload from '../components/Upload'
import RevisionPanel from '../components/RevisionPanel'
import { useAuth } from '../context/AuthContext'
import { loadSettings, buildPrompt1, resolveImageUrls, falStepFormat } from '../lib/settings'
import { FAL_MODEL, runFalStep, uploadToFal } from '../lib/fal'
import {
  createGeneration, updateGeneration, persistAsset, markStepRunning,
  fetchOrderByToken, linkOrderGeneration, orderAction,
} from '../lib/storage'

const REFERENCE_LINE_URL = `${import.meta.env.BASE_URL}referenceLine2.png`

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
  const autoStart = searchParams.get('auto') === '1'
  const { accessToken: bearerToken } = useAuth()
  const [settings] = useState(loadSettings)
  const [order, setOrder] = useState(null)
  const [orderError, setOrderError] = useState(null)
  const [phase, setPhase] = useState('loading')
  const [busy, setBusy] = useState(false)
  const [lineartUrl, setLineartUrl] = useState(null)
  const [statusMsg, setStatusMsg] = useState(null)
  const [error, setError] = useState(null)
  const autoStarted = useRef(false)

  const reloadOrder = useCallback(async () => {
    if (!orderToken) return null
    const { order: o } = await fetchOrderByToken(orderToken, bearerToken)
    setOrder(o)
    if (o.previewUrl) setLineartUrl(o.previewUrl)
    setPhase(phaseForOrder(o))
    return o
  }, [orderToken, bearerToken])

  useEffect(() => {
    if (!orderToken) {
      setOrderError('Lien incomplet')
      setPhase('error')
      return
    }
    fetchOrderByToken(orderToken, bearerToken)
      .then(({ order: o }) => {
        setOrder(o)
        if (o.previewUrl) setLineartUrl(o.previewUrl)
        setPhase(phaseForOrder(o))
      })
      .catch(err => {
        setOrderError(err.message)
        setPhase('error')
      })
  }, [orderToken, bearerToken])

  useEffect(() => {
    if (!orderToken || order?.isPaid) return undefined
    let cancelled = false
    const poll = () => {
      fetchOrderByToken(orderToken, bearerToken)
        .then(({ order: o }) => {
          if (cancelled) return
          setOrder(o)
          if (o.isPaid) {
            setPhase(o.previewUrl ? 'review' : 'upload')
          }
        })
        .catch(() => {})
    }
    const t = setInterval(poll, 2000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [orderToken, bearerToken, order?.isPaid])

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
        setStatusMsg('Chargement de votre photo du paywall…')
        const photoFile = await fileFromImageUrl(order.sourcePhotoUrl)
        userUrl = await uploadToFal(photoFile)
        await persistAsset(generationId, 'source', { falUrl: userUrl, url: userUrl, status: 'done' })
      } else {
        throw new Error('Aucune photo disponible — uploadez votre photo de groupe.')
      }

      const refResp = await fetch(REFERENCE_LINE_URL)
      const refBlob = await refResp.blob()
      const refUrl = await uploadToFal(new File([refBlob], 'referenceLine2.png', { type: 'image/png' }))
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
    <div className="min-h-screen bg-stone-950 text-stone-100 px-4 py-8">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Link to={orderToken ? `/commande?order=${encodeURIComponent(orderToken)}` : '/compte'} className="text-xs text-stone-600 hover:text-stone-400">
              ← Ma commande
            </Link>
            <h1 className="text-xl font-bold mt-1">Studio MiniNous</h1>
            <p className="text-sm text-stone-500">Tracé atelier · validation avant impression</p>
          </div>
          <Link to="/compte" className="text-xs border border-stone-700 rounded-lg px-3 py-1.5 text-stone-400 hover:text-stone-200">
            Compte
          </Link>
        </div>

        {order && (
          <div className="rounded-xl border border-stone-800 bg-stone-900/40 p-4 text-sm space-y-1">
            <p><strong>{order.packLabel}</strong> · {order.faceCount} figurine{order.faceCount > 1 ? 's' : ''}</p>
            <p className="text-stone-500">{order.isPaid ? order.workflowLabel : 'En attente de paiement'}</p>
            {shipLabel && <p className="text-stone-500 text-xs">Livraison {shipLabel}</p>}
          </div>
        )}

        {orderError && (
          <div className="rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-300">{orderError}</div>
        )}

        {phase === 'awaiting_payment' && (
          <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-6 text-center space-y-3">
            <div className="w-10 h-10 border-2 border-stone-700 border-t-amber-500 rounded-full animate-spin mx-auto"/>
            <p className="text-sm text-amber-100">Confirmation du paiement Stripe…</p>
            <p className="text-xs text-stone-500">Votre photo est déjà enregistrée — le studio démarrera automatiquement.</p>
            <Link
              to={`/commande?order=${encodeURIComponent(orderToken)}`}
              className="inline-block text-xs text-stone-400 hover:text-stone-200"
            >
              Voir ma commande →
            </Link>
          </div>
        )}

        {statusMsg && (
          <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 text-sm text-amber-100">{statusMsg}</div>
        )}

        {error && (
          <div className="rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-300">{error}</div>
        )}

        {order?.sourcePhotoUrl && phase === 'upload' && canUpload && !busy && !autoStart && (
          <div className="rounded-xl border border-stone-800 overflow-hidden bg-stone-900/50">
            <p className="text-xs text-stone-500 px-4 pt-3">Votre photo du paywall</p>
            <img src={order.sourcePhotoUrl} alt="Photo source" className="w-full object-contain max-h-48"/>
          </div>
        )}

        {phase === 'upload' && canUpload && !busy && (
          <Upload
            onReady={runPipeline}
            initialFaceCount={order.faceCount}
            lockedCount
          />
        )}

        {busy && (
          <div className="rounded-xl border border-stone-800 p-8 text-center space-y-3">
            <div className="w-10 h-10 border-2 border-stone-700 border-t-amber-500 rounded-full animate-spin mx-auto"/>
            <p className="text-sm text-stone-400">{statusMsg || 'Génération en cours…'}</p>
          </div>
        )}

        {lineartUrl && (phase === 'review' || !order?.editable) && (
          <div className="space-y-4">
            <div className="rounded-xl border border-stone-800 overflow-hidden bg-stone-900/50">
              <p className="text-xs text-stone-500 px-4 pt-3">Votre tracé atelier</p>
              <img src={lineartUrl} alt="Tracé lineart" className="w-full object-contain max-h-96"/>
            </div>

            {(order?.editable || order?.isAdminView)
              && (order.isAdminView || (order.workflowStatus !== 'approved' && order.workflowStatus !== 'revision_requested'))
              && (
              <div className="space-y-3">
                {!order.isAdminView && order.workflowStatus !== 'approved' && (
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={busy}
                  className="w-full py-3.5 rounded-xl font-semibold bg-emerald-500 hover:bg-emerald-400 text-stone-950 disabled:opacity-50"
                >
                  Valider mon design → impression
                </button>
                )}

                {(order.regenRemaining == null || order.regenRemaining > 0) && (
                  <button
                    type="button"
                    onClick={handleRegen}
                    className="w-full py-2.5 rounded-xl border border-stone-600 text-stone-300 text-sm hover:border-stone-400"
                  >
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

            {order?.isAdminView && order.workflowStatus === 'approved' && (
              <p className="text-xs text-stone-500 text-center">
                Mode admin — vous pouvez regénérer même après validation.
              </p>
            )}

            {!order?.isAdminView && order?.workflowStatus === 'approved' && (
              <p className="text-sm text-emerald-300 text-center">
                Design validé — votre commande est en file d&apos;impression.
              </p>
            )}

            {order?.workflowStatus === 'revision_requested' && (
              <p className="text-sm text-amber-200 text-center">
                Révision en cours chez nos équipes — nous vous recontactons.
              </p>
            )}
          </div>
        )}

        {!order?.editable && !order?.isAdminView && order?.isPaid && order && !lineartUrl && (
          <p className="text-sm text-stone-500 text-center">
            Cette commande n&apos;est plus modifiable (fabrication lancée).
          </p>
        )}
      </div>
    </div>
  )
}
