import { useCallback, useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { fetchAuthStatus, fetchDevices, fetchGoveeDevices } from './api'
import type { AuthStatus, GoveeReading, Reading } from './types'
import { ThermostatPanel } from './components/ThermostatPanel'
import { GoveePanel } from './components/GoveePanel'
import { SettingsModal } from './components/SettingsModal'

const REFRESH_MS = 5 * 60 * 1000

function sortDevices(devices: Reading[]): Reading[] {
  const order = ['upstairs', 'downstairs']
  return [...devices].sort((a, b) => {
    const ai = order.indexOf((a.location ?? '').toLowerCase())
    const bi = order.indexOf((b.location ?? '').toLowerCase())
    if (ai === -1 && bi === -1) return a.display_name.localeCompare(b.display_name)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

type Stage = 'loading' | 'needs-credentials' | 'needs-auth' | 'dashboard'

function stageFrom(status: AuthStatus): Stage {
  if (!status.credentials_configured) return 'needs-credentials'
  if (!status.authenticated) return 'needs-auth'
  return 'dashboard'
}

export default function App() {
  const [stage, setStage] = useState<Stage>('loading')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [devices, setDevices] = useState<Reading[]>([])
  const [goveeDevices, setGoveeDevices] = useState<GoveeReading[]>([])
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkStatus = useCallback(async () => {
    try {
      const status = await fetchAuthStatus()
      setStage(stageFrom(status))
    } catch {
      setStage('needs-credentials')
    }
  }, [])

  const loadDevices = useCallback(async () => {
    try {
      const [nest, govee] = await Promise.all([fetchDevices(), fetchGoveeDevices()])
      setDevices(sortDevices(nest.devices))
      setGoveeDevices(govee.devices)
      setUpdatedAt(nest.timestamp)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load devices')
    }
  }, [])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  useEffect(() => {
    if (stage !== 'dashboard') {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    loadDevices()
    intervalRef.current = setInterval(loadDevices, REFRESH_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [stage, loadDevices])

  const handleConfigSaved = () => {
    checkStatus()
    if (stage === 'dashboard') loadDevices()
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (stage === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500 text-sm animate-pulse">Loading…</div>
      </div>
    )
  }

  // ── Needs credentials ──────────────────────────────────────────────────────
  if (stage === 'needs-credentials') {
    return (
      <>
        <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-100">Climate Dashboard</h1>
            <p className="text-slate-500 text-sm">Nest Learning Thermostat · Gen 4</p>
          </div>
          <p className="text-slate-400 text-sm max-w-sm">
            Enter your Google Cloud credentials to get started. They are stored only in this app's
            database — never in environment variables or k8s secrets.
          </p>
          <button
            onClick={() => setSettingsOpen(true)}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors"
          >
            Open Settings
          </button>
        </div>
        {settingsOpen && (
          <SettingsModal onClose={() => setSettingsOpen(false)} onConfigSaved={handleConfigSaved} />
        )}
      </>
    )
  }

  // ── Needs OAuth ────────────────────────────────────────────────────────────
  if (stage === 'needs-auth') {
    return (
      <>
        <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-100">Climate Dashboard</h1>
            <p className="text-slate-500 text-sm">Nest Learning Thermostat · Gen 4</p>
          </div>
          <p className="text-slate-400 text-sm max-w-sm">
            Credentials saved. Now authorize access to your Nest thermostats.
          </p>
          <a
            href="/api/auth/start"
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors"
          >
            Connect Google Nest →
          </a>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-xs text-slate-600 hover:text-slate-400 underline"
          >
            Edit credentials
          </button>
        </div>
        {settingsOpen && (
          <SettingsModal onClose={() => setSettingsOpen(false)} onConfigSaved={handleConfigSaved} />
        )}
      </>
    )
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  const lastUpdated = updatedAt ? format(parseISO(updatedAt), 'MMM d, h:mm:ss a') : null

  return (
    <>
      <div className="min-h-screen px-4 py-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">Climate Dashboard</h1>
            <p className="text-xs text-slate-500 mt-0.5">Nest Learning Thermostat · Gen 4</p>
          </div>
          <div className="flex items-center gap-4">
            {lastUpdated && <p className="text-xs text-slate-600">Updated {lastUpdated}</p>}
            <button
              onClick={() => setSettingsOpen(true)}
              title="Settings"
              className="text-slate-600 hover:text-slate-300 transition-colors text-lg"
            >
              ⚙
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {devices.length === 0 && goveeDevices.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm space-y-2">
            <p>No data yet — readings are collected every 5 minutes.</p>
            <p className="text-xs">
              If this persists, open{' '}
              <button onClick={() => setSettingsOpen(true)} className="underline">
                Settings
              </button>{' '}
              and verify your credentials.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {devices.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Thermostats</h2>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {devices.map((d) => (
                    <ThermostatPanel key={d.device_id} current={d} />
                  ))}
                </div>
              </section>
            )}
            {goveeDevices.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Hygrometers</h2>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {goveeDevices.map((d) => (
                    <GoveePanel key={d.device_id} current={d} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-4 text-xs text-slate-600 justify-center">
          <span className="flex items-center gap-1.5">
            <span className="w-8 border-t-2 border-slate-300 inline-block" />
            Actual temp
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-8 border-t-2 border-dashed border-orange-400 inline-block" />
            Heat setpoint
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-8 border-t-2 border-dashed border-sky-400 inline-block" />
            Cool setpoint
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-3 bg-red-500/20 border border-red-500/30 inline-block rounded-sm" />
            Heating active
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-3 bg-blue-500/20 border border-blue-500/30 inline-block rounded-sm" />
            Cooling active
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-8 border-t-2 border-indigo-400 inline-block" />
            Humidity
          </span>
        </div>
      </div>

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} onConfigSaved={handleConfigSaved} />
      )}
    </>
  )
}
