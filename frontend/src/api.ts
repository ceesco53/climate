import axios from 'axios'
import type { AuthStatusResponse, DevicesResponse, HistoryResponse } from './types'

export async function fetchAuthStatus(): Promise<AuthStatusResponse> {
  const { data } = await axios.get<AuthStatusResponse>('/api/auth/status')
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
