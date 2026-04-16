import { useState, useCallback } from 'react'
import * as fal from '@fal-ai/client'
import Upload from './components/Upload'
import Step from './components/Step'
import Admin from './components/Admin'
import { loadPrompts, buildPrompt1 } from './lib/prompts'

fal.config({ proxyUrl: '/api/fal' })

const MODEL = 'fal-ai/nano-banana-pro/edit'
const REFERENCE_LINE_URL = '/referenceLine.jpg'

const INITIAL_STEPS = [
  { status: 'idle', image: null, log: null, error: null },
  { status: 'idle', image: null, log: null, error: null },
  { status: 'idle', image: null, log: null, error: null },
]

async function uploadToFal(file) {
  return fal.storage.upload(file)
}

async function runStep(prompt, imageUrls, onLog) {
  let lastLog = null
  const result = await fal.subscribe(MODEL, {
    input: {
      prompt,
      image_urls: imageUrls,
      aspect_ratio: '16:9',
      resolution: '2K',
    },
    onQueueUpdate(update) {
      if (update.status === 'IN_PROGRESS' && update.logs?.length) {
        lastLog = update.logs[update.logs.length - 1]?.message ?? lastLog
        onLog(lastLog)
      }
    },
  })
  const url = result?.data?.images?.[0]?.url ?? result?.data?.image?.url
  if (!url) throw new Error('Aucune image retournée')
  return url
}

export default function App() {
  const [prompts, setPrompts] = useState(loadPrompts)
  const [showAdmin, setShowAdmin] = useState(false)
  const [phase, setPhase] = useState('upload') // upload | running | done | error
  const [steps, setSteps] = useState(INITIAL_STEPS)
  const [globalError, setGlobalError] = useState(null)

  const patchStep = useCallback((i, patch) => {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }, [])

  const handleStart = useCallback(async (file, faceCount) => {
    setPhase('running')
    setGlobalError(null)
    setSteps(INITIAL_STEPS)

    try {
      // Upload user photo
      const userUrl = await uploadToFal(file)

      // Fetch reference line image as blob then upload
      const refResp = await fetch(REFERENCE_LINE_URL)
      const refBlob = await refResp.blob()
      const refFile = new File([refBlob], 'referenceLine.jpg', { type: 'image/jpeg' })
      const refUrl = await uploadToFal(refFile)

      const imageUrls = [userUrl, refUrl]
      let lastUrl = null

      // Step 1
      patchStep(0, { status: 'running' })
      try {
        const p1 = buildPrompt1(faceCount, prompts.prompt1)
        lastUrl = await runStep(p1, imageUrls, log => patchStep(0, { log }))
        patchStep(0, { status: 'done', image: lastUrl, log: null })
      } catch (err) {
        patchStep(0, { status: 'error', error: err.message })
        throw err
      }

      // Step 2
      patchStep(1, { status: 'running' })
      try {
        lastUrl = await runStep(prompts.prompt2, [lastUrl, refUrl], log => patchStep(1, { log }))
        patchStep(1, { status: 'done', image: lastUrl, log: null })
      } catch (err) {
        patchStep(1, { status: 'error', error: err.message })
        throw err
      }

      // Step 3
      patchStep(2, { status: 'running' })
      try {
        lastUrl = await runStep(prompts.prompt3, [lastUrl, refUrl], log => patchStep(2, { log }))
        patchStep(2, { status: 'done', image: lastUrl, log: null })
      } catch (err) {
        patchStep(2, { status: 'error', error: err.message })
        throw err
      }

      setPhase('done')
    } catch (err) {
      setGlobalError(err.message)
      setPhase('error')
    }
  }, [prompts, patchStep])

  const reset = () => {
    setPhase('upload')
    setSteps(INITIAL_STEPS)
    setGlobalError(null)
  }

  return (
    <div className="min-h-screen bg-stone-950 px-4 py-8">
      <div className="max-w-lg mx-auto space-y-6">

        {/* Header */}
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

        {/* Upload phase */}
        {phase === 'upload' && (
          <Upload onReady={handleStart} />
        )}

        {/* Running / done / error */}
        {phase !== 'upload' && (
          <div className="space-y-4">
            <Step number={1} label="Mise en scène" {...steps[0]} />
            <Step number={2} label="Affinage" {...steps[1]} />
            <Step number={3} label="Finalisation" {...steps[2]} />

            {globalError && (
              <div className="rounded-xl border border-red-700 bg-stone-900 p-4 text-red-400 text-sm">
                {globalError}
              </div>
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
          prompts={prompts}
          onChange={setPrompts}
          onClose={() => setShowAdmin(false)}
        />
      )}
    </div>
  )
}
