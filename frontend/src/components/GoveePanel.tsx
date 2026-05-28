import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { format, parseISO } from 'date-fns'
import {
  Area, ComposedChart, CartesianGrid, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { fetchGoveeHistory } from '../api'
import type { GoveeReading, RangeHours } from '../types'

const RANGES: { label: string; hours: RangeHours }[] = [
  { label: '1H', hours: 1 },
  { label: '6H', hours: 6 },
  { label: '24H', hours: 24 },
  { label: '7D', hours: 168 },
  { label: '30D', hours: 720 },
]

function toF(c: number | null): string {
  if (c == null) return '—'
  return `${((c * 9) / 5 + 32).toFixed(1)}°F`
}

function tickFmt(rangeHours: RangeHours) {
  return (ts: string) => {
    try {
      const d = parseISO(ts)
      if (rangeHours <= 6) return format(d, 'h:mm a')
      if (rangeHours <= 24) return format(d, 'h a')
      if (rangeHours <= 168) return format(d, 'EEE h a')
      return format(d, 'MMM d')
    } catch { return '' }
  }
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  try {
    const ts = format(parseISO(label), 'MMM d, h:mm a')
    return (
      <div className="bg-surface-card border border-surface-border rounded-lg px-3 py-2 text-xs shadow-xl">
        <p className="text-slate-400 mb-1">{ts}</p>
        {payload.map((e: any) => (
          <p key={e.name} style={{ color: e.color }} className="leading-5">
            {e.name}: <span className="font-semibold">{e.value != null ? e.value : '—'}</span>
            {e.name === 'Humidity' ? '%' : e.value != null ? '°F' : ''}
          </p>
        ))}
      </div>
    )
  } catch { return null }
}

interface Props {
  current: GoveeReading
}

export function GoveePanel({ current }: Props) {
  const [rangeHours, setRangeHours] = useState<RangeHours>(24)
  const [history, setHistory] = useState<GoveeReading[]>([])
  const [loading, setLoading] = useState(true)

  const label = current.location || current.device_name

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchGoveeHistory(current.device_id, rangeHours)
      setHistory(res.readings)
    } finally {
      setLoading(false)
    }
  }, [current.device_id, rangeHours])

  useEffect(() => { load() }, [load])

  const chartData = history.map((r) => ({
    timestamp: r.timestamp,
    temp: r.temperature_c != null ? parseFloat(((r.temperature_c * 9) / 5 + 32).toFixed(1)) : null,
    humidity: r.humidity != null ? Math.round(r.humidity) : null,
  }))

  const fmt = tickFmt(rangeHours)
  const isOnline = current.online === 1
  const allTemps = chartData.flatMap(d => d.temp != null ? [d.temp] : [])
  const tempMin = allTemps.length ? Math.min(...allTemps) - 2 : 60
  const tempMax = allTemps.length ? Math.max(...allTemps) + 2 : 80

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">{label}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{current.sku ?? 'Govee Hygrometer'}</p>
        </div>
        <div className="flex gap-2 items-center">
          <span className={clsx(
            'px-2 py-0.5 rounded text-xs font-semibold',
            isOnline ? 'bg-emerald-900/60 text-emerald-300' : 'bg-slate-700 text-slate-400'
          )}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
          {current.battery != null && (
            <span className="px-2 py-0.5 rounded text-xs bg-slate-700/60 text-slate-400">
              {current.battery}%
            </span>
          )}
        </div>
      </div>

      {/* Current readings */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface rounded-lg p-3 text-center">
          <p className="text-3xl font-bold text-slate-100 tracking-tight">{toF(current.temperature_c)}</p>
          <p className="text-xs text-slate-500 mt-1">Temperature</p>
        </div>
        <div className="bg-surface rounded-lg p-3 text-center">
          <p className="text-3xl font-bold text-indigo-400 tracking-tight">
            {current.humidity != null ? `${Math.round(current.humidity)}%` : '—'}
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

      {/* Charts */}
      <div className={clsx('space-y-4 transition-opacity', loading ? 'opacity-40' : 'opacity-100')}>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
            No data yet — collecting every 5 minutes
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs text-slate-500 mb-1 ml-1">Temperature (°F)</p>
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="timestamp" tickFormatter={fmt} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#1f2937' }} tickLine={false} minTickGap={40} />
                  <YAxis domain={[tempMin, tempMax]} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}°`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="temp" name="Temp" stroke="#e2e8f0" strokeWidth={2} dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1 ml-1">Humidity (%)</p>
              <ResponsiveContainer width="100%" height={100}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="timestamp" tickFormatter={fmt} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#1f2937' }} tickLine={false} minTickGap={40} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="humidity" name="Humidity" stroke="#818cf8" fill="rgba(129,140,248,0.15)" strokeWidth={2} dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
