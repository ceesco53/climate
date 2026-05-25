import { useMemo } from 'react'
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import type { Reading, RangeHours } from '../types'

interface Props {
  readings: Reading[]
  rangeHours: RangeHours
}

function toF(c: number | null): number | null {
  if (c == null) return null
  return Math.round((c * 9) / 5 + 32)
}

interface HvacSegment {
  x1: string
  x2: string
  status: 'HEATING' | 'COOLING'
}

function buildHvacSegments(readings: Reading[]): HvacSegment[] {
  if (readings.length < 2) return []
  const segments: HvacSegment[] = []
  let segStart = readings[0]

  for (let i = 1; i < readings.length; i++) {
    if (readings[i].hvac_status !== segStart.hvac_status) {
      if (segStart.hvac_status === 'HEATING' || segStart.hvac_status === 'COOLING') {
        segments.push({ x1: segStart.timestamp, x2: readings[i].timestamp, status: segStart.hvac_status })
      }
      segStart = readings[i]
    }
  }
  const last = readings[readings.length - 1]
  if ((segStart.hvac_status === 'HEATING' || segStart.hvac_status === 'COOLING') && segStart !== last) {
    segments.push({ x1: segStart.timestamp, x2: last.timestamp, status: segStart.hvac_status })
  }
  return segments
}

function tickFormatter(rangeHours: RangeHours) {
  return (ts: string) => {
    try {
      const d = parseISO(ts)
      if (rangeHours <= 6) return format(d, 'h:mm a')
      if (rangeHours <= 24) return format(d, 'h a')
      if (rangeHours <= 168) return format(d, 'EEE h a')
      return format(d, 'MMM d')
    } catch {
      return ''
    }
  }
}

function tooltipLabelFormatter(ts: string) {
  try {
    return format(parseISO(ts), 'MMM d, h:mm a')
  } catch {
    return ts
  }
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface-card border border-surface-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{tooltipLabelFormatter(label)}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }} className="leading-5">
          {entry.name}: <span className="font-semibold">{entry.value != null ? entry.value : '—'}</span>
          {entry.name.includes('Humidity') ? '%' : entry.value != null ? '°F' : ''}
        </p>
      ))}
    </div>
  )
}

export function TimelineChart({ readings, rangeHours }: Props) {
  const chartData = useMemo(
    () =>
      readings.map((r) => ({
        timestamp: r.timestamp,
        ambient: toF(r.ambient_temp_c),
        heatSetpoint: r.thermostat_mode === 'COOL' || r.thermostat_mode === 'OFF' ? null : toF(r.heat_setpoint_c),
        coolSetpoint: r.thermostat_mode === 'HEAT' || r.thermostat_mode === 'OFF' ? null : toF(r.cool_setpoint_c),
        humidity: r.ambient_humidity != null ? Math.round(r.ambient_humidity) : null,
      })),
    [readings]
  )

  const hvacSegments = useMemo(() => buildHvacSegments(readings), [readings])
  const fmt = useMemo(() => tickFormatter(rangeHours), [rangeHours])

  if (readings.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
        No data yet — collecting every 5 minutes
      </div>
    )
  }

  const allTemps = chartData.flatMap((d) =>
    [d.ambient, d.heatSetpoint, d.coolSetpoint].filter((v): v is number => v != null)
  )
  const tempMin = allTemps.length ? Math.min(...allTemps) - 3 : 60
  const tempMax = allTemps.length ? Math.max(...allTemps) + 3 : 85

  return (
    <div className="space-y-4">
      {/* Temperature chart */}
      <div>
        <p className="text-xs text-slate-500 mb-1 ml-1">Temperature (°F)</p>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={fmt}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={{ stroke: '#1f2937' }}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={[tempMin, tempMax]}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}°`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 4 }}
              iconType="plainline"
            />

            {/* HVAC state background */}
            {hvacSegments.map((seg, i) => (
              <ReferenceArea
                key={i}
                x1={seg.x1}
                x2={seg.x2}
                fill={seg.status === 'HEATING' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)'}
                fillOpacity={1}
                ifOverflow="visible"
              />
            ))}

            <Line
              type="monotone"
              dataKey="ambient"
              name="Actual Temp"
              stroke="#e2e8f0"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="heatSetpoint"
              name="Heat Setpoint"
              stroke="#f97316"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="coolSetpoint"
              name="Cool Setpoint"
              stroke="#38bdf8"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Humidity chart */}
      <div>
        <p className="text-xs text-slate-500 mb-1 ml-1">Humidity (%)</p>
        <ResponsiveContainer width="100%" height={100}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={fmt}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={{ stroke: '#1f2937' }}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="humidity"
              name="Humidity"
              stroke="#818cf8"
              fill="rgba(129,140,248,0.15)"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
