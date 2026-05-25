import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { fetchConfigStatus, fetchDevices, saveConfig } from '../api'
import type { ConfigStatus, Reading } from '../types'

interface Props {
  onClose: () => void
  onConfigSaved: () => void
}

function StatusDot({ on }: { on: boolean }) {
  return (
    <span
      className={clsx(
        'inline-block w-2 h-2 rounded-full',
        on ? 'bg-emerald-400' : 'bg-red-500'
      )}
    />
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  const isSecret = type === 'password'
  return (
    <div className="space-y-1">
      <label className="block text-xs text-slate-400">{label}</label>
      <div className="flex">
        <input
          type={isSecret && !show ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 bg-surface border border-surface-border rounded-l px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="px-2.5 border border-l-0 border-surface-border rounded-r text-slate-500 hover:text-slate-300 text-xs"
          >
            {show ? 'hide' : 'show'}
          </button>
        )}
      </div>
    </div>
  )
}

export function SettingsModal({ onClose, onConfigSaved }: Props) {
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null)
  const [devices, setDevices] = useState<Reading[]>([])

  // Credential form
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [projectId, setProjectId] = useState('')
  const [credSaving, setCredSaving] = useState(false)
  const [credError, setCredError] = useState<string | null>(null)
  const [credSaved, setCredSaved] = useState(false)

  // Device assignment form
  const [upstairsId, setUpstairsId] = useState('')
  const [downstairsId, setDownstairsId] = useState('')
  const [deviceSaving, setDeviceSaving] = useState(false)
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [deviceSaved, setDeviceSaved] = useState(false)

  const overlayRef = useRef<HTMLDivElement>(null)

  const reload = async () => {
    const status = await fetchConfigStatus()
    setConfigStatus(status)
    try {
      const res = await fetchDevices()
      setDevices(res.devices)
    } catch {
      // Not authenticated yet — ignore
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const handleCredSave = async () => {
    setCredSaving(true)
    setCredError(null)
    setCredSaved(false)
    try {
      const payload: Record<string, string> = {}
      if (clientId.trim()) payload.google_client_id = clientId.trim()
      if (clientSecret.trim()) payload.google_client_secret = clientSecret.trim()
      if (projectId.trim()) payload.sdm_project_id = projectId.trim()
      await saveConfig(payload)
      setCredSaved(true)
      setClientId('')
      setClientSecret('')
      setProjectId('')
      await reload()
      onConfigSaved()
    } catch (e) {
      setCredError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setCredSaving(false)
    }
  }

  const handleDeviceSave = async () => {
    setDeviceSaving(true)
    setDeviceError(null)
    setDeviceSaved(false)
    try {
      await saveConfig({ upstairs_device_id: upstairsId, downstairs_device_id: downstairsId })
      setDeviceSaved(true)
      await reload()
      onConfigSaved()
    } catch (e) {
      setDeviceError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setDeviceSaving(false)
    }
  }

  const credentialsConfigured =
    configStatus?.google_client_id && configStatus.google_client_secret && configStatus.sdm_project_id

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div className="bg-surface-card border border-surface-border rounded-xl w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h2 className="font-semibold text-slate-100">Settings</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-7">
          {/* ── Section 1: Google credentials ───────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-300">Google Credentials</h3>
              {configStatus && (
                <div className="flex gap-1.5 items-center">
                  <StatusDot on={configStatus.google_client_id} />
                  <StatusDot on={configStatus.google_client_secret} />
                  <StatusDot on={configStatus.sdm_project_id} />
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Values are write-only — they are stored in the database and never returned by the API.
              Leave a field blank to keep the existing value.
            </p>
            <Field
              label="Google Client ID"
              value={clientId}
              onChange={setClientId}
              placeholder={configStatus?.google_client_id ? '(already set — enter to replace)' : 'xxxxxx.apps.googleusercontent.com'}
            />
            <Field
              label="Google Client Secret"
              value={clientSecret}
              onChange={setClientSecret}
              type="password"
              placeholder={configStatus?.google_client_secret ? '(already set — enter to replace)' : 'GOCSPX-…'}
            />
            <Field
              label="SDM Project ID"
              value={projectId}
              onChange={setProjectId}
              placeholder={configStatus?.sdm_project_id ? '(already set — enter to replace)' : 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
            />
            {credError && <p className="text-xs text-red-400">{credError}</p>}
            {credSaved && <p className="text-xs text-emerald-400">Saved.</p>}
            <button
              onClick={handleCredSave}
              disabled={credSaving || (!clientId && !clientSecret && !projectId)}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded transition-colors"
            >
              {credSaving ? 'Saving…' : 'Save credentials'}
            </button>
          </section>

          {/* ── Section 2: OAuth ─────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-300">Nest Authorization</h3>
              {configStatus && <StatusDot on={configStatus.google_refresh_token} />}
            </div>
            {configStatus?.google_refresh_token ? (
              <p className="text-xs text-emerald-400">Connected — Google account authorized.</p>
            ) : (
              <p className="text-xs text-slate-500">
                After saving credentials above, authorize access to your Nest thermostats.
              </p>
            )}
            <a
              href="/api/auth/start"
              className={clsx(
                'inline-block px-4 py-1.5 text-sm font-medium rounded transition-colors',
                credentialsConfigured
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-slate-700 text-slate-500 pointer-events-none'
              )}
            >
              {configStatus?.google_refresh_token ? 'Re-authorize Google Nest' : 'Connect Google Nest →'}
            </a>
          </section>

          {/* ── Section 3: Thermostat assignment ─────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-300">Thermostat Labels</h3>
              {configStatus && (
                <div className="flex gap-1.5 items-center">
                  <StatusDot on={configStatus.upstairs_device_id} />
                  <StatusDot on={configStatus.downstairs_device_id} />
                </div>
              )}
            </div>
            {devices.length === 0 ? (
              <p className="text-xs text-slate-500">
                Authorize Google Nest first to see your thermostats here.
              </p>
            ) : (
              <>
                <p className="text-xs text-slate-500">
                  Assign which thermostat is upstairs and which is downstairs.
                </p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="block text-xs text-slate-400">Upstairs thermostat</label>
                    <select
                      value={upstairsId}
                      onChange={(e) => setUpstairsId(e.target.value)}
                      className="w-full bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">— select —</option>
                      {devices.map((d) => (
                        <option key={d.device_id} value={d.device_id}>
                          {d.display_name} ({d.device_id.slice(-6)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-slate-400">Downstairs thermostat</label>
                    <select
                      value={downstairsId}
                      onChange={(e) => setDownstairsId(e.target.value)}
                      className="w-full bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">— select —</option>
                      {devices.map((d) => (
                        <option key={d.device_id} value={d.device_id}>
                          {d.display_name} ({d.device_id.slice(-6)})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {deviceError && <p className="text-xs text-red-400">{deviceError}</p>}
                {deviceSaved && <p className="text-xs text-emerald-400">Saved.</p>}
                <button
                  onClick={handleDeviceSave}
                  disabled={deviceSaving || !upstairsId || !downstairsId}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded transition-colors"
                >
                  {deviceSaving ? 'Saving…' : 'Save labels'}
                </button>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
