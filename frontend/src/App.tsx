import { useCallback, useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { fetchAuthStatus, fetchDevices } from './api'
import type { Reading } from './types'
import { ThermostatPanel } from './components/ThermostatPanel'

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

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [devices, setDevices] = useState<Reading[]>([])
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkAuth = useCallback(async () => {
    try {
      const { authenticated } = await fetchAuthStatus()
      setAuthenticated(authenticated)
    } catch {
      setAuthenticated(false)
    }
  }, [])

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetchDevices()
      setDevices(sortDevices(res.devices))
      setUpdatedAt(res.timestamp)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load devices')
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (!authenticated) return
    loadDevices()
    intervalRef.current = setInterval(loadDevices, REFRESH_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [authenticated, loadDevices])

  // Setup screen
  if (authenticated === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-slate-100">Climate Dashboard</h1>
          <p className="text-slate-400 text-sm max-w-sm">
            Connect your Google Nest account to start collecting thermostat data.
          </p>
        </div>
        <a
          href="/api/auth/start"
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors"
        >
          Connect Google Nest
        </a>
        <p className="text-slate-600 text-xs text-center max-w-xs">
          You'll need a Google Nest Device Access project. After connecting, data collection
          begins automatically every 5 minutes.
        </p>
      </div>
    )
  }

  // Loading
  if (authenticated === null || (authenticated && devices.length === 0 && !error)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500 text-sm animate-pulse">Loading thermostats…</div>
      </div>
    )
  }

  const lastUpdated = updatedAt
    ? format(parseISO(updatedAt), 'MMM d, h:mm:ss a')
    : null

  return (
    <div className="min-h-screen px-4 py-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">Climate Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">Nest Learning Thermostat · Gen 4</p>
        </div>
        {lastUpdated && (
          <p className="text-xs text-slate-600">Updated {lastUpdated}</p>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {devices.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm space-y-2">
          <p>No thermostat data yet.</p>
          <p className="text-xs">
            Data is collected every 5 minutes. Check that{' '}
            <code className="bg-surface-card px-1 rounded">UPSTAIRS_DEVICE_ID</code> and{' '}
            <code className="bg-surface-card px-1 rounded">DOWNSTAIRS_DEVICE_ID</code> env vars
            are set in your deployment.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {devices.map((d) => (
            <ThermostatPanel key={d.device_id} current={d} />
          ))}
        </div>
      )}

      {/* Legend */}
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
  )
}
