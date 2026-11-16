import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type {
  Alert,
  Block,
  Crop,
  Farm,
  KioskBundle,
  Me,
  Plan,
  Reading,
  SaltClock,
  SoilTest,
  Source,
  Tank,
  WaterReport,
} from './types'
import { cacheBundle, loadCachedBundle } from '../kiosk/offline'

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/v1/me'), retry: false })
export const useFarms = () => useQuery({ queryKey: ['farms'], queryFn: () => api<Farm[]>('/api/v1/farms') })
export const useFarm = (id: string) =>
  useQuery({ queryKey: ['farm', id], queryFn: () => api<Farm>(`/api/v1/farms/${id}`) })
export const useCrops = () => useQuery({ queryKey: ['crops'], queryFn: () => api<Crop[]>('/api/v1/crops') })
export const useSources = (farmId: string) =>
  useQuery({ queryKey: ['sources', farmId], queryFn: () => api<Source[]>(`/api/v1/farms/${farmId}/sources`) })
export const useBlocks = (farmId: string) =>
  useQuery({ queryKey: ['blocks', farmId], queryFn: () => api<Block[]>(`/api/v1/farms/${farmId}/blocks`) })
export const useTanks = (farmId: string) =>
  useQuery({ queryKey: ['tanks', farmId], queryFn: () => api<Tank[]>(`/api/v1/farms/${farmId}/tanks`) })
export const usePlans = (farmId: string, day?: string) =>
  useQuery({
    queryKey: ['plans', farmId, day],
    queryFn: () => api<Plan[]>(`/api/v1/farms/${farmId}/plans${day ? `?day=${day}` : ''}`),
  })
export const useSoilTests = (farmId: string) =>
  useQuery({ queryKey: ['soil', farmId], queryFn: () => api<SoilTest[]>(`/api/v1/farms/${farmId}/soil-tests`) })
export const useReadings = (farmId: string, query: string) =>
  useQuery({
    queryKey: ['readings', farmId, query],
    queryFn: () => api<Reading[]>(`/api/v1/farms/${farmId}/readings?${query}`),
  })
export const useSaltClock = (farmId: string, sourceId: string | undefined) =>
  useQuery({
    queryKey: ['salt', farmId, sourceId],
    enabled: !!sourceId,
    queryFn: () => api<SaltClock>(`/api/v1/farms/${farmId}/salt-clock?source_id=${sourceId}`),
  })
export const useReport = (farmId: string, start: string, end: string) =>
  useQuery({
    queryKey: ['report', farmId, start, end],
    queryFn: () => api<WaterReport>(`/api/v1/farms/${farmId}/reports/water?start=${start}&end=${end}`),
  })
export const useAlerts = (farmId: string) =>
  useQuery({ queryKey: ['alerts', farmId], queryFn: () => api<Alert[]>(`/api/v1/farms/${farmId}/alerts`) })

export type BundleState = { bundle: KioskBundle; offline: boolean; cachedAt: string | null }

/** Kiosk data: live when reachable (and cached for later), today's cached copy when not. */
export async function fetchBundle(farmId?: string): Promise<BundleState> {
  try {
    const bundle = await api<KioskBundle>(`/api/v1/kiosk/bundle${farmId ? `?farm_id=${farmId}` : ''}`)
    await cacheBundle(bundle).catch(() => undefined)
    return { bundle, offline: false, cachedAt: null }
  } catch (err) {
    const cached = await loadCachedBundle()
    if (cached) return { bundle: cached.bundle, offline: true, cachedAt: cached.savedAt }
    throw err
  }
}

export const useKioskBundle = (farmId?: string) =>
  useQuery({
    queryKey: ['bundle', farmId],
    queryFn: () => fetchBundle(farmId),
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  })
