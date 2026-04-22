import type { StatsFilters, StatsResponse } from '../types';

const API_BASE = '';

/**
 * Fetch aggregated stats from the backend.
 * Matches GET /api/stats?from=&to=&projectId=&granularity=
 */
export async function apiGetStats(filters: Omit<StatsFilters, 'preset'>): Promise<StatsResponse> {
  const params = new URLSearchParams({
    from: filters.from,
    to: filters.to,
    projectId: filters.projectId,
    granularity: filters.granularity,
  });

  const res = await fetch(`${API_BASE}/api/stats?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<StatsResponse>;
}
