import { useState, useCallback } from 'react'
import { fal } from '@fal-ai/client'
import Upload from './components/Upload'
import Step from './components/Step'
import Admin from './components/Admin'
import Preview from './components/Preview'
import { loadSettings, buildPrompt1, resolveImageUrls, STEP_LABELS } from './lib/settings'

fal.config({ proxyUrl: '/api/fal' })

const MODEL = 'fal-ai/nano-banana-pro/edit'
const REFERENCE_LINE_URL = '/referenceLine2.png'

const INITIAL_STEPS = [
  { status: 'idle', image: null, log: null, error: null },
  { status: 'idle', image: null, log: null, error: null },
  { status: 'idle', image: null, log: null, error: null },
]

async function uploadToFal(file) {
  return fal.storage.upload(file)
}

async function runStep(stepConfig, imageUrls, onLog) {
  const result = await fal.subscribe(MODEL, {
    input: {
      prompt: stepConfig.prompt,
      image_urls: imageUrls,
      aspect_ratio: stepConfig.aspectRatio,
      resolution: stepConfig.resolution,
    },
    pollInterval: 2500,
    onQueueUpdate(update) {
      if (update.status === 'IN_QUEUE') {
        onLog(`File d'attente — position ${update.queue_position ?? '?'}`)
      } else if (update.status === 'IN_PROGRESS') {
        const msg = update.logs?.at(-1)?.message
        if (msg) onLog(msg)
      }
    },
  })
  const url = result?.data?.images?.[0]?.url ?? result?.data?.image?.url ?? result?.images?.[0]?.url
  if (!url) throw new Error('Aucune image retournée')
  return url
}

export default function App() {
  const [settings, setSettings] = useState(loadSettings)
  const [showAdmin, setShowAdmin] = useState(false)
  const [phase, setPhase] = useState('upload')
  const [steps, setSteps] = useState(INITIAL_STEPS)
  const [globalError, setGlobalError] = useState(null)
  const [resultUrls, setResultUrls] = useState({ url2: null, url3: null })

  const patchStep = useCallback((i, patch) => {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }, [])

  const handleStart = useCallback(async (file, faceCount) => {
    setPhase('running')
    setGlobalError(null)
    setSteps(INITIAL_STEPS)
    setResultUrls({ url2: null, url3: null })

    try {
      // Show init indicator while uploading
      patchStep(0, { status: 'init' })

      const userUrl = await uploadToFal(file)

      const refResp = await fetch(REFERENCE_LINE_URL)
      const refBlob = await refResp.blob()
      const refUrl = await uploadToFal(new File([refBlob], 'referenceLine2.png', { type: 'image/png' }))

      // URL map for resolving imageInputs
      const urlMap = { user: userUrl, ref: refUrl, step1: null, step2: null }

      let url1, url2, url3
      const [cfg1, cfg2, cfg3] = settings.steps

      // Step 1
      patchStep(0, { status: 'running' })
      try {
        const prompt = buildPrompt1(faceCount, cfg1.prompt)
        const imgs = resolveImageUrls(cfg1.imageInputs, urlMap)
        url1 = await runStep({ ...cfg1, prompt }, imgs, log => patchStep(0, { log }))
        urlMap.step1 = url1
        patchStep(0, { status: 'done', image: url1, log: null })
      } catch (err) {
        patchStep(0, { status: 'error', error: err.message }); throw err
      }

      // Step 2
      patchStep(1, { status: 'running' })
      try {
        const imgs = resolveImageUrls(cfg2.imageInputs, urlMap)
        url2 = await runStep(cfg2, imgs, log => patchStep(1, { log }))
        urlMap.step2 = url2
        patchStep(1, { status: 'done', image: url2, log: null })
      } catch (err) {
        patchStep(1, { status: 'error', error: err.message }); throw err
      }

      // Step 3
      patchStep(2, { status: 'running' })
      try {
        const imgs = resolveImageUrls(cfg3.imageInputs, urlMap)
        url3 = await runStep(cfg3, imgs, log => patchStep(2, { log }))
        patchStep(2, { status: 'done', image: url3, log: null })
      } catch (err) {
        patchStep(2, { status: 'error', error: err.message }); throw err
      }

      setResultUrls({ url2, url3 })
      setPhase('done')
    } catch (err) {
      setGlobalError(err.message)
      setPhase('error')
    }
  }, [settings, patchStep])

  const reset = () => {
    setPhase('upload')
    setSteps(INITIAL_STEPS)
    setGlobalError(null)
    setResultUrls({ url2: null, url3: null })
  }

  return (
    <div className="min-h-screen bg-stone-950 px-4 py-8">
      <div className="max-w-lg mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-stone-100">Mini-Nous Pipeline</h1>
            <p className="text-sm text-stone-500 mt-0.5">Génération figurines bois</p>
          </div>
          <button
            onClick={() => setShowAdmin(true)}
            className="text-xs text-stone-500 hover:text-stone-300 border border-stone-700 rounded-lg px-3 py-1.5"
          >
            Admin
          </button>
        </div>

        {phase === 'upload' && <Upload onReady={handleStart} />}

        {phase !== 'upload' && (
          <div className="space-y-4">
            <Step number={1} label={STEP_LABELS[1]} {...steps[0]} config={settings.steps[0]} />
            <Step number={2} label={STEP_LABELS[2]} {...steps[1]} config={settings.steps[1]} />
            <Step number={3} label={STEP_LABELS[3]} {...steps[2]} config={settings.steps[2]} />

            {globalError && (
              <div className="rounded-xl border border-red-700 bg-stone-900 p-4 text-red-400 text-sm">
                {globalError}
              </div>
            )}

            {phase === 'done' && resultUrls.url2 && resultUrls.url3 && (
              <Preview url2={resultUrls.url2} url3={resultUrls.url3} />
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

      {showAdmin && (
        <Admin
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowAdmin(false)}
        />
      )}
    </div>
  )
}
