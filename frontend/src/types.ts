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
  govee_api_key: boolean
  govee_device_labels: boolean
}

export interface AuthStatus {
  credentials_configured: boolean
  authenticated: boolean
}

export interface GoveeReading {
  device_id: string
  device_name: string
  sku: string | null
  location: string | null
  timestamp: string
  temperature_c: number | null
  humidity: number | null
  battery: number | null
  online: number | null  // 1 = online, 0 = offline
}

export interface GoveeDevicesResponse {
  devices: GoveeReading[]
  timestamp: string
}

export interface GoveeHistoryResponse {
  device_id: string
  hours: number
  readings: GoveeReading[]
}

export interface GoveeDiscoverDevice {
  device_id: string
  device_name: string
  sku: string
}

export interface ConfigPayload {
  google_client_id?: string
  google_client_secret?: string
  sdm_project_id?: string
  upstairs_device_id?: string
  downstairs_device_id?: string
  govee_api_key?: string
  govee_device_labels?: string    // JSON string
  govee_selected_devices?: string // JSON string
}

export type RangeHours = 1 | 6 | 24 | 168 | 720
