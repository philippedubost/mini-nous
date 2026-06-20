import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { DEFAULT_SETTINGS, mergeSettings } from '../lib/settings'
import { fetchPipelineSettings, savePipelineSettings, resetPipelineSettings, uploadReferenceLineArt } from '../lib/storage'

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => structuredClone(DEFAULT_SETTINGS))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  const reload = useCallback(async () => {
    setError(null)
    try {
      const { settings: remote, updatedAt: at } = await fetchPipelineSettings()
      setSettings(mergeSettings(remote))
      setUpdatedAt(at ?? null)
    } catch (e) {
      setError(e.message)
      setSettings(structuredClone(DEFAULT_SETTINGS))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const save = useCallback(async (next) => {
    const { settings: saved, updatedAt: at } = await savePipelineSettings(next)
    const merged = mergeSettings(saved)
    setSettings(merged)
    setUpdatedAt(at ?? null)
    return merged
  }, [])

  const reset = useCallback(async () => {
    const { settings: saved, updatedAt: at } = await resetPipelineSettings()
    const merged = mergeSettings(saved)
    setSettings(merged)
    setUpdatedAt(at ?? null)
    return merged
  }, [])

  const uploadReference = useCallback(async (base64) => {
    const { settings: saved, updatedAt: at } = await uploadReferenceLineArt(base64)
    const merged = mergeSettings(saved)
    setSettings(merged)
    setUpdatedAt(at ?? null)
    return merged
  }, [])

  return (
    <SettingsContext.Provider value={{
      settings,
      loading,
      error,
      updatedAt,
      reload,
      saveSettings: save,
      resetSettings: reset,
      uploadReferenceLineArt: uploadReference,
    }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings requires SettingsProvider')
  return ctx
}
