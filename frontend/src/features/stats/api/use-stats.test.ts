import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDebouncedValue, useStatsQuery } from './use-stats';
import type { StatsFilters } from '../types';

// Mock stats-api
vi.mock('./stats-api', () => ({
  apiGetStats: vi.fn(),
}));

import { apiGetStats } from './stats-api';
const mockApiGetStats = vi.mocked(apiGetStats);

// ── Helpers ───────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

const baseFilters: StatsFilters = {
  from: '2026-01-01',
  to: '2026-04-30',
  projectId: 'all',
  granularity: 'month',
  preset: 'last30',
};

const mockResponse = {
  summary: {
    totalPieces: 5,
    totalGrams: 200,
    totalCost: 10,
    totalSecs: 3600,
    avgCostPerPiece: 2,
    projectCount: 1,
  },
  timeSeries: [],
  byProject: [],
};

// ── useDebouncedValue ─────────────────────────────────────────────────────

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('devuelve el valor inicial inmediatamente', () => {
    const { result } = renderHook(() => useDebouncedValue('inicial', 300));
    expect(result.current).toBe('inicial');
  });

  it('no actualiza el valor antes de que pase el delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'b' });
    act(() => { vi.advanceTimersByTime(100); });

    expect(result.current).toBe('a'); // todavía el valor anterior
  });

  it('actualiza el valor después del delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'b' });
    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current).toBe('b');
  });
});

// ── useStatsQuery ─────────────────────────────────────────────────────────
// Nota: los tests de useStatsQuery usan timers reales para evitar conflictos
// entre vi.useFakeTimers() y el polling interno de waitFor / React Query.

describe('useStatsQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGetStats.mockResolvedValue(mockResponse);
  });

  it('llama apiGetStats con los filtros correctos', async () => {
    const { result } = renderHook(
      () => useStatsQuery(baseFilters),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 3000 });

    expect(mockApiGetStats).toHaveBeenCalledWith({
      from: '2026-01-01',
      to: '2026-04-30',
      projectId: 'all',
      granularity: 'month',
    });
  });

  it('devuelve los datos del summary correctamente', async () => {
    const { result } = renderHook(
      () => useStatsQuery(baseFilters),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 3000 });

    expect(result.current.data?.summary.totalPieces).toBe(5);
  });

  it('no lanza la query cuando from está vacío', async () => {
    const { result } = renderHook(
      () => useStatsQuery({ ...baseFilters, from: '' }),
      { wrapper: createWrapper() },
    );

    // Esperar un tick para que React Query procese el estado inicial
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApiGetStats).not.toHaveBeenCalled();
  });
});
