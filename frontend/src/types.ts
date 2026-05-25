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

export interface ConfigStatus {
  google_client_id: boolean
  google_client_secret: boolean
  sdm_project_id: boolean
  google_refresh_token: boolean
  upstairs_device_id: boolean
  downstairs_device_id: boolean
}

export interface AuthStatus {
  credentials_configured: boolean
  authenticated: boolean
}

export interface ConfigPayload {
  google_client_id?: string
  google_client_secret?: string
  sdm_project_id?: string
  upstairs_device_id?: string
  downstairs_device_id?: string
}

export type RangeHours = 1 | 6 | 24 | 168 | 720
