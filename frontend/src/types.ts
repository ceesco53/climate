export interface Reading {
  device_id: string
  display_name: string
  location: string | null
  timestamp: string
  ambient_temp_c: number | null
  ambient_humidity: number | null
  hvac_status: 'HEATING' | 'COOLING' | 'OFF' | null
  thermostat_mode: 'HEAT' | 'COOL' | 'HEATCOOL' | 'OFF' | null
  heat_setpoint_c: number | null
  cool_setpoint_c: number | null
}

export interface DevicesResponse {
  devices: Reading[]
  timestamp: string
}

export interface HistoryResponse {
  device_id: string
  hours: number
  readings: Reading[]
}

export interface AuthStatusResponse {
  authenticated: boolean
}

export type RangeHours = 1 | 6 | 24 | 168 | 720
