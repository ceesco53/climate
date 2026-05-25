import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { fetchHistory } from '../api'
import type { Reading, RangeHours } from '../types'
import { TimelineChart } from './TimelineChart'

const RANGES: { label: string; hours: RangeHours }[] = [
  { label: '1H', hours: 1 },
  { label: '6H', hours: 6 },
  { label: '24H', hours: 24 },
  { label: '7D', hours: 168 },
  { label: '30D', hours: 720 },
]

function toF(c: number | null): string {
  if (c == null) return '—'
  return `${Math.round((c * 9) / 5 + 32)}°F`
}

function hvacBadge(status: Reading['hvac_status']) {
  if (status === 'HEATING')
    return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-900/60 text-red-300">Heating</span>
  if (status === 'COOLING')
    return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-900/60 text-blue-300">Cooling</span>
  return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-700 text-slate-400">Idle</span>
}

function modeBadge(mode: Reading['thermostat_mode']) {
  const labels: Record<string, string> = { HEAT: 'Heat', COOL: 'Cool', HEATCOOL: 'Heat·Cool', OFF: 'Off' }
  const label = mode ? (labels[mode] ?? mode) : '—'
  return <span className="px-2 py-0.5 rounded text-xs bg-slate-700/60 text-slate-400">{label}</span>
}

interface Props {
  current: Reading
}

export function ThermostatPanel({ current }: Props) {
  const [rangeHours, setRangeHours] = useState<RangeHours>(24)
  const [history, setHistory] = useState<Reading[]>([])
  const [loading, setLoading] = useState(true)

  const label = current.location
    ? current.location.charAt(0).toUpperCase() + current.location.slice(1)
    : current.display_name

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchHistory(current.device_id, rangeHours)
      setHistory(res.readings)
    } finally {
      setLoading(false)
    }
  }, [current.device_id, rangeHours])

  useEffect(() => {
    load()
  }, [load])

  const setpoint = () => {
    if (current.thermostat_mode === 'HEAT') return toF(current.heat_setpoint_c)
    if (current.thermostat_mode === 'COOL') return toF(current.cool_setpoint_c)
    if (current.thermostat_mode === 'HEATCOOL')
      return `${toF(current.heat_setpoint_c)} – ${toF(current.cool_setpoint_c)}`
    return '—'
  }

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">{label}</h2>
          <p className="text-xs text-slate-500 mt-0.5">Nest Learning Thermostat (4th Gen)</p>
        </div>
        <div className="flex gap-2 items-center">
          {hvacBadge(current.hvac_status)}
          {modeBadge(current.thermostat_mode)}
        </div>
      </div>

      {/* Current stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface rounded-lg p-3 text-center">
          <p className="text-3xl font-bold text-slate-100 tracking-tight">{toF(current.ambient_temp_c)}</p>
          <p className="text-xs text-slate-500 mt-1">Current</p>
        </div>
        <div className="bg-surface rounded-lg p-3 text-center">
          <p className="text-xl font-semibold text-amber-400 tracking-tight">{setpoint()}</p>
          <p className="text-xs text-slate-500 mt-1">Set Point</p>
        </div>
        <div className="bg-surface rounded-lg p-3 text-center">
          <p className="text-xl font-semibold text-indigo-400 tracking-tight">
            {current.ambient_humidity != null ? `${Math.round(current.ambient_humidity)}%` : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1">Humidity</p>
        </div>
      </div>

      {/* Range selector */}
      <div className="flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r.hours}
            onClick={() => setRangeHours(r.hours)}
            className={clsx(
              'flex-1 py-1 text-xs rounded font-medium transition-colors',
              rangeHours === r.hours
                ? 'bg-indigo-600 text-white'
                : 'bg-surface text-slate-400 hover:bg-surface-border hover:text-slate-200'
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Timeline charts */}
      <div className={clsx('transition-opacity', loading ? 'opacity-40' : 'opacity-100')}>
        <TimelineChart readings={history} rangeHours={rangeHours} />
      </div>
    </div>
  )
}
