import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { apiGetStats } from './stats-api';
import type { StatsFilters } from '../types';

/** Debounce a value by `delay` ms. Useful to prevent API spam on typing. */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * React Query hook for stats.
 * Debounces custom date inputs (300 ms) so we don't hit the API on every keystroke.
 */
export function useStatsQuery(filters: StatsFilters) {
  const debouncedFrom = useDebouncedValue(filters.from, 300);
  const debouncedTo = useDebouncedValue(filters.to, 300);

  const queryKey = [
    'stats',
    debouncedFrom,
    debouncedTo,
    filters.projectId,
    filters.status,
    filters.granularity,
  ] as const;

  return useQuery({
    queryKey,
    queryFn: () =>
      apiGetStats({
        from: debouncedFrom,
        to: debouncedTo,
        projectId: filters.projectId,
        status: filters.status,
        granularity: filters.granularity,
      }),
    staleTime: 0, // always refetch on mount so saved/updated pieces are reflected immediately
    enabled: Boolean(debouncedFrom) && Boolean(debouncedTo),
  });
}

/** Stable ref to track previous filters for logging / debugging if needed */
export function useStatsFiltersRef(filters: StatsFilters) {
  const ref = useRef(filters);
  useEffect(() => { ref.current = filters; }, [filters]);
  return ref;
}
