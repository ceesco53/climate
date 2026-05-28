import axios from 'axios'
import type {
  AuthStatus, ConfigPayload, ConfigStatus,
  DevicesResponse, HistoryResponse,
  GoveeDevicesResponse, GoveeHistoryResponse, GoveeDiscoverDevice,
} from './types'

export async function fetchConfigStatus(): Promise<ConfigStatus> {
  const { data } = await axios.get<ConfigStatus>('/api/config/status')
  return data
}

export async function saveConfig(payload: ConfigPayload): Promise<void> {
  await axios.post('/api/config', payload)
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const { data } = await axios.get<AuthStatus>('/api/auth/status')
  return data
}

export async function fetchDevices(): Promise<DevicesResponse> {
  const { data } = await axios.get<DevicesResponse>('/api/devices')
  return data
}

export async function fetchHistory(deviceId: string, hours: number): Promise<HistoryResponse> {
  const { data } = await axios.get<HistoryResponse>('/api/history', {
    params: { device_id: deviceId, hours },
  })
  return data
}

export async function fetchGoveeDevices(): Promise<GoveeDevicesResponse> {
  const { data } = await axios.get<GoveeDevicesResponse>('/api/govee/devices')
  return data
}

export async function fetchGoveeHistory(deviceId: string, hours: number): Promise<GoveeHistoryResponse> {
  const { data } = await axios.get<GoveeHistoryResponse>('/api/govee/history', {
    params: { device_id: deviceId, hours },
  })
  return data
}

export async function discoverGoveeDevices(): Promise<GoveeDiscoverDevice[]> {
  const { data } = await axios.get<{ devices: GoveeDiscoverDevice[] }>('/api/govee/discover')
  return data.devices
}
