import axios from 'axios'
import type { AuthStatus, ConfigPayload, ConfigStatus, DevicesResponse, HistoryResponse } from './types'

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
